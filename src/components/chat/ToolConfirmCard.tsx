import React, { useEffect, useRef, useState } from "react";
import { Check, X, Loader2, AlertCircle, RotateCcw, AlertTriangle } from "lucide-react";

/**
 * Inline confirmation card rendered by PlantDoctorChat when the agent
 * proposes a mutation tool call.
 *
 * Risk levels:
 *   - `confirm`         → single-tap Confirm button (Phase 2)
 *   - `strong_confirm`  → hold-to-confirm 1s; styled with a warning border;
 *                         Undo button stays visible for 24 hours (Phase 4)
 *
 * Visual states:
 *   - pending    → buttons
 *   - executing  → spinner
 *   - done       → success + Undo
 *   - failed     → error
 *   - cancelled  → fades to a quiet dismissed state
 */

export interface PendingCall {
  id: string;
  tool: string;
  args: any;
  risk_level: "confirm" | "strong_confirm";
  preview: string;
}

export type ConfirmState =
  | { kind: "pending" }
  | { kind: "executing" }
  | { kind: "done"; summary: string; affected_row_refs?: any }
  | { kind: "failed"; error: string }
  | { kind: "cancelled" };

interface Props {
  call: PendingCall;
  state: ConfirmState;
  onConfirm: () => void;
  onCancel: () => void;
  onUndo: () => void;
}

const STRONG_HOLD_MS = 1000;

export default function ToolConfirmCard({
  call,
  state,
  onConfirm,
  onCancel,
  onUndo,
}: Props) {
  const isStrong = call.risk_level === "strong_confirm";
  const [undoExpanded, setUndoExpanded] = useState(true);
  const [holdProgress, setHoldProgress] = useState(0);
  const holdTimerRef = useRef<number | null>(null);
  const holdStartRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  // Undo button collapse: 60s for confirm, 24h for strong_confirm.
  useEffect(() => {
    if (state.kind !== "done") return;
    const ms = isStrong ? 24 * 60 * 60_000 : 60_000;
    const t = setTimeout(() => setUndoExpanded(false), ms);
    return () => clearTimeout(t);
  }, [state.kind, isStrong]);

  // Cancel any hold-to-confirm progress when state changes.
  useEffect(() => {
    if (state.kind !== "pending") {
      stopHold();
    }
  }, [state.kind]);

  const stopHold = () => {
    if (holdTimerRef.current !== null) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    holdStartRef.current = null;
    setHoldProgress(0);
  };

  const startHold = () => {
    if (state.kind !== "pending") return;
    holdStartRef.current = Date.now();
    const tick = () => {
      const start = holdStartRef.current;
      if (start === null) return;
      const elapsed = Date.now() - start;
      const pct = Math.min(1, elapsed / STRONG_HOLD_MS);
      setHoldProgress(pct);
      if (pct < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    holdTimerRef.current = window.setTimeout(() => {
      stopHold();
      onConfirm();
    }, STRONG_HOLD_MS);
  };

  if (state.kind === "cancelled") {
    return (
      <div
        data-testid={`tool-cancel-${call.id}`}
        className="mt-2 rounded-2xl bg-rhozly-surface-low border border-rhozly-outline/15 px-3 py-2 text-xs text-rhozly-on-surface/50 italic"
      >
        Cancelled — nothing was changed.
      </div>
    );
  }

  if (state.kind === "failed") {
    return (
      <div
        data-testid={`tool-failed-${call.id}`}
        className="mt-2 rounded-2xl bg-rose-50 border border-rose-200 px-3 py-2.5 text-xs space-y-1"
      >
        <div className="flex items-center gap-2 text-rose-700 font-bold">
          <AlertCircle size={12} />
          Couldn't run that action.
        </div>
        <p className="text-rose-700/80">{state.error}</p>
      </div>
    );
  }

  if (state.kind === "done") {
    return (
      <div
        data-testid={`tool-done-${call.id}`}
        className="mt-2 rounded-2xl bg-emerald-50 border border-emerald-200 px-3 py-2.5 text-xs space-y-2"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-emerald-700 font-bold">
            <Check size={12} />
            {state.summary}
          </div>
          {undoExpanded && (
            <button
              type="button"
              onClick={onUndo}
              data-testid={`tool-undo-${call.id}`}
              className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-emerald-700/70 hover:text-emerald-800 transition-colors"
            >
              <RotateCcw size={10} /> Undo {isStrong && <span className="opacity-60">(24h)</span>}
            </button>
          )}
        </div>
      </div>
    );
  }

  // pending or executing
  const executing = state.kind === "executing";
  const borderClass = isStrong
    ? "border-amber-300 bg-amber-50/40"
    : "border-rhozly-outline/30 bg-rhozly-surface-low";

  return (
    <div
      data-testid={`tool-confirm-${call.id}`}
      className={`mt-2 rounded-2xl border ${borderClass} px-3 py-2.5 text-xs space-y-2.5`}
    >
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest mb-1 flex items-center gap-1.5">
          {isStrong ? (
            <>
              <AlertTriangle size={10} className="text-amber-600" />
              <span className="text-amber-700">Destructive — hold to confirm</span>
            </>
          ) : (
            <span className="text-rhozly-on-surface/45">I'll do this — confirm?</span>
          )}
        </p>
        <p className="font-bold text-rhozly-on-surface leading-snug">{call.preview}</p>
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={executing}
          data-testid={`tool-cancel-btn-${call.id}`}
          className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-rhozly-on-surface/60 hover:bg-rhozly-surface hover:text-rhozly-on-surface transition-colors disabled:opacity-40"
        >
          Cancel
        </button>

        {isStrong ? (
          // Hold-to-confirm button — progress fill via inset bg width.
          <button
            type="button"
            disabled={executing}
            data-testid={`tool-confirm-btn-${call.id}`}
            onMouseDown={startHold}
            onMouseUp={stopHold}
            onMouseLeave={stopHold}
            onTouchStart={startHold}
            onTouchEnd={stopHold}
            onTouchCancel={stopHold}
            className="relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 text-white text-[11px] font-black overflow-hidden disabled:opacity-50"
          >
            <span
              className="absolute inset-0 bg-amber-800/40 transition-[width] duration-75 ease-linear"
              style={{ width: `${holdProgress * 100}%` }}
              aria-hidden
            />
            <span className="relative flex items-center gap-1.5">
              {executing ? (
                <>
                  <Loader2 size={11} className="animate-spin" />
                  Running…
                </>
              ) : (
                <>
                  <AlertTriangle size={11} />
                  Hold to confirm
                </>
              )}
            </span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onConfirm}
            disabled={executing}
            data-testid={`tool-confirm-btn-${call.id}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rhozly-primary text-white text-[11px] font-black hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
          >
            {executing ? (
              <>
                <Loader2 size={11} className="animate-spin" />
                Running…
              </>
            ) : (
              <>
                <Check size={11} />
                Confirm
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
