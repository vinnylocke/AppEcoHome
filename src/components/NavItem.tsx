import React from "react";

interface NavItemProps {
  icon: React.ReactElement;
  label: string;
  active: boolean;
  onClick: () => void;
  isCollapsed: boolean;
  isMobile: boolean;
  /** Count badge — e.g. overdue tasks, new ailments. 0 hides the badge. */
  badge?: number;
  /** Optional tone for the badge (defaults to amber). */
  badgeTone?: "amber" | "rose" | "primary";
}

const BADGE_TONE_CLASS: Record<NonNullable<NavItemProps["badgeTone"]>, string> = {
  amber:   "bg-amber-500 text-white",
  rose:    "bg-rose-500 text-white",
  primary: "bg-rhozly-primary text-white",
};

export default function NavItem({
  icon,
  label,
  active,
  onClick,
  isCollapsed,
  isMobile,
  badge = 0,
  badgeTone = "amber",
}: NavItemProps) {
  void isMobile; // currently unused but kept for future per-platform tweaks
  const showBadge = badge > 0;
  const badgeText = badge > 99 ? "99+" : String(badge);
  return (
    <button
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      aria-label={isCollapsed ? (showBadge ? `${label}, ${badge} pending` : label) : undefined}
      className={`relative flex items-center gap-4 md:gap-3 p-4 rounded-2xl w-full min-h-[44px] transition-all duration-300 group shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2 ${isCollapsed ? "w-14 h-14 justify-center p-0" : ""} ${active ? "text-rhozly-primary shadow-[0_2px_8px_rgba(0,0,0,0.18)]" : "text-white/60 hover:text-white hover:bg-white/10"}`}
    >
      {active && <div className="absolute inset-0 bg-white rounded-2xl" />}
      <div
        className={`relative z-10 flex items-center justify-center transition-transform duration-150 ${active ? "scale-110" : "group-hover:scale-110"}`}
      >
        {/* Cast: nav icons are lucide elements, which accept className. */}
        {React.cloneElement(icon as React.ReactElement<{ className?: string }>, { className: "w-6 h-6" })}
        {/* Collapsed: badge sits as a small dot on the icon corner */}
        {showBadge && isCollapsed && (
          <span
            className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-black flex items-center justify-center border-2 border-rhozly-primary-container ${BADGE_TONE_CLASS[badgeTone]}`}
            aria-hidden="true"
          >
            {badgeText}
          </span>
        )}
      </div>
      <span
        className={`relative z-10 ${active ? "text-base font-black" : "text-sm font-bold"} ${isCollapsed ? "hidden" : "block"}`}
      >
        {label}
      </span>
      {/* Expanded: badge sits next to the label */}
      {showBadge && !isCollapsed && (
        <span
          className={`relative z-10 ml-auto min-w-[22px] h-[22px] px-1.5 rounded-full text-[11px] font-black flex items-center justify-center ${BADGE_TONE_CLASS[badgeTone]}`}
          aria-hidden="true"
        >
          {badgeText}
        </span>
      )}
    </button>
  );
}
