import React, { useState, useRef, useEffect } from "react";
import {
  User,
  LogOut,
  Building2,
  Wrench,
  Repeat,
  Sprout,
  Wand2,
  ChevronRight,
  Medal,
  LifeBuoy,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { useNavigate } from "react-router-dom";
import ContactSupportModal from "./ContactSupportModal";

type SubscriptionTier = "sprout" | "botanist" | "sage" | "evergreen" | null;

const TIER_LABEL: Record<NonNullable<SubscriptionTier>, string> = {
  sprout:    "Sprout",
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

export default function UserProfileDropdown({ displayName, firstName, email, subscriptionTier, isAdmin }: Props) {
  const tierLabel = subscriptionTier ? TIER_LABEL[subscriptionTier] : "Free";
  const nameLabel = displayName || firstName || email?.split("@")[0] || tierLabel;
  const [open, setOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

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
    { testId: "nav-gardener-profile", icon: <Medal size={15} />, label: "Gardener's Profile", path: "/gardener" },
    { testId: "user-profile-garden-profile", icon: <Sprout size={15} />, label: "Home Profile", path: "/profile" },
  ];

  const managementItems: DropdownItem[] = [
    { testId: "user-profile-location-management", icon: <Wrench size={15} />, label: "Location Management", path: "/management" },
    { testId: "user-profile-home-management", icon: <Building2 size={15} />, label: "Home Management", path: "/home-management" },
    { testId: "user-profile-task-manager", icon: <Repeat size={15} />, label: "Task Manager", path: "/schedule" },
  ];

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
      <div className="w-11 h-11 rounded-full bg-white/20 p-[2px] backdrop-blur-sm">
        <div className="w-full h-full rounded-full border-2 border-white/30 bg-rhozly-primary-container flex items-center justify-center overflow-hidden">
          <User className="w-5 h-5 text-white" />
        </div>
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
              </div>
            )}

            {/* Support */}
            <div className="p-1.5 pb-0">
              <SectionLabel label="Help" />
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
