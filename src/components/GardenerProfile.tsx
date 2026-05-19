import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { toast } from "react-hot-toast";
import { User, Trophy, BarChart2, Save, Loader2, Lock, Trash2, AlertTriangle, X, CheckCircle2, Bell, Droplets, Wheat, Scissors, Cloud, Sun, Sparkles, MessageSquare, Eye } from "lucide-react";
import { TIERS, type TierId } from "../constants/tiers";
import { useAchievements } from "../hooks/useAchievements";
import { ACHIEVEMENTS } from "../lib/achievements";
import AIUsagePanel from "./AIUsagePanel";
import { useHighContrast } from "../hooks/useHighContrast";

interface Props {
  userId: string;
  homeId: string;
  displayName: string | null;
  email: string | null;
  subscriptionTier: TierId | null;
  onDisplayNameChange?: (name: string) => void;
  onTierChange?: (tier: TierId, aiEnabled: boolean, perenualEnabled: boolean) => void;
}

type Tab = "account" | "notifications" | "achievements" | "stats";

// ─── Notification preferences ────────────────────────────────────────────────
// Persisted in localStorage as a forward-looking UI surface. Wave 8 will wire
// these to backend filtering — until then, toggles affect in-app toast routing
// only (the "active" categories below). Toggles marked "wired" actually do
// something today; the rest persist but don't yet influence delivery.

const LS_NOTIF_PREFS = "rhozly_notif_prefs";

interface NotificationPrefs {
  master:        boolean;
  watering:      boolean;
  harvesting:    boolean;
  pruning:       boolean;
  weatherAlerts: boolean;
  goldenHour:    boolean;
  optimiseDigest:boolean;
  betaPrompts:   boolean;
}

const DEFAULT_NOTIF_PREFS: NotificationPrefs = {
  master:        true,
  watering:      true,
  harvesting:    true,
  pruning:       true,
  weatherAlerts: true,
  goldenHour:    false,
  optimiseDigest:false,
  betaPrompts:   true,
};

function loadNotifPrefs(): NotificationPrefs {
  try {
    const raw = localStorage.getItem(LS_NOTIF_PREFS);
    if (!raw) return DEFAULT_NOTIF_PREFS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_NOTIF_PREFS, ...parsed };
  } catch {
    return DEFAULT_NOTIF_PREFS;
  }
}

function saveNotifPrefs(prefs: NotificationPrefs) {
  try { localStorage.setItem(LS_NOTIF_PREFS, JSON.stringify(prefs)); } catch { /* ignore */ }
}

