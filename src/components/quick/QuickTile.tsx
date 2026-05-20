import React from "react";
import { ChevronRight, Clock } from "lucide-react";

interface Props {
  icon: React.ReactNode;
  title: string;
  description: string;
  testId: string;
  /**
   * Live tile → renders as a tappable button. Disabled tile → renders as a
   * subdued tile with a "Coming soon" badge; tap fires `onClick` so the
   * parent can show a toast pointing the user to the existing equivalent.
   */
  variant?: "live" | "coming-soon";
  onClick: () => void;
}

export default function QuickTile({
  icon,
  title,
  description,
  testId,
  variant = "live",
  onClick,
}: Props) {
  const isLive = variant === "live";

  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={`group relative w-full flex items-center gap-4 p-5 min-h-[120px] rounded-3xl border text-left transition-all active:scale-[0.99] ${
        isLive
          ? "bg-white border-rhozly-outline/15 shadow-sm hover:shadow-md hover:border-rhozly-primary/40"
          : "bg-rhozly-surface-low/60 border-rhozly-outline/10 opacity-70 hover:opacity-90"
      }`}
    >
      <div
        className={`shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center ${
          isLive
            ? "bg-rhozly-primary/10 text-rhozly-primary group-hover:bg-rhozly-primary/15"
            : "bg-rhozly-on-surface/5 text-rhozly-on-surface/40"
        }`}
      >
        {icon}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h2
            className={`font-black text-base sm:text-lg tracking-tight ${
              isLive ? "text-rhozly-on-surface" : "text-rhozly-on-surface/60"
            }`}
          >
            {title}
          </h2>
          {!isLive && (
            <span
              data-testid={`${testId}-coming-soon`}
              className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest"
            >
              <Clock size={10} />
              Coming soon
            </span>
          )}
        </div>
        <p
          className={`text-sm leading-snug ${
            isLive ? "text-rhozly-on-surface/65" : "text-rhozly-on-surface/45"
          }`}
        >
          {description}
        </p>
      </div>

      {isLive && (
        <ChevronRight
          size={20}
          className="shrink-0 text-rhozly-on-surface/30 group-hover:text-rhozly-primary transition-colors"
        />
      )}
    </button>
  );
}
