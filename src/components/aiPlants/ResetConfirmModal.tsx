// Revert confirm modal
//
// Shown when a user clicks "Revert" on an edited AI plant. Warns that their
// edits will be lost and the plant will rejoin automatic care-guide updates.

import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { RefreshCw, X } from "lucide-react";

interface ResetConfirmModalProps {
  plantName: string;
  onCancel: () => void;
  onConfirm: () => void;
  isResetting?: boolean;
}

export default function ResetConfirmModal({
  plantName,
  onCancel,
  onConfirm,
  isResetting = false,
}: ResetConfirmModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cancelBtn = dialogRef.current?.querySelector<HTMLButtonElement>(
      "[data-testid='ai-reset-cancel']",
    );
    cancelBtn?.focus();
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onCancel]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-rhozly-bg/95 backdrop-blur-xl animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reset-confirm-heading"
    >
      <div
        ref={dialogRef}
        data-testid="ai-reset-confirm-modal"
        className="bg-rhozly-surface-lowest w-full max-w-md rounded-3xl shadow-2xl border border-rhozly-outline/20 overflow-hidden"
      >
        <div className="p-6 pb-4 flex justify-between items-start border-b border-rhozly-outline/10">
          <div className="flex items-start gap-3">
            <div className="shrink-0 w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center text-purple-700">
              <RefreshCw size={20} />
            </div>
            <div>
              <h3 id="reset-confirm-heading" className="text-lg font-black text-rhozly-on-surface">
                Revert your edits to {plantName}?
              </h3>
              <p className="text-[10px] font-black text-rhozly-on-surface/40 uppercase tracking-widest mt-0.5">
                Your edits will be lost
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            aria-label="Close"
            className="p-2 bg-rhozly-surface-low rounded-xl text-rhozly-on-surface/50 hover:text-rhozly-on-surface transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 text-sm font-bold text-rhozly-on-surface/80 space-y-3">
          <p>
            Your edits to this plant's care guide will be replaced with the
            latest auto-generated version.
          </p>
          <p>
            From now on, this plant's care guide will refresh automatically
            again when new info is available.
          </p>
        </div>

        <div className="p-4 flex items-center justify-end gap-2 border-t border-rhozly-outline/10 bg-rhozly-surface-low/30">
          <button
            data-testid="ai-reset-cancel"
            onClick={onCancel}
            disabled={isResetting}
            className="px-4 py-2 min-h-[36px] border border-rhozly-outline/30 text-rhozly-on-surface text-xs font-black uppercase tracking-widest rounded-xl hover:bg-rhozly-surface-low disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            data-testid="ai-reset-confirm"
            onClick={onConfirm}
            disabled={isResetting}
            className="px-4 py-2 min-h-[36px] bg-purple-600 text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-purple-700 disabled:opacity-50 transition-colors"
          >
            {isResetting ? "Reverting…" : "Revert"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
