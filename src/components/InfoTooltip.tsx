import React, { useState, useRef, useEffect } from "react";
import { HelpCircle } from "lucide-react";

interface Props {
  content: string;
  size?: number;
}

export default function InfoTooltip({ content, size = 13 }: Props) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!visible) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setVisible(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [visible]);

  return (
    <div ref={ref} className="relative inline-flex items-center">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setVisible((v) => !v); }}
        className="text-rhozly-on-surface/30 hover:text-rhozly-primary transition-colors focus:outline-none"
        aria-label="More information"
      >
        <HelpCircle size={size} />
      </button>
      {visible && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-56 bg-rhozly-on-surface text-white text-[11px] font-medium leading-snug rounded-xl px-3 py-2.5 shadow-lg pointer-events-none">
          {content}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-rhozly-on-surface" />
        </div>
      )}
    </div>
  );
}
