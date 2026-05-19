import React, { useEffect, useRef } from "react";
import { Copy, Trash2, ArrowUpToLine, ArrowDownToLine, Zap, BookmarkPlus } from "lucide-react";

interface Props {
  x: number;
  y: number;
  hasLinkedArea: boolean;
  onDuplicate: () => void;
  onDelete: () => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
  onQuickActions: () => void;
  onSaveAsTemplate: () => void;
  onClose: () => void;
}

export default function GardenContextMenu({
  x, y, hasLinkedArea, onDuplicate, onDelete, onBringToFront, onSendToBack, onQuickActions, onSaveAsTemplate, onClose,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", onDocDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // Clamp to viewport so the menu doesn't render off-screen.
  const screenW = typeof window !== "undefined" ? window.innerWidth : 1280;
  const screenH = typeof window !== "undefined" ? window.innerHeight : 800;
  const menuW = 200;
  const menuH = 220;
  const leftPx = Math.min(x, screenW - menuW - 8);
  const topPx  = Math.min(y, screenH - menuH - 8);

  const items: { label: string; Icon: any; onClick: () => void; show?: boolean; tone?: string; testId: string }[] = [
    { label: "Quick Actions",     Icon: Zap,             onClick: onQuickActions,    show: hasLinkedArea, testId: "ctx-quick-actions" },
    { label: "Save as Template",  Icon: BookmarkPlus,    onClick: onSaveAsTemplate,                       testId: "ctx-save-template" },
    { label: "Duplicate",         Icon: Copy,            onClick: onDuplicate,                            testId: "ctx-duplicate" },
    { label: "Bring to front",    Icon: ArrowUpToLine,   onClick: onBringToFront,                         testId: "ctx-bring-to-front" },
    { label: "Send to back",      Icon: ArrowDownToLine, onClick: onSendToBack,                           testId: "ctx-send-to-back" },
    { label: "Delete",            Icon: Trash2,          onClick: onDelete,          tone: "text-red-500", testId: "ctx-delete" },
  ];

  return (
    <div
      ref={ref}
      data-testid="shape-context-menu"
      role="menu"
      className="fixed z-50 min-w-[200px] bg-white rounded-2xl shadow-xl border border-rhozly-outline/15 py-1 animate-in fade-in zoom-in-95 duration-100"
      style={{ left: leftPx, top: topPx }}
    >
      {items.filter(it => it.show !== false).map(({ label, Icon, onClick, tone, testId }) => (
        <button
          key={testId}
          data-testid={testId}
          onClick={() => { onClick(); onClose(); }}
          role="menuitem"
          className={`w-full flex items-center gap-2 px-3 min-h-[40px] text-xs font-bold text-left hover:bg-rhozly-surface transition-colors ${tone ?? "text-rhozly-on-surface/80"}`}
        >
          <Icon size={14} />
          {label}
        </button>
      ))}
    </div>
  );
}