function NotificationsTab() {
  const [prefs, setPrefs] = useState<NotificationPrefs>(() => loadNotifPrefs());
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported",
  );

  const update = (patch: Partial<NotificationPrefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    saveNotifPrefs(next);
  };

  const requestBrowserPerm = async () => {
    if (!("Notification" in window)) return;
    const result = await Notification.requestPermission();
    setPermission(result);
  };

  const categories: Array<{
    key: keyof NotificationPrefs;
    label: string;
    sub: string;
    icon: React.ReactNode;
    wired: boolean;
  }> = [
    { key: "watering",       label: "Watering reminders",     sub: "When a watering task is due",                                          icon: <Droplets size={14} className="text-sky-500" />,    wired: true  },
    { key: "harvesting",     label: "Harvest reminders",      sub: "When a fruit / veg / herb is ready",                                   icon: <Wheat size={14} className="text-amber-500" />,     wired: true  },
    { key: "pruning",        label: "Pruning reminders",      sub: "When a pruning task is due",                                           icon: <Scissors size={14} className="text-rose-500" />,   wired: true  },
    { key: "weatherAlerts",  label: "Weather alerts",         sub: "Frost · heatwave · heavy rain · strong wind",                          icon: <Cloud size={14} className="text-indigo-500" />,    wired: true  },
    { key: "goldenHour",     label: "Golden hour reminders",  sub: "A photo nudge before sunset",                                          icon: <Sun size={14} className="text-orange-500" />,      wired: false },
    { key: "optimiseDigest", label: "Weekly optimise digest", sub: "A summary of suggested schedule improvements",                         icon: <Sparkles size={14} className="text-violet-500" />, wired: false },
    { key: "betaPrompts",    label: "Beta feedback prompts",  sub: "Occasional in-app surveys on new features",                            icon: <MessageSquare size={14} className="text-emerald-500" />, wired: true },
  ];

  return (
    <div className="space-y-5" data-testid="notifications-tab">
      {/* Browser permission status */}
      <section className="bg-white rounded-2xl border border-rhozly-outline/10 p-4">
        <div className="flex items-start gap-3">
          <Bell size={18} className="text-rhozly-primary shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-rhozly-on-surface">
              Browser notification permission
            </p>
            {permission === "unsupported" && (
              <p className="text-xs font-bold text-rhozly-on-surface/50 mt-0.5">
                This browser doesn't support notifications. You'll still see in-app toasts.
              </p>
            )}
            {permission === "granted" && (
              <p className="text-xs font-bold text-emerald-600 mt-0.5 flex items-center gap-1">
                <CheckCircle2 size={12} /> Granted — Rhozly can show OS notifications
              </p>
            )}
            {permission === "denied" && (
              <p className="text-xs font-bold text-rose-600 mt-0.5">
                Denied — enable in your browser settings to receive OS notifications
              </p>
            )}
            {permission === "default" && (
              <div className="mt-2">
                <button
                  data-testid="notifications-enable-browser"
                  onClick={requestBrowserPerm}
                  className="flex items-center gap-1.5 bg-rhozly-primary text-white text-xs font-black px-3 py-2 min-h-[36px] rounded-xl hover:opacity-90 transition"
                >
                  <Bell size={12} /> Enable browser notifications
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Master switch */}
      <section className="bg-white rounded-2xl border border-rhozly-outline/10 p-4">
        <label className="flex items-center justify-between gap-3 cursor-pointer">
          <div>
            <p className="text-sm font-black text-rhozly-on-surface">All notifications</p>
            <p className="text-[11px] font-bold text-rhozly-on-surface/50 leading-snug">
              Turn off everything in one tap. Re-enable any time.
            </p>
          </div>
          <input
            data-testid="notifications-master-toggle"
            type="checkbox"
            checked={prefs.master}
            onChange={(e) => update({ master: e.target.checked })}
            className="w-11 h-6 shrink-0 appearance-none rounded-full bg-rhozly-outline/30 checked:bg-rhozly-primary transition-colors relative cursor-pointer
              after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-5 after:h-5 after:bg-white after:rounded-full after:shadow-md after:transition-transform
              checked:after:translate-x-5"
          />
        </label>
      </section>

      {/* Per-category toggles */}
      <section className={`bg-white rounded-2xl border border-rhozly-outline/10 p-4 space-y-3 transition-opacity ${prefs.master ? "" : "opacity-50 pointer-events-none"}`}>
        <h3 className="text-xs font-black uppercase tracking-widest text-rhozly-on-surface/40">
          Categories
        </h3>
        {categories.map((cat) => (
          <label key={cat.key} className="flex items-center justify-between gap-3 cursor-pointer py-1">
            <div className="flex items-start gap-3 min-w-0">
              <div className="bg-rhozly-surface-low p-1.5 rounded-lg shrink-0 mt-0.5">{cat.icon}</div>
              <div className="min-w-0">
                <p className="text-xs font-black text-rhozly-on-surface flex items-center gap-1.5">
                  {cat.label}
                  {!cat.wired && (
                    <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                      Coming soon
                    </span>
                  )}
                </p>
                <p className="text-[11px] font-medium text-rhozly-on-surface/55 leading-snug">{cat.sub}</p>
              </div>
            </div>
            <input
              data-testid={`notifications-toggle-${cat.key}`}
              type="checkbox"
              checked={(prefs[cat.key] as boolean) && prefs.master}
              disabled={!prefs.master}
              onChange={(e) => update({ [cat.key]: e.target.checked } as Partial<NotificationPrefs>)}
              className="w-11 h-6 shrink-0 appearance-none rounded-full bg-rhozly-outline/30 checked:bg-rhozly-primary transition-colors relative cursor-pointer
                after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-5 after:h-5 after:bg-white after:rounded-full after:shadow-md after:transition-transform
                checked:after:translate-x-5 disabled:cursor-not-allowed"
            />
          </label>
        ))}
      </section>

      <p className="text-[10px] font-bold text-rhozly-on-surface/40 px-1 leading-snug">
        Preferences are saved on this device. Categories marked "Coming soon" persist but don't yet affect delivery — wiring lands in a future release.
      </p>
    </div>
  );
}

