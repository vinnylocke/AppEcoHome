import React, { useState, useRef, useEffect } from "react";
import { HelpCircle } from "lucide-react";

interface Props {
  content: string;
  size?: number;
  width?: "sm" | "md" | "lg";
  align?: "left" | "center" | "right";
}

const WIDTH_CLASS: Record<NonNullable<Props["width"]>, string> = {
  sm: "w-48",
  md: "w-64",
  lg: "w-80",
};

const ALIGN_CLASS: Record<NonNullable<Props["align"]>, string> = {
  left: "left-0",
  center: "left-1/2 -translate-x-1/2",
  right: "right-0",
};

const ARROW_ALIGN: Record<NonNullable<Props["align"]>, string> = {
  left: "left-3",
  center: "left-1/2 -translate-x-1/2",
  right: "right-3",
};

export default function InfoTooltip({ content, size = 13, width = "md", align = "center" }: Props) {
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
        <div className={`absolute bottom-full mb-2 z-50 ${WIDTH_CLASS[width]} ${ALIGN_CLASS[align]} bg-rhozly-on-surface text-white text-[11px] font-medium leading-snug rounded-xl px-3 py-2.5 shadow-lg pointer-events-none`}>
          {content}
          <div className={`absolute top-full ${ARROW_ALIGN[align]} border-4 border-transparent border-t-rhozly-on-surface`} />
        </div>
      )}
    </div>
  );
}
