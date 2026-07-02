import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, CheckCircle2, Loader2, Check } from "lucide-react";
import toast from "react-hot-toast";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { observeSowing, type SeedSowing } from "../../services/nurseryService";
import { Logger } from "../../lib/errorHandler";
import { logEvent, EVENT } from "../../events/registry";
import { getLocalDateString } from "../../lib/taskEngine";

interface Props {
  /** The sowing being observed — needs at least id, sown_on and sown_count. */
  sowing: Pick<SeedSowing, "id" | "sown_on" | "sown_count" | "germinated_count" | "observed_on">;
  packetLabel: string;
  onClose: () => void;
  onSaved?: () => void;
}

const todayIso = () => getLocalDateString(new Date());

/**
 * Records the germinated_count + observed_on for a sowing. Moves the
 * sowing's status from 'sown' to 'germinated'. Pre-populates with any
 * prior observation so a user revising the count starts from the last value.
 */
export default function ObserveGerminationModal({
  sowing, packetLabel, onClose, onSaved,
}: Props) {
  const trapRef = useFocusTrap<HTMLDivElement>(true);
  const [observedOn, setObservedOn] = useState<string>(
    sowing.observed_on ?? todayIso(),
  );
  const [germinated, setGerminated] = useState<number>(
    sowing.germinated_count ?? Math.round(sowing.sown_count / 2),
  );
  const [notes, setNotes] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = "unset"; };
  }, []);

  const ratePct = sowing.sown_count > 0
    ? Math.round((germinated / sowing.sown_count) * 100)
    : 0;

  const canSave =
    !!observedOn &&
    germinated >= 0 &&
    germinated <= sowing.sown_count;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await observeSowing({
        sowing_id: sowing.id,
        observed_on: observedOn,
        germinated_count: germinated,
        notes: notes.trim() || null,
      });
      logEvent(EVENT.NURSERY_SOWING_OBSERVED, {
        sowing_id: sowing.id,
        sown_count: sowing.sown_count,
        germinated_count: germinated,
        rate_pct: ratePct,
      });
      toast.success(
        germinated > 0
          ? `${germinated} of ${sowing.sown_count} sprouted (${ratePct}%).`
          : `Logged ${sowing.sown_count} as no-show. Try again with fresh stock?`,
      );
      onSaved?.();
      onClose();
    } catch (err) {
      Logger.error("ObserveGerminationModal save failed", err, { sowingId: sowing.id });
      setError(err instanceof Error ? err.message : "Couldn't save the observation.");
    } finally {
      setSaving(false);
    }
  };

  const rateTone =
    ratePct >= 70
      ? "text-emerald-700 bg-emerald-50 border-emerald-200"
      : ratePct >= 40
        ? "text-amber-700 bg-amber-50 border-amber-200"
        : "text-red-700 bg-red-50 border-red-200";

  return createPortal(
    <div
      data-testid="observe-germination-modal"
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
              <CheckCircle2 size={11} />
              Observe germination
            </p>
            <h2 className="font-display font-black text-rhozly-on-surface text-base leading-tight truncate">
              {packetLabel}
            </h2>
            <p className="text-[11px] text-rhozly-on-surface/55 mt-0.5">
              Sown {sowing.sown_count} on {formatShortDate(sowing.sown_on)}
            </p>
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
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/55 mb-1.5">
              Observed on
            </label>
            <input
              type="date"
              value={observedOn}
              onChange={(e) => setObservedOn(e.target.value)}
              min={sowing.sown_on}
              max={todayIso()}
              data-testid="observe-date"
              className="w-full px-3 py-2.5 min-h-[44px] rounded-xl bg-white border border-rhozly-outline/20 text-sm font-bold text-rhozly-on-surface focus:outline-none focus:border-rhozly-primary/40 focus:ring-2 focus:ring-rhozly-primary/15"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/55">
                Germinated
              </label>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-black uppercase tracking-widest ${rateTone}`}
              >
                {ratePct}%
              </span>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={sowing.sown_count}
                value={germinated}
                onChange={(e) => setGerminated(Number(e.target.value))}
                data-testid="observe-slider"
                className="flex-1 accent-rhozly-primary"
              />
              <input
                type="number"
                min={0}
                max={sowing.sown_count}
                value={germinated}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setGerminated(
                    Number.isFinite(n)
                      ? Math.max(0, Math.min(sowing.sown_count, n))
                      : 0,
                  );
                }}
                data-testid="observe-input"
                className="w-20 px-3 py-2 min-h-[40px] rounded-xl bg-white border border-rhozly-outline/20 text-sm font-bold text-rhozly-on-surface text-center focus:outline-none focus:border-rhozly-primary/40 focus:ring-2 focus:ring-rhozly-primary/15"
              />
              <span className="text-[11px] font-bold text-rhozly-on-surface/55 shrink-0">
                / {sowing.sown_count}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/55 mb-1.5">
              Notes <span className="text-rhozly-on-surface/30 normal-case font-bold">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="e.g. uneven germination, damping off on two"
              className="w-full px-3 py-2.5 rounded-xl bg-white border border-rhozly-outline/20 text-sm font-bold text-rhozly-on-surface focus:outline-none focus:border-rhozly-primary/40 focus:ring-2 focus:ring-rhozly-primary/15 resize-none"
            />
          </div>

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
            data-testid="observe-save"
            onClick={handleSave}
            disabled={!canSave || saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] rounded-xl bg-rhozly-primary text-white text-[11px] font-black uppercase tracking-widest hover:opacity-95 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
            Save observation
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
