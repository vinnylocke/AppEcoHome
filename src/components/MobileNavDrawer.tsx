import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { X, HelpCircle } from "lucide-react";
import NavItem from "./NavItem";
import { useFocusTrap } from "../hooks/useFocusTrap";

export interface MobileNavLink {
  id: string;
  icon: React.ReactElement;
  label: string;
  matchPaths: string[];
  badge?: number;
  badgeTone?: "amber" | "rose" | "primary";
}

interface Props {
  open: boolean;
  navLinks: MobileNavLink[];
  activePath: string;
  onClose: () => void;
  /** Called with the destination path when a nav link is tapped. Parent closes + navigates. */
  onNavigate: (path: string) => void;
  /** Resolved to the destination URL for each nav link id. */
  pathFor: (id: string) => string;
  /** Optional handlers for footer buttons; the drawer fires onClose before invoking. */
  onOpenHelp?: () => void;
  onOpenPrivacy?: () => void;
  onOpenCookies?: () => void;
  /** Optional app-version label rendered at the bottom (clickable to view release notes). */
  appVersion?: string;
  onVersionClick?: () => void;
}

/**
 * Slide-from-left navigation drawer used by the Quick Access focus-mode
 * shell (Mobile Quick Access Wave 6). Surfaces the same `navLinks` array
 * the persistent side nav uses on non-focus routes, plus Help / Privacy /
 * Cookies / version chrome the desktop sidebar already includes.
 *
 * Closes on:
 *   - tapping the backdrop
 *   - pressing Escape
 *   - tapping any nav link (parent navigates + closes)
 *   - the parent setting open=false (route change, viewport resize, etc)
 */
export default function MobileNavDrawer({
  open,
  navLinks,
  activePath,
  onClose,
  onNavigate,
  pathFor,
  onOpenHelp,
  onOpenPrivacy,
  onOpenCookies,
  appVersion,
  onVersionClick,
}: Props) {
  const trapRef = useFocusTrap<HTMLDivElement>(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (typeof document === "undefined" || !open) return null;

  return createPortal(
    <div
      data-testid="mobile-nav-drawer"
      className="fixed inset-0 z-[110] flex animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-label="Primary navigation"
    >
      {/* Backdrop */}
      <button
        type="button"
        data-testid="mobile-nav-drawer-backdrop"
        onClick={onClose}
        aria-label="Close navigation"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
      />

      {/* Drawer */}
      <div
        ref={trapRef}
        className="relative w-72 max-w-[85vw] h-full bg-rhozly-primary-container shadow-2xl flex flex-col p-6 animate-in slide-in-from-left duration-200"
      >
        <div className="flex items-center justify-between mb-6">
          <span className="text-[10px] font-black uppercase tracking-widest text-white/60">
            Navigation
          </span>
          <button
            type="button"
            data-testid="mobile-nav-drawer-close"
            onClick={onClose}
            aria-label="Close navigation"
            className="p-2 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Primary nav links */}
        <div className="flex flex-col gap-2 overflow-y-auto flex-1 min-h-0">
          {navLinks.map((link) => {
            const active = link.matchPaths.some(
              (p) => activePath === p || activePath.startsWith(p + "/"),
            );
            return (
              <NavItem
                key={link.id}
                icon={link.icon}
                label={link.label}
                active={active}
                onClick={() => onNavigate(pathFor(link.id))}
                isCollapsed={false}
                isMobile={true}
                badge={link.badge}
                badgeTone={link.badgeTone}
              />
            );
          })}
        </div>

        {/* Footer chrome */}
        <div className="flex flex-col gap-1 mt-4 shrink-0">
          {onOpenHelp && (
            <NavItem
              icon={<HelpCircle />}
              label="Help Center"
              active={false}
              onClick={() => {
                onClose();
                onOpenHelp();
              }}
              isCollapsed={false}
              isMobile={true}
            />
          )}
          <div className="flex flex-col gap-1 mt-1">
            {onOpenPrivacy && (
              <button
                type="button"
                data-testid="mobile-nav-drawer-privacy"
                onClick={() => {
                  onClose();
                  onOpenPrivacy();
                }}
                className="text-xs font-bold text-white/30 hover:text-white/70 transition-colors text-center py-2 px-1"
              >
                Privacy Policy
              </button>
            )}
            {onOpenCookies && (
              <button
                type="button"
                data-testid="mobile-nav-drawer-cookies"
                onClick={() => {
                  onClose();
                  onOpenCookies();
                }}
                className="text-xs font-bold text-white/30 hover:text-white/70 transition-colors text-center py-2 px-1"
              >
                Cookie Policy
              </button>
            )}
            {appVersion && (
              <button
                type="button"
                data-testid="mobile-nav-drawer-version"
                onClick={() => {
                  if (onVersionClick) {
                    onClose();
                    onVersionClick();
                  }
                }}
                disabled={!onVersionClick}
                className="text-[10px] font-black uppercase tracking-widest text-white/30 hover:text-white/60 transition-colors text-center py-1 disabled:cursor-default"
              >
                v{appVersion}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
