import React from "react";

interface NavItemProps {
  icon: React.ReactElement;
  label: string;
  active: boolean;
  onClick: () => void;
  isCollapsed: boolean;
  isMobile: boolean;
}

export default function NavItem({
  icon,
  label,
  active,
  onClick,
  isCollapsed,
  isMobile,
}: NavItemProps) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      aria-label={isCollapsed && !isMobile ? label : undefined}
      className={`relative flex items-center gap-4 md:gap-3 p-4 rounded-2xl w-full min-h-[44px] transition-all duration-300 group shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2 ${isCollapsed && !isMobile ? "md:w-14 md:h-14 md:justify-center md:p-0" : ""} ${active ? "text-rhozly-primary shadow-[0_2px_8px_rgba(0,0,0,0.18)]" : "text-white/60 hover:text-white hover:bg-white/10"}`}
    >
      {active && <div className="absolute inset-0 bg-white rounded-2xl" />}
      <div
        className={`relative z-10 flex items-center justify-center transition-transform duration-150 ${active ? "scale-110" : "group-hover:scale-110"}`}
      >
        {React.cloneElement(icon, { className: "w-6 h-6" })}
      </div>
      <span
        className={`relative z-10 ${active ? "text-base font-black" : "text-sm font-bold"} ${isCollapsed && !isMobile ? "hidden" : "block"}`}
      >
        {label}
      </span>
    </button>
  );
}