// ─── Accessibility Section ──────────────────────────────────────────────────

function AccessibilitySection() {
  const [highContrast, setHighContrast] = useHighContrast();
  return (
    <section className="bg-white rounded-2xl border border-rhozly-outline/10 p-4 space-y-3" data-testid="accessibility-section">
      <h3 className="text-xs font-black uppercase tracking-widest text-rhozly-on-surface/55 flex items-center gap-2">
        <Eye size={13} className="text-rhozly-primary" />
        Accessibility
      </h3>
      <label className="flex items-center justify-between gap-3 cursor-pointer">
        <div className="min-w-0">
          <p className="text-sm font-black text-rhozly-on-surface">High contrast</p>
          <p className="text-[11px] font-medium text-rhozly-on-surface/55 leading-snug">
            Forces solid colours for secondary text and chips. Easier to read in bright light or for users with low vision.
          </p>
        </div>
        <input
          data-testid="accessibility-high-contrast-toggle"
          type="checkbox"
          checked={highContrast}
          onChange={(e) => setHighContrast(e.target.checked)}
          aria-label="High contrast mode"
          className="w-11 h-6 shrink-0 appearance-none rounded-full bg-rhozly-outline/30 checked:bg-rhozly-primary transition-colors relative cursor-pointer
            after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-5 after:h-5 after:bg-white after:rounded-full after:shadow-md after:transition-transform
            checked:after:translate-x-5"
        />
      </label>
      <p className="text-[10px] font-bold text-rhozly-on-surface/45 leading-snug">
        Rhozly also honours your OS-level Reduce Motion preference automatically — turn it on in Settings → Accessibility on iOS, or System Settings → Accessibility on Android / macOS / Windows.
      </p>
    </section>
  );
}

// ─── Account Tab ────────────────────────────────────────────────────────────

