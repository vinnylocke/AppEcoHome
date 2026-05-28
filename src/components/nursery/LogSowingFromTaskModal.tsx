import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Sprout, Loader2, X } from "lucide-react";
import toast from "react-hot-toast";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { supabase } from "../../lib/supabase";
import { Logger } from "../../lib/errorHandler";
import { commitSowingFromTask } from "../../services/sowingAutoCreateService";

interface Props {
  isOpen: boolean;
  homeId: string;
  taskId: string;
  packetId: string;
  /** Optional — used for the modal headline. */
  taskTitle?: string;
  onClose: () => void;
  onLogged?: (sowingId: string) => void;
  /** Optional dismiss handler — called when the user picks "skip". */
  onSkip?: () => void;
}

/**
 * Lightweight inline modal shown right after a Planting task tied to a
 * seed packet is marked done. Asks for the seed count (with packet
 * context shown so the user doesn't lose track of which packet they're
 * logging against), writes a `seed_sowings` row on confirm, and
 * surfaces a deep link to the Nursery.
 *
 * The user can "Skip" — no sowing is created. This is intentional: the
 * UX cost of an interruptive modal needs an escape hatch.
 */
export default function LogSowingFromTaskModal({
  isOpen,
  homeId,
  taskId,
  packetId,
  taskTitle,
  onClose,
  onLogged,
  onSkip,
}: Props) {
  const [sownCount, setSownCount] = useState(6);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [packetLabel, setPacketLabel] = useState<string | null>(null);
  const trapRef = useFocusTrap<HTMLDivElement>(isOpen);

  // Fetch a packet headline so the modal reads "Sowed Sungold (Suttons)"
  // not just "Sowing logged" — helpful for users who routinely sow from
  // several packets in one session.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("seed_packets")
        .select("variety, vendor, plant_id, plants(common_name)")
        .eq("id", packetId)
        .maybeSingle();
      if (cancelled || error || !data) return;
      const variety = (data.variety ?? "").trim();
      const plantName = (data as any).plants?.common_name ?? null;
      const vendor = (data.vendor ?? "").trim();
      const headline =
        [variety || plantName, vendor].filter(Boolean).join(" · ") || "this packet";
      setPacketLabel(headline);
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, packetId]);

  const handleSave = async () => {
    if (sownCount < 1) {
      toast.error("Enter a count of 1 or more.");
      return;
    }
    setSaving(true);
    try {
      const sowingId = await commitSowingFromTask({
        homeId,
        taskId,
        packetId,
        sownCount,
        notes: notes.trim() || null,
      });
      if (sowingId) {
        toast.success("Sowing logged in the Nursery.");
        onLogged?.(sowingId);
      } else {
        // Idempotency no-op (uncomplete + recomplete) — close silently.
      }
      onClose();
    } catch (err) {
      Logger.error("LogSowingFromTaskModal: save failed", err, { taskId, packetId });
      toast.error("Couldn't log the sowing — try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = () => {
    onSkip?.();
    onClose();
  };

  if (!isOpen) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-rhozly-bg/95 backdrop-blur-xl animate-in fade-in duration-300"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="log-sowing-task-title"
        className="bg-rhozly-surface-lowest w-full max-w-md max-h-[90vh] overflow-y-auto custom-scrollbar rounded-3xl shadow-2xl border border-rhozly-outline/20"
      >
        <div className="px-6 py-5 border-b border-rhozly-outline/10 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-2xl bg-rhozly-primary/10 text-rhozly-primary">
              <Sprout size={18} />
            </div>
            <div>
              <h2
                id="log-sowing-task-title"
                className="text-base font-black text-rhozly-on-surface"
              >
                Log this sowing
              </h2>
              <p className="text-xs font-bold text-rhozly-on-surface/50 mt-0.5 leading-relaxed">
                {taskTitle ? `Task: ${taskTitle}` : null}
                {taskTitle && packetLabel ? " · " : null}
                {packetLabel ? `Packet: ${packetLabel}` : null}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Close"
            className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-rhozly-on-surface/40 hover:bg-rhozly-surface-low hover:text-rhozly-on-surface transition-colors disabled:opacity-50"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label
              htmlFor="log-sowing-count"
              className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-1.5 block"
            >
              How many seeds did you sow?
            </label>
            <input
              id="log-sowing-count"
              type="number"
              inputMode="numeric"
              min={1}
              max={1000}
              value={sownCount}
              onChange={(e) => setSownCount(Number(e.target.value))}
              data-testid="log-sowing-count"
              className="w-full px-4 py-3 bg-rhozly-surface-low rounded-2xl font-black text-lg border border-transparent focus:border-rhozly-primary outline-none"
            />
            <p className="text-[10px] font-bold text-rhozly-on-surface/40 mt-1.5">
              Best guess is fine — you can adjust later from the Nursery.
            </p>
          </div>

          <div>
            <label
              htmlFor="log-sowing-notes"
              className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-1.5 block"
            >
              Notes (optional)
            </label>
            <textarea
              id="log-sowing-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Tray A · 4 per cell · seed compost"
              data-testid="log-sowing-notes"
              className="w-full px-4 py-2.5 bg-rhozly-surface-low rounded-2xl font-bold text-sm border border-transparent focus:border-rhozly-primary outline-none resize-y"
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-rhozly-outline/10 flex gap-2 justify-end">
          <button
            type="button"
            onClick={handleSkip}
            disabled={saving}
            data-testid="log-sowing-skip"
            className="px-4 py-2.5 rounded-xl text-sm font-bold text-rhozly-on-surface/60 hover:bg-rhozly-surface-low transition-colors disabled:opacity-50"
          >
            Skip
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            data-testid="log-sowing-save"
            className="inline-flex items-center gap-2 bg-rhozly-primary text-white text-sm font-black px-5 py-2.5 rounded-xl hover:opacity-90 active:scale-95 transition disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Sprout size={14} />}
            Log sowing
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
