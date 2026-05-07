import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { toast } from "react-hot-toast";
import { User, Trophy, BarChart2, Save, Loader2, Lock } from "lucide-react";
import { useAchievements } from "../hooks/useAchievements";
import { ACHIEVEMENTS } from "../lib/achievements";

interface Props {
  userId: string;
  homeId: string;
  displayName: string | null;
  email: string | null;
  onDisplayNameChange?: (name: string) => void;
}

type Tab = "account" | "achievements" | "stats";

// ─── Account Tab ────────────────────────────────────────────────────────────

function AccountTab({ userId, displayName, email, onDisplayNameChange }: {
  userId: string;
  displayName: string | null;
  email: string | null;
  onDisplayNameChange?: (name: string) => void;
}) {
  const [nameValue, setNameValue] = useState(displayName ?? "");
  const [isSavingName, setIsSavingName] = useState(false);

  const [newEmail, setNewEmail] = useState("");
  const [isSavingEmail, setIsSavingEmail] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSavingPassword, setIsSavingPassword] = useState(false);

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
            className="flex-1 text-sm font-bold text-rhozly-on-surface bg-rhozly-surface rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-rhozly-primary"
          />
          <button
            onClick={saveName}
            disabled={isSavingName || !nameValue.trim() || nameValue.trim() === displayName}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-rhozly-primary text-white text-xs font-black disabled:opacity-50 transition-opacity"
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
            className="flex-1 text-sm font-bold text-rhozly-on-surface bg-rhozly-surface rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-rhozly-primary"
          />
          <button
            onClick={saveEmail}
            disabled={isSavingEmail || !newEmail.trim()}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-rhozly-primary text-white text-xs font-black disabled:opacity-50 transition-opacity"
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
        {unlocked ? def.description : "Keep going to unlock"}
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
    { label: "Plants Added", value: stats.plantAdded, icon: "🌿" },
    { label: "Tasks Completed", value: stats.taskCompleted, icon: "✅" },
    { label: "Pruning Tasks", value: stats.plantPruned, icon: "✂️" },
    { label: "Harvests", value: stats.plantHarvested, icon: "🍅" },
    { label: "AI Identifications", value: stats.aiIdentify, icon: "🔍" },
    { label: "AI Diagnoses", value: stats.aiDiagnose, icon: "🩺" },
    { label: "Plans Completed", value: stats.planCompleted, icon: "📝" },
    { label: "Automations Created", value: stats.blueprintCreated, icon: "⚙️" },
    { label: "Ailments Logged", value: stats.ailmentAdded, icon: "👁️" },
    { label: "Ailments Resolved", value: stats.ailmentResolved, icon: "💚" },
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

export default function GardenerProfile({ userId, homeId, displayName, email, onDisplayNameChange }: Props) {
  const [tab, setTab] = useState<Tab>("account");
  const { stats, unlockedKeys, unlockedAt, isLoading } = useAchievements(userId, homeId);

  const unlockedCount = unlockedKeys.length;
  const totalCount = ACHIEVEMENTS.length;

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "account", label: "Account", icon: <User size={14} /> },
    { id: "achievements", label: "Achievements", icon: <Trophy size={14} /> },
    { id: "stats", label: "Stats", icon: <BarChart2 size={14} /> },
  ];

  return (
    <div className="max-w-2xl mx-auto space-y-5">
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
          displayName={displayName}
          email={email}
          onDisplayNameChange={onDisplayNameChange}
        />
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
