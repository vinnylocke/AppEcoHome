import React from "react";
import { AlertTriangle, Loader2, X } from "lucide-react";

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  isLoading?: boolean;
  isDestructive?: boolean;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  isLoading = false,
  isDestructive = true,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-rhozly-bg/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-rhozly-surface-lowest rounded-3xl w-full max-w-md border border-rhozly-outline/20 shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between p-6 pb-4">
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-2xl ${isDestructive ? "bg-red-500/10 text-red-500" : "bg-rhozly-primary/10 text-rhozly-primary"}`}
            >
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="font-display font-black text-xl text-rhozly-on-surface">
              {title}
            </h3>
          </div>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="p-2 text-rhozly-on-surface/40 hover:text-rhozly-on-surface hover:bg-rhozly-surface-low rounded-xl transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 pb-6">
          <p className="text-sm font-bold text-rhozly-on-surface/60 leading-relaxed">
            {description}
          </p>
        </div>

        {/* Footer */}
        <div className="p-4 bg-rhozly-surface-low/50 border-t border-rhozly-outline/10 flex gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-5 py-2.5 rounded-xl font-bold text-sm text-rhozly-on-surface/70 hover:text-rhozly-on-surface hover:bg-rhozly-surface-low transition-colors disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={`flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-white transition-colors shadow-sm disabled:opacity-50 min-w-[100px]
              ${
                isDestructive
                  ? "bg-red-500 hover:bg-red-600"
                  : "bg-rhozly-primary hover:bg-rhozly-primary/90"
              }`}
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              confirmText
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
