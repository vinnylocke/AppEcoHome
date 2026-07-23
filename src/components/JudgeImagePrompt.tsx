import { createPortal } from "react-dom";
import { useEffect } from "react";
import { Check, Loader2, ImageOff } from "lucide-react";

/**
 * Shared "is this the right photo?" prompt for the image tap → right/wrong →
 * replace feature (docs/plans/image-judge-and-replace.md). Presentational: the
 * parent owns the reject → fetch-replacement → save flow and toggles `busy`
 * while a replacement is being fetched + applied.
 *
 * Used on owned surfaces only (Shed plant card + detail, Watchlist ailment card
 * + detail). Per-entity testids via `testIdSuffix` so Playwright can target a
 * specific card in a grid.
 */
interface Props {
  open: boolean;
  name: string;
  /** True while fetching + applying a replacement after a "Wrong" verdict. */
  busy?: boolean;
  onRight: () => void;
  onWrong: () => void;
  onClose: () => void;
  /** Stable per-entity suffix, e.g. `plant-123` or `ailment-<uuid>`. */
  testIdSuffix: string;
  /** Optional override for the "wrong" copy (e.g. "Add a photo" when null image). */
  wrongLabel?: string;
}

export default function JudgeImagePrompt({
  open,
  name,
  busy = false,
  onRight,
  onWrong,
  onClose,
  testIdSuffix,
  wrongLabel = "Wrong",
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={() => {
        if (!busy) onClose();
      }}
      data-testid={`judge-image-prompt-${testIdSuffix}`}
    >
      <div
        className="w-full sm:w-80 bg-white rounded-t-3xl sm:rounded-3xl shadow-xl border border-rhozly-outline/15 p-5 animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Is this the right photo of ${name}?`}
      >
        {busy ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <Loader2 size={26} className="animate-spin text-rhozly-primary" />
            <p className="text-sm font-bold text-rhozly-on-surface">Finding another photo…</p>
          </div>
        ) : (
          <>
            <p className="text-sm font-black text-rhozly-on-surface text-center">
              Is this the right photo of <span className="text-rhozly-primary">{name}</span>?
            </p>
            <p className="text-xs text-rhozly-on-surface/50 font-semibold text-center mt-1">
              If it's wrong we'll swap in another.
            </p>
            <div className="flex gap-2.5 mt-4">
              <button
                data-testid={`judge-image-wrong-${testIdSuffix}`}
                onClick={onWrong}
                className="flex-1 flex items-center justify-center gap-2 min-h-[44px] rounded-xl bg-rhozly-surface-low text-rhozly-on-surface font-black text-sm border border-rhozly-outline/15 can-hover:hover:bg-rhozly-surface active:scale-[0.98] transition"
              >
                <ImageOff size={16} /> {wrongLabel}
              </button>
              <button
                data-testid={`judge-image-right-${testIdSuffix}`}
                onClick={onRight}
                className="flex-1 flex items-center justify-center gap-2 min-h-[44px] rounded-xl bg-rhozly-primary text-white font-black text-sm active:scale-[0.98] transition"
              >
                <Check size={16} /> Right
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
