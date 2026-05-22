import React, { useEffect, useState } from "react";
import { Menu } from "lucide-react";

interface Props {
  onClick: () => void;
}

const SEEN_FLAG_KEY = "rhozly_quick_menu_seen";

/**
 * Floating hamburger button mounted in the top-right corner of the
 * Quick Access focus-mode shell (Mobile Quick Access Wave 6). Always
 * renders a hamburger icon; **first-visit only** (per-device, tracked
 * via localStorage) it shows a "Menu" label alongside the icon to teach
 * users where the navigation went. After one interaction the label is
 * hidden forever on that device.
 */
export default function QuickAccessMenuButton({ onClick }: Props) {
  const [showLabel, setShowLabel] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const seen = window.localStorage.getItem(SEEN_FLAG_KEY) === "true";
      setShowLabel(!seen);
    } catch {
      // localStorage disabled (private mode etc) — just leave the label off.
    }
  }, []);

  const handleClick = () => {
    if (showLabel) {
      setShowLabel(false);
      try {
        window.localStorage.setItem(SEEN_FLAG_KEY, "true");
      } catch {
        // Same as above — silently ignore.
      }
    }
    onClick();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      data-testid="quick-access-menu-button"
      aria-label="Open navigation menu"
      className={`fixed top-3 right-3 z-[105] flex items-center gap-2 min-h-[44px] rounded-2xl bg-rhozly-primary text-white shadow-lg ring-2 ring-white/40 hover:opacity-90 active:scale-95 transition-all ${
        showLabel ? "px-4 py-2.5" : "px-3 py-2.5 w-11 justify-center"
      }`}
      style={{
        // Respect notch / dynamic island safe area on native.
        top: `calc(0.75rem + env(safe-area-inset-top, 0px))`,
        right: `calc(0.75rem + env(safe-area-inset-right, 0px))`,
      }}
    >
      <Menu size={18} />
      {showLabel && (
        <span
          data-testid="quick-access-menu-button-label"
          className="text-xs font-black uppercase tracking-widest"
        >
          Menu
        </span>
      )}
    </button>
  );
}
