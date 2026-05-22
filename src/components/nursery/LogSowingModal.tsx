import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Sprout, Loader2, Check } from "lucide-react";
import toast from "react-hot-toast";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { logSowing } from "../../services/nurseryService";
import { Logger } from "../../lib/errorHandler";
import { logEvent, EVENT } from "../../events/registry";

interface Props {
  homeId: string;
  packetId: string;
  /** Shown in the header so the user knows which packet they're sowing. */
  packetLabel: string;
  onClose: () => void;
  onLogged?: (sowingId: string) => void;
}

const todayIso = () => new Date().toISOString().split("T")[0];

/**
 * Slim modal for recording a new sowing against a packet. Creates a
 * `seed_sowings` row at status='sown'. The observation + plant-out come
 * later via the packet detail's action bar.
 */
export default function LogSowingModal({
  homeId, packetId, packetLabel, onClose, onLogged,
}: Props) {
  const trapRef = useFocusTrap<HTMLDivElement>(true);
  const [sownOn, setSownOn] = useState<string>(todayIso());
  const [sownCount, setSownCount] = useState<number>(10);
  const [notes, setNotes] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = "unset"; };
  }, []);

  const canSave = sownCount > 0 && sownCount <= 1000 && !!sownOn;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const row = await logSowing({
        home_id: homeId,
        seed_packet_id: packetId,
        sown_on: sownOn,
        sown_count: sownCount,
        notes: notes.trim() || null,
      });
      logEvent(EVENT.NURSERY_SOWING_LOGGED, {
        packet_id: packetId,
        sown_count: sownCount,
      });
      toast.success(`${sownCount} seeds sown. Check back in a week or two.`);
      onLogged?.(row.id);
      onClose();
    } catch (err) {
      Logger.error("LogSowingModal save failed", err, { packetId });
      setError(err instanceof Error ? err.message : "Couldn't log the sowing.");
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div
      data-testid="log-sowing-modal"
      className="fixed inset-0 z-[110] flex items-end sm:items-center sm:justify-center bg-black/40 backdrop-blur-sm animate-in fade-in"
      onClick={onClose}
    >
      <div
        ref={trapRef}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full sm:max-w-md bg-rhozly-bg rounded-t-3xl sm:rounded-3xl shadow-2xl border border-rhozly-outline/15 flex flex-col max-h-[90vh] overflow-hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <header className="shrink-0 px-5 pt-4 pb-3 flex items-start justify-between gap-3 border-b border-rhozly-outline/10">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-primary mb-0.5 flex items-center gap-1">
              <Sprout size={11} />
              Log a sowing
            </p>
            <h2 className="font-display font-black text-rhozly-on-surface text-base leading-tight truncate">
              {packetLabel}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-10 h-10 rounded-2xl bg-white border border-rhozly-outline/15 text-rhozly-on-surface/60 hover:text-rhozly-primary flex items-center justify-center"
          >
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div data-testid="log-sowing-date">
              <label className="block text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/55 mb-1.5">
                Sown on
              </label>
              <input
                type="date"
                value={sownOn}
                onChange={(e) => setSownOn(e.target.value)}
                max={todayIso()}
                className="w-full px-3 py-2.5 min-h-[44px] rounded-xl bg-white border border-rhozly-outline/20 text-sm font-bold text-rhozly-on-surface focus:outline-none focus:border-rhozly-primary/40 focus:ring-2 focus:ring-rhozly-primary/15"
              />
            </div>
            <div data-testid="log-sowing-count">
              <label className="block text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/55 mb-1.5">
                Seeds sown
              </label>
              <input
                type="number"
                min={1}
                max={1000}
                value={sownCount}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setSownCount(Number.isFinite(next) ? next : 0);
                }}
                className="w-full px-3 py-2.5 min-h-[44px] rounded-xl bg-white border border-rhozly-outline/20 text-sm font-bold text-rhozly-on-surface focus:outline-none focus:border-rhozly-primary/40 focus:ring-2 focus:ring-rhozly-primary/15"
              />
            </div>
          </div>

          <div data-testid="log-sowing-notes">
            <label className="block text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/55 mb-1.5">
              Notes <span className="text-rhozly-on-surface/30 normal-case font-bold">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="e.g. south windowsill, peat-free compost, heat mat on"
              className="w-full px-3 py-2.5 rounded-xl bg-white border border-rhozly-outline/20 text-sm font-bold text-rhozly-on-surface focus:outline-none focus:border-rhozly-primary/40 focus:ring-2 focus:ring-rhozly-primary/15 resize-none"
            />
          </div>

          <p className="text-[11px] text-rhozly-on-surface/55 leading-snug">
            We'll mark this sowing as "awaiting germination". Once you can count
            sprouts, tap <span className="font-black text-rhozly-on-surface/80">Observe</span> on the
            packet to log how many came up.
          </p>

          {error && <p className="text-xs font-bold text-red-600">{error}</p>}
        </div>

        <footer className="shrink-0 px-5 py-3 border-t border-rhozly-outline/10 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 min-h-[40px] rounded-xl text-rhozly-on-surface/60 hover:text-rhozly-on-surface text-[11px] font-black uppercase tracking-widest"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="log-sowing-save"
            onClick={handleSave}
            disabled={!canSave || saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] rounded-xl bg-rhozly-primary text-white text-[11px] font-black uppercase tracking-widest hover:opacity-95 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
            Save sowing
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
