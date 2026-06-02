import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  User,
  LogOut,
  Building2,
  Wrench,
  Repeat,
  Sprout,
  Wand2,
  Library,
  ChevronRight,
  Medal,
  LifeBuoy,
  ClipboardList,
  Rocket,
  Sparkles,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import ContactSupportModal from "./ContactSupportModal";

const WHATS_NEW_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const LS_LAST_SEEN_VERSION = "rhozly_last_seen_version";
const LS_VERSION_FIRST_SEEN_AT = "rhozly_version_first_seen_at";

type SubscriptionTier = "sprout" | "botanist" | "sage" | "evergreen" | null;

const TIER_LABEL: Record<NonNullable<SubscriptionTier>, string> = {
  sprout:    "Sprout (Free)",
  botanist:  "Botanist",
  sage:      "Sage",
  evergreen: "Evergreen",
};

interface Props {
  displayName: string | null;
  firstName?: string | null;
  email: string | null;
  subscriptionTier?: SubscriptionTier;
  isAdmin?: boolean;
  canViewAudit?: boolean;
  appVersion?: string;
  onVersionClick?: () => void;
  /**
   * Manual "Check for update" trigger. Forces a fresh DB version fetch +
   * service-worker update probe. Resolves with whether an update is
   * pending so the dropdown can paint an appropriate toast.
   */
  onCheckForUpdate?: () => Promise<{ updateAvailable: boolean }>;
}

interface DropdownItem {
  testId: string;
  icon: React.ReactNode;
  label: string;
  path: string;
}

function DropdownLink({ item, onNavigate }: { item: DropdownItem; onNavigate: (path: string) => void }) {
  return (
    <button
      data-testid={item.testId}
      onClick={(e) => { e.stopPropagation(); onNavigate(item.path); }}
      className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-sm font-bold text-rhozly-on-surface hover:bg-rhozly-surface-low transition-colors group"
    >
      <span className="text-rhozly-on-surface/40 group-hover:text-rhozly-primary transition-colors">
        {item.icon}
      </span>
      <span className="flex-1 text-left">{item.label}</span>
      <ChevronRight size={12} className="text-rhozly-on-surface/20 group-hover:text-rhozly-primary/50 transition-colors" />
    </button>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <p className="px-3 pt-2 pb-1 text-[9px] font-black uppercase tracking-widest text-rhozly-on-surface/30">
      {label}
    </p>
  );
}