function AccountTab({ userId, homeId, displayName, email, subscriptionTier, onDisplayNameChange, onTierChange }: {
  userId: string;
  homeId: string;
  displayName: string | null;
  email: string | null;
  subscriptionTier: TierId | null;
  onDisplayNameChange?: (name: string) => void;
  onTierChange?: (tier: TierId, aiEnabled: boolean, perenualEnabled: boolean) => void;
}) {
  const [nameValue, setNameValue] = useState(displayName ?? "");
  const [isSavingName, setIsSavingName] = useState(false);

  const [newEmail, setNewEmail] = useState("");
  const [isSavingEmail, setIsSavingEmail] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const [pendingTier, setPendingTier] = useState<TierId | null>(subscriptionTier);
  const [showTierConfirmModal, setShowTierConfirmModal] = useState(false);
  const [isSwitchingTier, setIsSwitchingTier] = useState(false);

  async function confirmSwitchTier() {
    if (!pendingTier || pendingTier === subscriptionTier) return;
    setIsSwitchingTier(true);
    const tier = TIERS.find((t) => t.id === pendingTier)!;
    const { error } = await supabase
      .from("user_profiles")
      .update({
        subscription_tier: tier.id,
        ai_enabled: tier.ai_enabled,
        enable_perenual: tier.enable_perenual,
      })
      .eq("uid", userId);
    setIsSwitchingTier(false);
    setShowTierConfirmModal(false);
    if (error) {
      toast.error("Failed to switch plan");
      setPendingTier(subscriptionTier);
    } else {
      toast.success(`Switched to ${tier.name}`);
      onTierChange?.(tier.id, tier.ai_enabled, tier.enable_perenual);
    }
  }

  async function saveName() {
    const trimmed = nameValue.trim();
    if (!trimmed || trimmed === displayName) return;
    setIsSavingName(true);
    const { error } = await supabase
      .from("user_profiles")
      .update({ display_name: trimmed })
      .eq("user_id", userId);
    setIsSavingName(false);
    if (error) {
      toast.error("Failed to update name");
    } else {
      toast.success("Name updated");
      onDisplayNameChange?.(trimmed);
    }
  }

  async function saveEmail() {
    const trimmed = newEmail.trim();
    if (!trimmed) return;
    setIsSavingEmail(true);
    const { error } = await supabase.auth.updateUser({ email: trimmed });
    setIsSavingEmail(false);
    if (error) {
      toast.error(error.message || "Failed to update email");
    } else {
      toast.success("Check your inbox to confirm the new email address");
      setNewEmail("");
    }
  }

  async function savePassword() {
    if (!currentPassword) return toast.error("Enter your current password");
    if (!newPassword) return toast.error("Enter a new password");
    if (newPassword !== confirmPassword) return toast.error("Passwords do not match");
    if (newPassword.length < 8) return toast.error("Password must be at least 8 characters");

    setIsSavingPassword(true);
    // Re-authenticate first
    const { error: reAuthError } = await supabase.auth.signInWithPassword({
      email: email ?? "",
      password: currentPassword,
    });
    if (reAuthError) {
      setIsSavingPassword(false);
      return toast.error("Current password is incorrect");
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setIsSavingPassword(false);
    if (error) {
      toast.error(error.message || "Failed to update password");
    } else {
      toast.success("Password updated successfully");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }
  }

  async function deleteAccount() {
    setIsDeleting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("No active session");

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${supabaseUrl}/functions/v1/delete-account`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to delete account");
      }

      await supabase.auth.signOut();
    } catch (err: any) {
      setIsDeleting(false);
      setShowDeleteModal(false);
      toast.error(err.message ?? "Failed to delete account");
    }
  }

  return (
    <div className="space-y-6">
      {/* Display name */}
      <section className="bg-white rounded-2xl border border-rhozly-outline/10 p-4 space-y-3">
        <h3 className="text-xs font-black uppercase tracking-widest text-rhozly-on-surface/40">Display Name</h3>
        <div className="flex gap-2">
          <input
            data-testid="gardener-profile-display-name-input"
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && saveName()}
            placeholder="Your name"
            className="flex-1 min-w-0 text-sm font-bold text-rhozly-on-surface bg-rhozly-surface rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-rhozly-primary"
          />
          <button
            onClick={saveName}
            disabled={isSavingName || !nameValue.trim() || nameValue.trim() === displayName}
            className="shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-rhozly-primary text-white text-xs font-black disabled:opacity-50 transition-opacity"
          >
            {isSavingName ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            Save
          </button>
        </div>
      </section>

      {/* Email */}
      <section className="bg-white rounded-2xl border border-rhozly-outline/10 p-4 space-y-3">
        <h3 className="text-xs font-black uppercase tracking-widest text-rhozly-on-surface/40">Change Email</h3>
        <p className="text-xs text-rhozly-on-surface/50 font-medium">
          Current: <span className="font-bold text-rhozly-on-surface/70">{email}</span>
        </p>
        <div className="flex gap-2">
          <input
            data-testid="gardener-profile-email-input"
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && saveEmail()}
            placeholder="New email address"
            className="flex-1 min-w-0 text-sm font-bold text-rhozly-on-surface bg-rhozly-surface rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-rhozly-primary"
          />
          <button
            onClick={saveEmail}
            disabled={isSavingEmail || !newEmail.trim()}
            className="shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-rhozly-primary text-white text-xs font-black disabled:opacity-50 transition-opacity"
          >
            {isSavingEmail ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            Save
          </button>
        </div>
        <p className="text-[10px] text-rhozly-on-surface/40 font-bold">
          You'll receive a confirmation email — your address won't change until you confirm.
        </p>
      </section>

      {/* Password */}
      <section className="bg-white rounded-2xl border border-rhozly-outline/10 p-4 space-y-3">
        <h3 className="text-xs font-black uppercase tracking-widest text-rhozly-on-surface/40">Change Password</h3>
        <input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          placeholder="Current password"
          className="w-full text-sm font-bold text-rhozly-on-surface bg-rhozly-surface rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-rhozly-primary"
        />
        <input
          data-testid="gardener-profile-password-input"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="New password (min 8 characters)"
          className="w-full text-sm font-bold text-rhozly-on-surface bg-rhozly-surface rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-rhozly-primary"
        />
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && savePassword()}
          placeholder="Confirm new password"
          className="w-full text-sm font-bold text-rhozly-on-surface bg-rhozly-surface rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-rhozly-primary"
        />
        <button
          onClick={savePassword}
          disabled={isSavingPassword || !currentPassword || !newPassword || !confirmPassword}
          className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-rhozly-primary text-white text-xs font-black disabled:opacity-50 transition-opacity"
        >
          {isSavingPassword ? <Loader2 size={13} className="animate-spin" /> : <Lock size={13} />}
          Update Password
        </button>
      </section>

      {/* Plan */}
      <section className="bg-white rounded-2xl border border-rhozly-outline/10 p-4 space-y-3">
        <h3 className="text-xs font-black uppercase tracking-widest text-rhozly-on-surface/40">Your Plan</h3>
        <div className="grid grid-cols-2 gap-2">
          {TIERS.map((tier) => {
            const isSaved = subscriptionTier === tier.id;
            const isSelected = pendingTier === tier.id;
            return (
              <button
                key={tier.id}
                data-testid={`plan-card-${tier.id}`}
                onClick={() => setPendingTier(tier.id)}
                disabled={isSwitchingTier}
                className={`relative text-left rounded-xl border-2 p-3 transition-all disabled:opacity-60 ${
                  isSelected
                    ? `${tier.accentBg} ${tier.accentBorder}`
                    : "bg-rhozly-surface/40 border-rhozly-outline/10 hover:border-rhozly-outline/30"
                }`}
              >
                {isSaved && (
                  <span className={`absolute top-2 right-2 text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full ${tier.accentBg} ${tier.accentText}`}>
                    Current
                  </span>
                )}
                {isSelected && !isSaved && (
                  <CheckCircle2 size={13} className={`absolute top-2.5 right-2.5 ${tier.accentText}`} />
                )}
                <span className="text-lg block mb-1 mt-4">{tier.icon}</span>
                <p className={`text-xs font-black ${isSelected ? tier.accentText : "text-rhozly-on-surface"}`}>
                  {tier.name}
                </p>
                <p className="text-[10px] font-medium text-rhozly-on-surface/50 leading-snug mt-0.5">
                  {tier.vibe}
                </p>
              </button>
            );
          })}
        </div>

        {/* Update button — only shown when selection differs from saved tier */}
        {pendingTier && pendingTier !== subscriptionTier && (
          <button
            data-testid="plan-update-btn"
            onClick={() => setShowTierConfirmModal(true)}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-rhozly-primary text-white text-xs font-black transition-opacity"
          >
            <Save size={13} />
            Update Plan
          </button>
        )}
      </section>

      {/* Tier switch confirmation modal */}
      {showTierConfirmModal && pendingTier && (() => {
        const from = TIERS.find((t) => t.id === subscriptionTier);
        const to = TIERS.find((t) => t.id === pendingTier)!;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-3xl shadow-xl w-full max-w-sm p-6 space-y-4">
              <div className="flex items-start justify-between">
                <h2 className="text-sm font-black text-rhozly-on-surface">Switch to {to.name}?</h2>
                <button
                  onClick={() => setShowTierConfirmModal(false)}
                  className="text-rhozly-on-surface/30 hover:text-rhozly-on-surface transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              <div className={`rounded-2xl border-2 ${to.accentBg} ${to.accentBorder} p-4`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl">{to.icon}</span>
                  <div>
                    <p className={`text-sm font-black ${to.accentText}`}>{to.name}</p>
                    <p className="text-[10px] font-medium text-rhozly-on-surface/60">{to.vibe}</p>
                  </div>
                </div>
                <ul className="space-y-1">
                  {to.features.map((f) => (
                    <li key={f} className="flex items-center gap-1.5 text-[11px] font-medium text-rhozly-on-surface/70">
                      <span className={`text-[10px] ${to.accentText}`}>✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>

              {from && (
                <p className="text-xs text-rhozly-on-surface/50 font-medium text-center">
                  You are currently on <span className="font-black text-rhozly-on-surface/70">{from.name}</span>.
                  This change takes effect immediately.
                </p>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => setShowTierConfirmModal(false)}
                  disabled={isSwitchingTier}
                  className="flex-1 py-2.5 rounded-xl border border-rhozly-outline/20 text-xs font-black text-rhozly-on-surface/60 hover:bg-rhozly-surface transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  data-testid="plan-confirm-btn"
                  onClick={confirmSwitchTier}
                  disabled={isSwitchingTier}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-white text-xs font-black disabled:opacity-50 transition-opacity bg-rhozly-primary`}
                >
                  {isSwitchingTier ? <Loader2 size={13} className="animate-spin" /> : null}
                  {isSwitchingTier ? "Saving…" : `Switch to ${to.name}`}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* AI Usage */}
      <AIUsagePanel homeId={homeId} userId={userId} />

      {/* Accessibility */}
      <AccessibilitySection />

      {/* Danger Zone */}
      <section className="bg-white rounded-2xl border border-red-200 p-4 space-y-3">
        <h3 className="text-xs font-black uppercase tracking-widest text-red-500">Danger Zone</h3>
        <p className="text-xs text-rhozly-on-surface/60 font-medium leading-relaxed">
          Permanently delete your account and all associated data. This cannot be undone.
        </p>
        <button
          data-testid="delete-account-btn"
          onClick={() => { setShowDeleteModal(true); setDeleteConfirmText(""); }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-red-300 text-red-600 text-xs font-black hover:bg-red-50 transition-colors"
        >
          <Trash2 size={13} />
          Delete Account
        </button>
      </section>

      {/* Delete confirmation modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                  <AlertTriangle size={16} className="text-red-500" />
                </div>
                <h2 className="text-sm font-black text-rhozly-on-surface">Delete Account</h2>
              </div>
              <button
                onClick={() => setShowDeleteModal(false)}
                className="text-rhozly-on-surface/30 hover:text-rhozly-on-surface transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <ul className="text-xs text-rhozly-on-surface/70 font-medium space-y-1.5 pl-1">
              <li className="flex gap-2"><span className="text-red-400 shrink-0">•</span>All your plants, tasks, locations, and plans will be deleted</li>
              <li className="flex gap-2"><span className="text-red-400 shrink-0">•</span>Guides you've written will remain but show as "Anonymous"</li>
              <li className="flex gap-2"><span className="text-red-400 shrink-0">•</span>If you own a home with other members, ownership passes to the next member</li>
              <li className="flex gap-2"><span className="text-red-400 shrink-0">•</span>If you're the only member of a home, that home will be deleted</li>
            </ul>

            <div className="space-y-2">
              <p className="text-xs font-black text-rhozly-on-surface/60 uppercase tracking-widest">
                Type DELETE to confirm
              </p>
              <input
                data-testid="delete-account-confirm-input"
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="DELETE"
                className="w-full text-sm font-bold text-rhozly-on-surface bg-rhozly-surface rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-red-400"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setShowDeleteModal(false)}
                disabled={isDeleting}
                className="flex-1 py-2.5 rounded-xl border border-rhozly-outline/20 text-xs font-black text-rhozly-on-surface/60 hover:bg-rhozly-surface transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                data-testid="delete-account-confirm-btn"
                onClick={deleteAccount}
                disabled={deleteConfirmText !== "DELETE" || isDeleting}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-red-500 text-white text-xs font-black disabled:opacity-40 transition-opacity"
              >
                {isDeleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                {isDeleting ? "Deleting…" : "Delete Account"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Achievement Card ────────────────────────────────────────────────────────

function AchievementCard({ def, unlocked, unlockedAt, progress }: {
  def: (typeof ACHIEVEMENTS)[number];
  unlocked: boolean;
  unlockedAt?: string;
  progress?: { current: number; total: number };
}) {
  return (
    <div
      data-testid={`achievement-card-${def.key}`}
      className={`rounded-2xl border p-3 flex flex-col gap-1.5 transition-all ${
        unlocked
          ? "bg-white border-rhozly-primary/20 shadow-sm"
          : "bg-rhozly-surface/40 border-rhozly-outline/10"
      }`}
    >
      <span className={`text-2xl ${unlocked ? "" : "grayscale opacity-40"}`}>{def.icon}</span>
      <p className={`text-xs font-black leading-tight ${unlocked ? "text-rhozly-on-surface" : "text-rhozly-on-surface/40"}`}>
        {def.label}
      </p>
      <p className={`text-[10px] font-medium leading-tight ${unlocked ? "text-rhozly-on-surface/60" : "text-rhozly-on-surface/30"}`}>
        {def.description}
      </p>
      {unlocked && unlockedAt && (
        <p className="text-[9px] font-black uppercase tracking-widest text-rhozly-primary/60 mt-auto">
          {new Date(unlockedAt).toLocaleDateString()}
        </p>
      )}
      {!unlocked && progress && (
        <div className="mt-auto space-y-1">
          <div className="flex justify-between text-[9px] font-black text-rhozly-on-surface/30">
            <span>{progress.current}</span>
            <span>{progress.total}</span>
          </div>
          <div className="h-1 bg-rhozly-surface rounded-full overflow-hidden">
            <div
              className="h-full bg-rhozly-primary/30 rounded-full transition-all"
              style={{ width: `${Math.round((progress.current / progress.total) * 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Stats Tab ───────────────────────────────────────────────────────────────

function StatsTab({ stats }: { stats: NonNullable<ReturnType<typeof useAchievements>["stats"]> }) {
  const metrics: { label: string; value: number | string; icon: string }[] = [
    { label: "Current Streak", value: stats.streakDays === 0 ? "—" : `${stats.streakDays}d`, icon: "🔥" },
    { label: "Longest Streak", value: stats.longestStreak === 0 ? "—" : `${stats.longestStreak}d`, icon: "🏅" },
    { label: "Plants Added", value: stats.plantAdded, icon: "🌿" },
    { label: "Tasks Completed", value: stats.taskCompleted, icon: "✅" },
    { label: "Pruning Tasks", value: stats.plantPruned, icon: "✂️" },
    { label: "Harvests", value: stats.plantHarvested, icon: "🍅" },
    { label: "Yields Logged", value: stats.yieldRecorded, icon: "🍓" },
    { label: "Journal Entries", value: stats.journalEntries, icon: "📓" },
    { label: "Area Scans", value: stats.scansCompleted, icon: "🦅" },
    { label: "AI Identifications", value: stats.aiIdentify, icon: "🔍" },
    { label: "AI Diagnoses", value: stats.aiDiagnose, icon: "🩺" },
    { label: "AI Chat Messages", value: stats.chatMessages, icon: "🤖" },
    { label: "Plans Completed", value: stats.planCompleted, icon: "📝" },
    { label: "Automations Created", value: stats.blueprintCreated, icon: "⚙️" },
    { label: "Ailments Logged", value: stats.ailmentAdded, icon: "👁️" },
    { label: "Ailments Resolved", value: stats.ailmentResolved, icon: "💚" },
    { label: "Guides Published", value: stats.guidesPublished, icon: "📖" },
    { label: "Comments Posted", value: stats.commentsPosted, icon: "💬" },
    { label: "Profile Complete", value: stats.profileComplete ? "Yes" : "No", icon: "🌟" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {metrics.map((m) => (
        <div
          key={m.label}
          className="bg-white rounded-2xl border border-rhozly-outline/10 p-3 shadow-sm flex flex-col gap-1"
        >
          <span className="text-xl">{m.icon}</span>
          <p className="text-lg font-black text-rhozly-on-surface tabular-nums">{m.value}</p>
          <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 leading-tight">{m.label}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function GardenerProfile({ userId, homeId, displayName, email, subscriptionTier, onDisplayNameChange, onTierChange }: Props) {
  const [params, setParams] = useSearchParams();
  const initialTab = (params.get("tab") as Tab) ?? "account";
  const validTab: Tab = ["account", "notifications", "achievements", "stats"].includes(initialTab) ? initialTab : "account";
  const [tab, setTabState] = useState<Tab>(validTab);
  const { stats, unlockedKeys, unlockedAt, isLoading } = useAchievements(userId, homeId);

  const setTab = (next: Tab) => {
    setTabState(next);
    const p = new URLSearchParams(params);
    if (next === "account") p.delete("tab"); else p.set("tab", next);
    setParams(p, { replace: true });
  };

  const unlockedCount = unlockedKeys.length;
  const totalCount = ACHIEVEMENTS.length;

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "account", label: "Account", icon: <User size={14} /> },
    { id: "notifications", label: "Alerts", icon: <Bell size={14} /> },
    { id: "achievements", label: "Awards", icon: <Trophy size={14} /> },
    { id: "stats", label: "Stats", icon: <BarChart2 size={14} /> },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-14 h-14 rounded-full bg-rhozly-primary-container flex items-center justify-center shrink-0">
          <User size={24} className="text-rhozly-primary" />
        </div>
        <div>
          <h1 className="text-lg font-black text-rhozly-on-surface">{displayName || "Gardener"}</h1>
          <p className="text-xs text-rhozly-on-surface/50 font-bold">
            {isLoading ? "Loading achievements..." : `${unlockedCount} / ${totalCount} achievements`}
          </p>
        </div>
      </div>

      {/* Achievement progress bar */}
      <div className="h-2 bg-rhozly-surface rounded-full overflow-hidden">
        <div
          className="h-full bg-rhozly-primary rounded-full transition-all duration-500"
          style={{ width: totalCount > 0 ? `${Math.round((unlockedCount / totalCount) * 100)}%` : "0%" }}
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-rhozly-surface rounded-2xl p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            data-testid={`gardener-profile-tab-${t.id}`}
            onClick={() => setTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-black transition-all ${
              tab === t.id
                ? "bg-white text-rhozly-primary shadow-sm"
                : "text-rhozly-on-surface/40 hover:text-rhozly-on-surface"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "account" && (
        <AccountTab
          userId={userId}
          homeId={homeId}
          displayName={displayName}
          email={email}
          subscriptionTier={subscriptionTier}
          onDisplayNameChange={onDisplayNameChange}
          onTierChange={onTierChange}
        />
      )}

      {tab === "notifications" && (
        <NotificationsTab />
      )}

      {tab === "achievements" && (
        <div>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 size={24} className="animate-spin text-rhozly-primary" />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {ACHIEVEMENTS.map((a) => (
                <AchievementCard
                  key={a.key}
                  def={a}
                  unlocked={unlockedKeys.includes(a.key)}
                  unlockedAt={unlockedAt[a.key]}
                  progress={!unlockedKeys.includes(a.key) ? a.progress?.(stats ?? {
                    plantAdded: 0, plantPruned: 0, plantHarvested: 0,
                    taskCompleted: 0, aiIdentify: 0, aiDiagnose: 0,
                    planCompleted: 0, blueprintCreated: 0,
                    ailmentAdded: 0, ailmentResolved: 0, profileComplete: false,
                    journalEntries: 0, yieldRecorded: 0, scansCompleted: 0,
                    guidesPublished: 0, commentsPosted: 0, chatMessages: 0,
                    streakDays: 0, longestStreak: 0, blueprintCreatedFromEvents: 0,
                    hasWinterTask: false, hasSpringPlanting: false,
                  }) : undefined}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "stats" && (
        <div>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 size={24} className="animate-spin text-rhozly-primary" />
            </div>
          ) : stats ? (
            <StatsTab stats={stats} />
          ) : (
            <p className="text-center text-xs text-rhozly-on-surface/40 py-12">No stats yet</p>
          )}
        </div>
      )}
    </div>
  );
}
