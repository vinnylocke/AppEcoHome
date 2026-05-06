import React, { useState, useRef, useEffect } from "react";
import { User, LogOut, Building2 } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useNavigate } from "react-router-dom";

interface Props {
  displayName: string | null;
  email: string | null;
}

export default function UserProfileDropdown({ displayName, email }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div
      ref={ref}
      className="relative flex items-center gap-3 cursor-pointer select-none"
      onClick={() => setOpen((v) => !v)}
      data-testid="user-profile-trigger"
    >
      <div className="text-right hidden sm:block text-white">
        <p className="text-sm font-bold">{displayName || "Guest"}</p>
        <p className="text-[10px] uppercase tracking-widest text-white/60 font-semibold">
          Master Gardener
        </p>
      </div>
      <div className="w-11 h-11 rounded-full bg-white/20 p-[2px] backdrop-blur-sm">
        <div className="w-full h-full rounded-full border-2 border-white/30 bg-rhozly-primary-container flex items-center justify-center overflow-hidden">
          <User className="w-5 h-5 text-white" />
        </div>
      </div>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            data-testid="user-profile-dropdown"
            className="absolute top-full right-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-rhozly-outline/20 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200"
          >
            <div className="px-4 py-3 border-b border-rhozly-outline/10">
              <p className="text-sm font-black text-rhozly-on-surface truncate">
                {displayName || "Guest"}
              </p>
              {email && (
                <p className="text-xs text-rhozly-on-surface/40 font-bold truncate">
                  {email}
                </p>
              )}
            </div>

            <div className="p-1.5">
              <button
                data-testid="user-profile-home-management"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  navigate("/home-management");
                }}
                className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-sm font-bold text-rhozly-on-surface hover:bg-rhozly-surface-low transition-colors"
              >
                <Building2 size={15} className="text-rhozly-on-surface/50" />
                Home Management
              </button>
            </div>

            <div className="border-t border-rhozly-outline/10 p-1.5">
              <button
                data-testid="user-profile-sign-out"
                onClick={(e) => {
                  e.stopPropagation();
                  supabase.auth.signOut();
                }}
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
  );
}