export default function UserProfileDropdown({ displayName, firstName, email, subscriptionTier, isAdmin, canViewAudit, appVersion, onVersionClick, onCheckForUpdate }: Props) {
  const tierLabel = subscriptionTier ? TIER_LABEL[subscriptionTier] : "Sprout (Free)";
  const nameLabel = displayName || firstName || email?.split("@")[0] || tierLabel;
  const [open, setOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [whatsNewVersion, setWhatsNewVersion] = useState<string | null>(null);
  const [isCheckingForUpdate, setIsCheckingForUpdate] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const handleCheckForUpdate = async () => {
    if (!onCheckForUpdate || isCheckingForUpdate) return;
    setIsCheckingForUpdate(true);
    try {
      const { updateAvailable } = await onCheckForUpdate();
      if (updateAvailable) {
        // The hook's poller already dispatches `pwa-update-available` when
        // a mismatch is observed, which the UpdateBanner picks up and
        // counts down a reload. Show a light confirmation toast and let
        // the banner take over.
        toast.success("Update available — applying now…");
      } else {
        toast.success("You're on the latest version.");
      }
    } catch {
      toast.error("Couldn't check for an update — please try again.");
    } finally {
      setIsCheckingForUpdate(false);
    }
  };

  useEffect(() => {
    if (!appVersion) return;
    try {
      const lastSeen = localStorage.getItem(LS_LAST_SEEN_VERSION);
      if (lastSeen === appVersion) {
        setWhatsNewVersion(null);
        return;
      }
      const firstSeenRaw = localStorage.getItem(LS_VERSION_FIRST_SEEN_AT);
      const now = Date.now();
      if (!firstSeenRaw) {
        localStorage.setItem(LS_VERSION_FIRST_SEEN_AT, String(now));
        setWhatsNewVersion(appVersion);
        return;
      }
      const firstSeen = parseInt(firstSeenRaw, 10);
      if (!Number.isFinite(firstSeen) || now - firstSeen > WHATS_NEW_WINDOW_MS) {
        setWhatsNewVersion(null);
        return;
      }
      setWhatsNewVersion(appVersion);
    } catch {
      setWhatsNewVersion(null);
    }
  }, [appVersion]);

  const dismissWhatsNew = () => {
    if (!appVersion) return;
    try {
      localStorage.setItem(LS_LAST_SEEN_VERSION, appVersion);
      localStorage.removeItem(LS_VERSION_FIRST_SEEN_AT);
    } catch { /* noop */ }
    setWhatsNewVersion(null);
  };

  const hasWhatsNew = useMemo(() => !!whatsNewVersion, [whatsNewVersion]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const go = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  const profileItems: DropdownItem[] = [
    { testId: "nav-gardener-profile", icon: <Medal size={15} />, label: "Account Settings", path: "/gardener" },
    { testId: "user-profile-garden-profile", icon: <Sprout size={15} />, label: "Garden Preferences", path: "/profile" },
  ];

  const managementItems: DropdownItem[] = [
    { testId: "user-profile-location-management", icon: <Wrench size={15} />, label: "Location Management", path: "/management" },
    { testId: "user-profile-home-management", icon: <Building2 size={15} />, label: "Members & Permissions", path: "/home-management" },
    { testId: "user-profile-task-manager", icon: <Repeat size={15} />, label: "Routines", path: "/schedule" },
  ];
  if (canViewAudit) {
    managementItems.push({ testId: "user-profile-audit-log", icon: <ClipboardList size={15} />, label: "Audit Log", path: "/audit" });
  }

  return (
    <>
    <div
      ref={ref}
      className="relative flex items-center gap-3 cursor-pointer select-none"
      onClick={() => setOpen((v) => !v)}
      data-testid="user-profile-trigger"
    >
      <div className="text-right hidden sm:block text-white">
        <p className="text-sm font-bold">{nameLabel}</p>
        <p className="text-[10px] uppercase tracking-widest text-white/60 font-semibold">
          {tierLabel}
        </p>
      </div>
      <div className="relative w-11 h-11 rounded-full bg-white/20 p-[2px] backdrop-blur-sm">
        <div className="w-full h-full rounded-full border-2 border-white/30 bg-rhozly-primary-container flex items-center justify-center overflow-hidden">
          <User className="w-5 h-5 text-white" />
        </div>
        {hasWhatsNew && (
          <span
            data-testid="whats-new-indicator"
            aria-label="New release available"
            className="absolute -top-0.5 -right-0.5 flex h-3 w-3"
          >
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-300 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-amber-400 border-2 border-white" />
          </span>
        )}
      </div>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setOpen(false); }} />
          <div
            data-testid="user-profile-dropdown"
            className="absolute top-full right-0 mt-2 w-60 bg-white rounded-2xl shadow-xl border border-rhozly-outline/20 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200"
          >
            {/* Name + email header */}
            <div className="px-4 py-3 border-b border-rhozly-outline/10">
              <p className="text-sm font-black text-rhozly-on-surface truncate">
                {nameLabel}
              </p>
              {email && (
                <p className="text-xs text-rhozly-on-surface/40 font-bold truncate">{email}</p>
              )}
            </div>

            {/* Profile section */}
            <div className="p-1.5 pb-0">
              <SectionLabel label="Account" />
              {profileItems.map((item) => (
                <DropdownLink key={item.path} item={item} onNavigate={go} />
              ))}
            </div>

            {/* Management section */}
            <div className="p-1.5 pb-0">
              <SectionLabel label="Management" />
              {managementItems.map((item) => (
                <DropdownLink key={item.path} item={item} onNavigate={go} />
              ))}
            </div>

            {/* Admin section */}
            {isAdmin && (
              <div className="p-1.5 pb-0">
                <SectionLabel label="Admin" />
                <DropdownLink
                  item={{ testId: "user-profile-guide-studio", icon: <Wand2 size={15} />, label: "Guide Studio", path: "/admin/guides" }}
                  onNavigate={go}
                />
                <DropdownLink
                  item={{ testId: "user-profile-plant-library", icon: <Library size={15} />, label: "Plant Library", path: "/admin/plant-library" }}
                  onNavigate={go}
                />
              </div>
            )}

            {/* Support */}
            <div className="p-1.5 pb-0">
              <SectionLabel label="Help" />
              {hasWhatsNew && (
                <button
                  data-testid="user-profile-whats-new"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpen(false);
                    dismissWhatsNew();
                    onVersionClick?.();
                  }}
                  className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-sm font-bold text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 transition-colors group mb-0.5"
                >
                  <span className="text-amber-600 group-hover:text-amber-700 transition-colors">
                    <Sparkles size={15} />
                  </span>
                  <span className="flex-1 text-left">What's new</span>
                  <span className="text-[9px] font-black uppercase tracking-widest text-amber-700 bg-amber-200 px-1.5 py-0.5 rounded-full">New</span>
                </button>
              )}
              <button
                data-testid="user-profile-getting-started"
                onClick={(e) => { e.stopPropagation(); go("/dashboard"); }}
                className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-sm font-bold text-rhozly-on-surface hover:bg-rhozly-surface-low transition-colors group"
              >
                <span className="text-rhozly-on-surface/40 group-hover:text-rhozly-primary transition-colors">
                  <Rocket size={15} />
                </span>
                <span className="flex-1 text-left">Getting Started</span>
                <ChevronRight size={12} className="text-rhozly-on-surface/20 group-hover:text-rhozly-primary/50 transition-colors" />
              </button>
              <button
                data-testid="user-profile-contact-support"
                onClick={(e) => { e.stopPropagation(); setOpen(false); setSupportOpen(true); }}
                className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-sm font-bold text-rhozly-on-surface hover:bg-rhozly-surface-low transition-colors group"
              >
                <span className="text-rhozly-on-surface/40 group-hover:text-rhozly-primary transition-colors">
                  <LifeBuoy size={15} />
                </span>
                <span className="flex-1 text-left">Contact Support</span>
                <ChevronRight size={12} className="text-rhozly-on-surface/20 group-hover:text-rhozly-primary/50 transition-colors" />
              </button>
              {onCheckForUpdate && (
                <button
                  data-testid="user-profile-check-for-update"
                  onClick={(e) => { e.stopPropagation(); handleCheckForUpdate(); }}
                  disabled={isCheckingForUpdate}
                  className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-sm font-bold text-rhozly-on-surface hover:bg-rhozly-surface-low transition-colors group disabled:opacity-60 disabled:cursor-wait"
                >
                  <span className="text-rhozly-on-surface/40 group-hover:text-rhozly-primary transition-colors">
                    {isCheckingForUpdate ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <RefreshCw size={15} />
                    )}
                  </span>
                  <span className="flex-1 text-left">
                    {isCheckingForUpdate ? "Checking…" : "Check for update"}
                  </span>
                </button>
              )}
            </div>

            {/* Sign out */}
            <div className="border-t border-rhozly-outline/10 p-1.5 mt-1.5">
              <button
                data-testid="user-profile-sign-out"
                onClick={(e) => { e.stopPropagation(); supabase.auth.signOut(); }}
                className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-sm font-bold text-red-600 hover:bg-red-50 transition-colors"
              >
                <LogOut size={15} />
                Sign Out
              </button>
            </div>

            {appVersion && (
              <div className="px-4 pb-3 pt-1 text-center">
                <button
                  data-testid="app-version-label"
                  onClick={(e) => { e.stopPropagation(); setOpen(false); dismissWhatsNew(); onVersionClick?.(); }}
                  className="text-[9px] font-bold text-rhozly-on-surface/20 tracking-widest hover:text-rhozly-on-surface/40 transition-colors"
                >
                  {appVersion}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>

    {supportOpen && (
      <ContactSupportModal
        defaultName={displayName}
        defaultEmail={email}
        onClose={() => setSupportOpen(false)}
      />
    )}
    </>
  );
}
