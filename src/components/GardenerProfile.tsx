import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { toast } from "react-hot-toast";
import { User, Trophy, BarChart2, Save, Loader2, Lock, Trash2, AlertTriangle, X, CheckCircle2, Bell, Droplets, Wheat, Scissors, Cloud, Sun, Sparkles, MessageSquare, Eye, Calendar as CalendarIcon, Volume2, CreditCard } from "lucide-react";
import { TIERS, type TierId } from "../constants/tiers";
import { useAchievements } from "../hooks/useAchievements";
import { ACHIEVEMENTS } from "../lib/achievements";
import AIUsagePanel from "./AIUsagePanel";
import SearchSourceSection from "./SearchSourceSection";
import QuickLauncherPicker from "./quick/QuickLauncherPicker";
import { useHighContrast } from "../hooks/useHighContrast";
import PersonaSetting from "./PersonaSetting";
import JournalAutoUpdateSetting from "./JournalAutoUpdateSetting";
import { TTS_VOICES, DEFAULT_VOICE_ID } from "../constants/voices";
import { mergeVoiceSettings, type VoiceSettings } from "../lib/voiceSettings";

interface Props {
  userId: string;
  homeId: string;
  displayName: string | null;
  email: string | null;
  subscriptionTier: TierId | null;
  aiEnabled?: boolean;
  isBeta?: boolean;
  /** Gates the admin-only "Reset Account Data" testing button in the
   *  Danger Zone. Defaults to false; only admins should see it. */
  isAdmin?: boolean;
  onDisplayNameChange?: (name: string) => void;
  onTierChange?: (tier: TierId, aiEnabled: boolean, perenualEnabled: boolean) => void;
}

type Tab = "account" | "notifications" | "achievements" | "stats";

// Monthly price shown on the plan cards (admin-only during the Stripe sandbox
// phase). Mirrors the Stripe sandbox Prices created for each tier.
const TIER_PRICE_LABEL: Record<TierId, string> = {
  sprout: "Free",
  botanist: "£2.99/mo",
  sage: "£4.99/mo",
  evergreen: "£6.99/mo",
};

// ─── Notification preferences ────────────────────────────────────────────────
// Wave 22.0044 — synced to `user_profiles.notification_prefs` so the
// server (daily-batch + weekly-digest + weekly-optimise-digest) honours
// the same mutes the in-app UI shows. localStorage is kept as a fallback
// for instant first paint while the DB read is in flight.

const LS_NOTIF_PREFS = "rhozly_notif_prefs";

type DigestStyle = "combined" | "per_home";

interface NotificationPrefs {
  master:         boolean;
  watering:       boolean;
  harvesting:     boolean;
  pruning:        boolean;
  weatherAlerts:  boolean;
  goldenHour:     boolean;
  optimiseDigest: boolean;
  weeklyOverview: boolean;
  betaPrompts:    boolean;
  /** Weekly email: one combined email per recipient with sections per home,
   *  or the legacy fan-out (one email per home). */
  digestStyle:    DigestStyle;
  /** "HH:MM" local time the daily task digest is delivered. */
  reminderTime:   string;
}

const DEFAULT_NOTIF_PREFS: NotificationPrefs = {
  master:         true,
  watering:       true,
  harvesting:     true,
  pruning:        true,
  weatherAlerts:  true,
  goldenHour:     true,   // Wave 21.B — wired
  optimiseDigest: true,   // Wave 21.C — wired
  weeklyOverview: true,   // Wave 21.A — new
  betaPrompts:    true,
  digestStyle:    "combined", // Wave 22.0044
  reminderTime:   "08:00",    // local time the daily digest is delivered
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

/** Push the user's current prefs to `user_profiles.notification_prefs`.
 *  Fire-and-forget — failure is non-fatal (the localStorage value is the
 *  source of truth for the UI; the server falls back to "send everything"
 *  when the column is empty). */
async function syncNotifPrefsToServer(uid: string, prefs: NotificationPrefs): Promise<void> {
  try {
    await supabase
      .from("user_profiles")
      .update({ notification_prefs: prefs })
      .eq("uid", uid);
  } catch {
    // ignore — see comment above
  }
}

function NotificationsTab({ userId }: { userId: string }) {
  const [prefs, setPrefs] = useState<NotificationPrefs>(() => loadNotifPrefs());
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported",
  );

  // Wave 22.0044 — pull server prefs on mount so the toggles reflect what
  // the cron functions will actually honour. localStorage is the fallback
  // for offline / first-paint; server wins when present + non-empty.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from("user_profiles")
          .select("notification_prefs")
          .eq("uid", userId)
          .single();
        const remote = data?.notification_prefs;
        if (!cancelled && remote && typeof remote === "object" && Object.keys(remote).length > 0) {
          const merged = { ...DEFAULT_NOTIF_PREFS, ...remote };
          setPrefs(merged);
          saveNotifPrefs(merged);
        }
      } catch {
        // ignore — localStorage prefs already loaded
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const update = (patch: Partial<NotificationPrefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    saveNotifPrefs(next);
    // Fire-and-forget sync to server. Failure is silent — UI state already
    // updated, localStorage already saved, server-fallback semantics mean
    // a sync failure just means the server temporarily falls back to "send".
    void syncNotifPrefsToServer(userId, next);
  };

  const requestBrowserPerm = async () => {
    if (!("Notification" in window)) return;
    const result = await Notification.requestPermission();
    setPermission(result);
  };

  // Boolean categories only — `digestStyle` is rendered separately below as
  // a 2-option radio.
  const categories: Array<{
    key: Exclude<keyof NotificationPrefs, "digestStyle">;
    label: string;
    sub: string;
    icon: React.ReactNode;
    wired: boolean;
  }> = [
    { key: "watering",       label: "Watering reminders",     sub: "When a watering task is due",                                          icon: <Droplets size={14} className="text-sky-500" />,    wired: true  },
    { key: "harvesting",     label: "Harvest reminders",      sub: "When a fruit / veg / herb is ready",                                   icon: <Wheat size={14} className="text-amber-500" />,     wired: true  },
    { key: "pruning",        label: "Pruning reminders",      sub: "When a pruning task is due",                                           icon: <Scissors size={14} className="text-rose-500" />,   wired: true  },
    { key: "weatherAlerts",  label: "Weather alerts",         sub: "Frost · heatwave · heavy rain · strong wind",                          icon: <Cloud size={14} className="text-indigo-500" />,    wired: true  },
    { key: "goldenHour",     label: "Golden hour reminders",  sub: "A photo nudge before sunset",                                          icon: <Sun size={14} className="text-orange-500" />,      wired: true  },
    { key: "optimiseDigest", label: "Weekly optimise digest", sub: "A summary of suggested schedule improvements",                         icon: <Sparkles size={14} className="text-violet-500" />, wired: true  },
    { key: "weeklyOverview", label: "Weekly garden overview", sub: "Sunday morning summary of your week ahead",                            icon: <CalendarIcon size={14} className="text-rhozly-primary" />, wired: true  },
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

      {/* Daily reminder time — when the task digest is delivered (local) */}
      <section className={`bg-white rounded-2xl border border-rhozly-outline/10 p-4 transition-opacity ${prefs.master ? "" : "opacity-50 pointer-events-none"}`}>
        <label className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-black text-rhozly-on-surface">Daily reminder time</p>
            <p className="text-[11px] font-bold text-rhozly-on-surface/50 leading-snug">
              When we send your daily task summary, in your local time.
            </p>
          </div>
          <input
            data-testid="reminder-time-input"
            type="time"
            value={prefs.reminderTime}
            disabled={!prefs.master}
            onChange={(e) => update({ reminderTime: e.target.value || "08:00" })}
            className="shrink-0 rounded-xl border border-rhozly-outline/30 px-3 py-2 text-sm font-bold text-rhozly-on-surface disabled:cursor-not-allowed"
          />
        </label>
      </section>

      {/* Weekly email layout — only meaningful when the weekly overview is on */}
      <section className={`bg-white rounded-2xl border border-rhozly-outline/10 p-4 space-y-3 transition-opacity ${prefs.master && prefs.weeklyOverview ? "" : "opacity-50 pointer-events-none"}`}>
        <div>
          <h3 className="text-xs font-black uppercase tracking-widest text-rhozly-on-surface/40">Weekly email layout</h3>
          <p className="text-[11px] font-medium text-rhozly-on-surface/55 leading-snug mt-1">
            If you're a member of more than one home, choose how the Monday digest is split.
          </p>
        </div>
        <label className="flex items-start gap-3 cursor-pointer py-1">
          <input
            data-testid="notifications-digest-style-combined"
            type="radio"
            name="digestStyle"
            value="combined"
            checked={prefs.digestStyle === "combined"}
            onChange={() => update({ digestStyle: "combined" })}
            disabled={!prefs.master || !prefs.weeklyOverview}
            className="mt-1 accent-rhozly-primary"
          />
          <div className="min-w-0">
            <p className="text-xs font-black text-rhozly-on-surface">One combined email</p>
            <p className="text-[11px] font-medium text-rhozly-on-surface/55 leading-snug">All your homes in a single Monday email, each with its own section.</p>
          </div>
        </label>
        <label className="flex items-start gap-3 cursor-pointer py-1">
          <input
            data-testid="notifications-digest-style-per-home"
            type="radio"
            name="digestStyle"
            value="per_home"
            checked={prefs.digestStyle === "per_home"}
            onChange={() => update({ digestStyle: "per_home" })}
            disabled={!prefs.master || !prefs.weeklyOverview}
            className="mt-1 accent-rhozly-primary"
          />
          <div className="min-w-0">
            <p className="text-xs font-black text-rhozly-on-surface">One email per home</p>
            <p className="text-[11px] font-medium text-rhozly-on-surface/55 leading-snug">The legacy behaviour — separate Monday email for each home.</p>
          </div>
        </label>
      </section>

      {/* Wave 22.0001-A — Voice */}
      <VoiceSection />

      <p className="text-[10px] font-bold text-rhozly-on-surface/40 px-1 leading-snug">
        Preferences sync to your account so the email + push reminders honour them on every device.
      </p>
    </div>
  );
}

// ─── Voice section (Wave 22.0001-A) ────────────────────────────────────
//
// Stores `voice_settings` on `user_profiles` (server-side, syncs across
// devices): { auto_read_assistant_replies, preferred_voice }. The toggle and
// the voice picker both merge into the same jsonb (a plain replace would wipe
// the other field) via `mergeVoiceSettings`.

function VoiceSection() {
  const [userId, setUserId] = useState<string | null>(null);
  const [autoRead, setAutoRead] = useState(false);
  const [voice, setVoice] = useState<string>(DEFAULT_VOICE_ID);
  const [settings, setSettings] = useState<VoiceSettings>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id ?? null;
      if (cancelled) return;
      setUserId(uid);
      if (!uid) { setLoading(false); return; }
      supabase
        .from("user_profiles")
        .select("voice_settings")
        .eq("uid", uid)
        .maybeSingle()
        .then(({ data }) => {
          if (cancelled) return;
          const vs = (data?.voice_settings ?? {}) as VoiceSettings;
          setSettings(vs);
          setAutoRead(!!vs.auto_read_assistant_replies);
          setVoice(vs.preferred_voice || DEFAULT_VOICE_ID);
          setLoading(false);
        });
    });
    return () => { cancelled = true; };
  }, []);

  // Merge the patch into the existing voice_settings and write the WHOLE object
  // (jsonb is replaced on write — toggle + picker must not clobber each other).
  // Reverts optimistic state on failure (supabase-js resolves, not throws, on
  // RLS / DB errors, so a failed write would otherwise look like success).
  const save = async (patch: Partial<VoiceSettings>) => {
    if (!userId) return;
    const prev = { settings, autoRead, voice };
    const merged = mergeVoiceSettings(settings, patch);
    setSettings(merged);
    if (patch.auto_read_assistant_replies !== undefined) setAutoRead(!!patch.auto_read_assistant_replies);
    if (patch.preferred_voice !== undefined) setVoice(patch.preferred_voice);
    setSaving(true);
    try {
      const { error } = await supabase
        .from("user_profiles")
        .update({ voice_settings: merged })
        .eq("uid", userId);
      if (error) throw error;
    } catch {
      setSettings(prev.settings);
      setAutoRead(prev.autoRead);
      setVoice(prev.voice);
      toast.error("Couldn't save voice setting");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="bg-white rounded-2xl border border-rhozly-outline/10 p-4 space-y-3" data-testid="voice-section">
      <h3 className="text-xs font-black uppercase tracking-widest text-rhozly-on-surface/55 flex items-center gap-2">
        <Volume2 size={13} className="text-rhozly-primary" />
        Voice
      </h3>
      <label className="flex items-center justify-between gap-3 cursor-pointer">
        <div className="min-w-0">
          <p className="text-sm font-black text-rhozly-on-surface">Read AI replies aloud</p>
          <p className="text-[11px] font-medium text-rhozly-on-surface/55 leading-snug">
            Garden AI will speak every reply as soon as it lands. Tap the speaker icon on any message to listen on demand. You can also tap the mic to talk to it.
          </p>
        </div>
        <input
          data-testid="voice-auto-read-toggle"
          type="checkbox"
          checked={autoRead}
          disabled={loading || saving || !userId}
          onChange={(e) => save({ auto_read_assistant_replies: e.target.checked })}
          aria-label="Read AI replies aloud"
          className="w-11 h-6 shrink-0 appearance-none rounded-full bg-rhozly-outline/30 checked:bg-rhozly-primary transition-colors relative cursor-pointer
            after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-5 after:h-5 after:bg-white after:rounded-full after:shadow-md after:transition-transform
            checked:after:translate-x-5 disabled:opacity-50 disabled:cursor-wait"
        />
      </label>
      <label className="block">
        <span className="text-sm font-black text-rhozly-on-surface">Voice</span>
        <select
          data-testid="voice-picker"
          value={voice}
          disabled={loading || saving || !userId}
          onChange={(e) => save({ preferred_voice: e.target.value })}
          aria-label="Read-aloud voice"
          className="mt-1 w-full rounded-xl border border-rhozly-outline/30 px-3 py-2 text-sm font-bold text-rhozly-on-surface bg-white disabled:opacity-50 disabled:cursor-wait"
        >
          {TTS_VOICES.map((v) => (
            <option key={v.id} value={v.id}>{v.label}</option>
          ))}
        </select>
      </label>
      <p className="text-[10px] font-bold text-rhozly-on-surface/45 leading-snug">
        Voice uses Google's natural-voice service; clips are cached server-side so re-playing a reply is free. Premium voices sound the most natural; the lightweight option is cheaper to synthesise.
      </p>
    </section>
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

// ─── Data Export Section ─────────────────────────────────────────────────────

function DataExportSection({ userId }: { userId: string }) {
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not signed in.");
      const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL as string;
      const res = await fetch(`${supabaseUrl}/functions/v1/export-user-data`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${session.access_token}`,
          "Content-Type":  "application/json",
        },
        body: "{}",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Export failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rhozly-export-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success("Your data has been downloaded.");
    } catch (err: any) {
      toast.error(err.message ?? "Could not export your data.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <section className="bg-white rounded-2xl border border-rhozly-outline/10 p-4 space-y-3" data-testid="data-export-section">
      <h3 className="text-xs font-black uppercase tracking-widest text-rhozly-on-surface/55 flex items-center gap-2">
        <Save size={13} className="text-rhozly-primary" />
        Your Data
      </h3>
      <p className="text-xs text-rhozly-on-surface/60 font-medium leading-relaxed">
        Download a copy of everything you've added to Rhozly — your homes, plants, plans, journals, tasks, and ailments — as a single JSON file.
      </p>
      <button
        data-testid="data-export-btn"
        onClick={handleExport}
        disabled={exporting}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-rhozly-primary/30 text-rhozly-primary text-xs font-black hover:bg-rhozly-primary/5 transition-colors disabled:opacity-50"
      >
        {exporting ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
        {exporting ? "Preparing…" : "Download my data"}
      </button>
      <p className="text-[10px] font-bold text-rhozly-on-surface/40 leading-snug">
        Limited to 3 exports per hour. Photos are referenced by URL — the JSON doesn't bundle the image files themselves.
      </p>
    </section>
  );
}

// ─── My Beta Feedback Section ───────────────────────────────────────────────

const FEEDBACK_STATUS_META: Record<string, { label: string; classes: string }> = {
  open:         { label: "Awaiting review",   classes: "bg-rhozly-surface-low text-rhozly-on-surface/60" },
  acknowledged: { label: "Acknowledged",      classes: "bg-amber-100 text-amber-800" },
  resolved:     { label: "Resolved",          classes: "bg-emerald-100 text-emerald-800" },
};

function MyFeedbackSection({ userId }: { userId: string }) {
  const [items, setItems] = useState<any[] | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    supabase
      .from("beta_feedback")
      .select("id, action_context, description, ratings, admin_status, admin_response, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => setItems((data ?? []) as any[]));
  }, [userId]);

  if (items === null) return null;
  if (items.length === 0) return null;

  const visible = expanded ? items : items.slice(0, 3);

  return (
    <section className="bg-white rounded-2xl border border-rhozly-outline/10 p-4 space-y-3" data-testid="my-feedback-section">
      <h3 className="text-xs font-black uppercase tracking-widest text-rhozly-on-surface/55 flex items-center gap-2">
        <MessageSquare size={13} className="text-rhozly-primary" />
        My Beta Feedback
        <span className="ml-auto text-[10px] font-bold text-rhozly-on-surface/40 normal-case tracking-normal">
          {items.length} submitted
        </span>
      </h3>
      <ul className="space-y-2">
        {visible.map((item) => {
          const meta = FEEDBACK_STATUS_META[item.admin_status] ?? FEEDBACK_STATUS_META.open;
          return (
            <li
              key={item.id}
              className="bg-rhozly-surface-low/40 rounded-xl px-3 py-2.5 border border-rhozly-outline/10"
              data-testid={`my-feedback-item-${item.id}`}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/45 truncate">
                  {item.action_context}
                </span>
                <span className={`shrink-0 inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full ${meta.classes}`}>
                  {meta.label}
                </span>
              </div>
              <p className="text-xs font-medium text-rhozly-on-surface/75 leading-snug line-clamp-3">
                {item.description || <span className="italic text-rhozly-on-surface/40">No comment</span>}
              </p>
              {item.admin_response && (
                <div className="mt-2 px-2.5 py-1.5 rounded-lg bg-rhozly-primary/5 border-l-2 border-rhozly-primary text-[11px] font-medium text-rhozly-on-surface/80">
                  <span className="font-black text-rhozly-primary">Rhozly:</span> {item.admin_response}
                </div>
              )}
              <p className="text-[10px] font-bold text-rhozly-on-surface/35 mt-1">
                {new Date(item.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
              </p>
            </li>
          );
        })}
      </ul>
      {items.length > 3 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-xs font-black text-rhozly-primary hover:underline"
          data-testid="my-feedback-toggle"
        >
          {expanded ? "Show less" : `Show all ${items.length}`}
        </button>
      )}
    </section>
  );
}

// ─── Account Tab ────────────────────────────────────────────────────────────

function AccountTab({ userId, homeId, displayName, email, subscriptionTier, isAdmin, onDisplayNameChange, onTierChange }: {
  userId: string;
  homeId: string;
  displayName: string | null;
  email: string | null;
  subscriptionTier: TierId | null;
  isAdmin?: boolean;
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

  const [showResetModal, setShowResetModal] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState("");
  const [isResetting, setIsResetting] = useState(false);

  const [pendingTier, setPendingTier] = useState<TierId | null>(subscriptionTier);
  const [showTierConfirmModal, setShowTierConfirmModal] = useState(false);
  const [isSwitchingTier, setIsSwitchingTier] = useState(false);

  // Stripe billing (admin-gated during the sandbox phase — non-admins keep the
  // instant free switch in confirmSwitchTier below). Checkout + the billing
  // portal both redirect to Stripe-hosted pages.
  const [searchParams, setSearchParams] = useSearchParams();
  const [isRedirecting, setIsRedirecting] = useState(false);

  // Handle the redirect back from Stripe Checkout. The webhook is the source of
  // truth for user_profiles; here we optimistically reflect the new tier + toast.
  useEffect(() => {
    const outcome = searchParams.get("checkout");
    if (!outcome) return;
    if (outcome === "success") {
      const t = TIERS.find((x) => x.id === searchParams.get("tier"));
      if (t) {
        toast.success(`✓ Subscribed to ${t.name} — your plan is now active`);
        onTierChange?.(t.id, t.ai_enabled, t.enable_perenual);
      } else {
        toast.success("✓ Subscription active");
      }
    } else if (outcome === "cancelled") {
      toast("Checkout cancelled — no charge was made");
    }
    const next = new URLSearchParams(searchParams);
    next.delete("checkout");
    next.delete("tier");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Keep the selected card in sync with the live saved tier. pendingTier is only
  // seeded from subscriptionTier once (useState initial), so when the tier changes
  // externally (Stripe portal / webhook) the old selection would otherwise linger
  // and keep the "Subscribe" button on screen. Following subscriptionTier deselects
  // it. (A manual card tap still wins until the saved tier actually changes.)
  useEffect(() => {
    setPendingTier(subscriptionTier);
  }, [subscriptionTier]);

  // Returning to this page — full reload, bfcache/back, OR (installed PWA) bringing
  // the app back to the foreground after "Manage billing" opened Stripe in an
  // external browser — can leave the redirect spinner stuck and the tier stale. On
  // every return, clear the spinner and revalidate the tier from the DB so the cards
  // + AI Usage match. The ?checkout= return is owned by the optimistic effect above.
  useEffect(() => {
    let cancelled = false;
    const revalidate = async () => {
      setIsRedirecting(false);
      if (searchParams.get("checkout")) return;
      const { data } = await supabase
        .from("user_profiles")
        .select("subscription_tier, ai_enabled, enable_perenual")
        .eq("uid", userId)
        .maybeSingle();
      if (cancelled || !data?.subscription_tier) return;
      onTierChange?.(
        data.subscription_tier as TierId,
        !!data.ai_enabled,
        !!data.enable_perenual,
      );
    };
    void revalidate();
    const onReturn = () => { void revalidate(); };
    const onVisible = () => { if (document.visibilityState === "visible") void revalidate(); };
    window.addEventListener("pageshow", onReturn);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.removeEventListener("pageshow", onReturn);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function startCheckout(tier: TierId) {
    setIsRedirecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("stripe-create-checkout", {
        body: { tier },
      });
      if (error) throw new Error(error.message ?? "Checkout is unavailable");
      // Already subscribed — switch plans in the billing portal, don't stack a second sub.
      if ((data as { portal?: boolean })?.portal) {
        toast("You're already subscribed — opening billing portal to change plan");
        await openPortal();
        return;
      }
      if (!(data as { url?: string })?.url) throw new Error("Checkout is unavailable");
      window.location.assign((data as { url: string }).url);
    } catch (e: any) {
      setIsRedirecting(false);
      toast.error(e?.message ?? "Could not start checkout");
    }
  }

  async function openPortal() {
    setIsRedirecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("stripe-portal", {});
      if (error || !data?.url) throw new Error(error?.message ?? "Billing portal is unavailable");
      window.location.assign(data.url as string);
    } catch (e: any) {
      setIsRedirecting(false);
      toast.error(e?.message ?? "Could not open billing portal");
    }
  }

  // Admins go through Stripe; everyone else keeps the existing instant switch.
  function handleUpdatePlan() {
    if (isAdmin) {
      if (pendingTier && pendingTier !== "sprout") startCheckout(pendingTier);
      else openPortal(); // downgrade to free is a cancellation — done in the portal
      return;
    }
    setShowTierConfirmModal(true);
  }

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
      .eq("uid", userId);
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

  async function resetAccountData() {
    setIsResetting(true);
    try {
      const { data, error } = await supabase.rpc("reset_own_account_data");
      if (error) throw error;
      const summary = (data ?? {}) as Record<string, number>;
      toast.success(
        `Reset complete — ${summary.homes_left ?? 0} homes wiped. Reloading…`,
      );
      // Hard reload so every cached store (dashboards, profile, onboarding,
      // realtime channels) re-initialises against the empty account.
      setTimeout(() => window.location.assign("/"), 1200);
    } catch (err: any) {
      setIsResetting(false);
      setShowResetModal(false);
      toast.error(err.message ?? "Failed to reset account data");
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
      <section id="plan-section" className="bg-white rounded-2xl border border-rhozly-outline/10 p-4 space-y-3">
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
                {isAdmin && (
                  <p className={`text-[10px] font-black mt-1 ${isSelected ? tier.accentText : "text-rhozly-on-surface/70"}`}>
                    {TIER_PRICE_LABEL[tier.id]}
                  </p>
                )}
              </button>
            );
          })}
        </div>

        {/* Update button — only shown when selection differs from saved tier */}
        {pendingTier && pendingTier !== subscriptionTier && (
          <button
            data-testid="plan-update-btn"
            onClick={handleUpdatePlan}
            disabled={isRedirecting}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-rhozly-primary text-white text-xs font-black transition-opacity disabled:opacity-50"
          >
            {isRedirecting ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            {isAdmin && pendingTier !== "sprout"
              ? `Subscribe — ${TIER_PRICE_LABEL[pendingTier]}`
              : "Update Plan"}
          </button>
        )}

        {/* Manage billing — admin-gated Stripe portal (cancel / change card / invoices) */}
        {isAdmin && (
          <button
            data-testid="plan-manage-billing-btn"
            onClick={openPortal}
            disabled={isRedirecting}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-rhozly-outline/20 text-xs font-black text-rhozly-on-surface/70 hover:bg-rhozly-surface transition-colors disabled:opacity-50"
          >
            <CreditCard size={13} />
            Manage billing
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
      <AIUsagePanel homeId={homeId} userId={userId} tier={subscriptionTier} />

      <SearchSourceSection userId={userId} />

      {/* Accessibility */}
      <AccessibilitySection />

      {/* My Beta Feedback (only renders for users with at least one submission) */}
      <MyFeedbackSection userId={userId} />

      {/* Data Export */}
      <DataExportSection userId={userId} />

      {/* Danger Zone */}
      <section className="bg-white rounded-2xl border border-red-200 p-4 space-y-3">
        <h3 className="text-xs font-black uppercase tracking-widest text-red-500">Danger Zone</h3>
        <p className="text-xs text-rhozly-on-surface/60 font-medium leading-relaxed">
          Permanently delete your account and all associated data. This cannot be undone.
        </p>
        <div className="flex flex-wrap gap-2">
          {isAdmin && (
            <button
              data-testid="reset-account-btn"
              onClick={() => { setShowResetModal(true); setResetConfirmText(""); }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-amber-300 text-amber-700 text-xs font-black hover:bg-amber-50 transition-colors"
              title="Admin-only testing tool — wipes garden data but keeps your login"
            >
              <AlertTriangle size={13} />
              Reset Account Data
            </button>
          )}
          <button
            data-testid="delete-account-btn"
            onClick={() => { setShowDeleteModal(true); setDeleteConfirmText(""); }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-red-300 text-red-600 text-xs font-black hover:bg-red-50 transition-colors"
          >
            <Trash2 size={13} />
            Delete Account
          </button>
        </div>
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

      {/* Reset confirmation modal — admin testing tool */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                  <AlertTriangle size={16} className="text-amber-600" />
                </div>
                <h2 className="text-sm font-black text-rhozly-on-surface">Reset Account Data</h2>
              </div>
              <button
                onClick={() => setShowResetModal(false)}
                className="text-rhozly-on-surface/30 hover:text-rhozly-on-surface transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <ul className="text-xs text-rhozly-on-surface/70 font-medium space-y-1.5 pl-1">
              <li className="flex gap-2"><span className="text-amber-500 shrink-0">•</span>Your homes, plants, tasks, plans, notes, and ailments will be deleted</li>
              <li className="flex gap-2"><span className="text-amber-500 shrink-0">•</span>Onboarding, preferences, and notifications are cleared so the next sign-in is a fresh-account experience</li>
              <li className="flex gap-2"><span className="text-amber-500 shrink-0">•</span>Your login, email, subscription tier, and avatar are kept</li>
              <li className="flex gap-2"><span className="text-amber-500 shrink-0">•</span>Community guides you've written stay live as Anonymous</li>
            </ul>

            <div className="space-y-2">
              <p className="text-xs font-black text-rhozly-on-surface/60 uppercase tracking-widest">
                Type RESET to confirm
              </p>
              <input
                data-testid="reset-account-confirm-input"
                type="text"
                value={resetConfirmText}
                onChange={(e) => setResetConfirmText(e.target.value)}
                placeholder="RESET"
                className="w-full text-sm font-bold text-rhozly-on-surface bg-rhozly-surface rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setShowResetModal(false)}
                disabled={isResetting}
                className="flex-1 py-2.5 rounded-xl border border-rhozly-outline/20 text-xs font-black text-rhozly-on-surface/60 hover:bg-rhozly-surface transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                data-testid="reset-account-confirm-btn"
                onClick={resetAccountData}
                disabled={resetConfirmText !== "RESET" || isResetting}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-amber-500 text-white text-xs font-black disabled:opacity-40 transition-opacity"
              >
                {isResetting ? <Loader2 size={13} className="animate-spin" /> : <AlertTriangle size={13} />}
                {isResetting ? "Resetting…" : "Reset Data"}
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

export default function GardenerProfile({ userId, homeId, displayName, email, subscriptionTier, aiEnabled = false, isBeta = false, isAdmin = false, onDisplayNameChange, onTierChange }: Props) {
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

  // "Customise quick launcher" deep link (?section=quick-launcher): ensure the
  // Account tab (where the picker lives) is active, scroll to it, strip param.
  useEffect(() => {
    if (params.get("section") !== "quick-launcher") return;
    setTabState("account");
    const t = setTimeout(() => {
      document.getElementById("quick-launcher-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 350);
    const p = new URLSearchParams(params);
    p.delete("section");
    setParams(p, { replace: true });
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "See plans" deep link (?section=plans): the tier-locked UpgradeNudge banners
  // route here (RHO-12). Force the Account tab (where the plan picker lives),
  // scroll to the "Your Plan" section, then strip the param. Depends on the
  // section value (not just mount) so it still fires when a nudge is tapped
  // while already on /gardener.
  useEffect(() => {
    if (params.get("section") !== "plans") return;
    setTabState("account");
    const t = setTimeout(() => {
      document.getElementById("plan-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 350);
    const p = new URLSearchParams(params);
    p.delete("section");
    setParams(p, { replace: true });
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.get("section")]);

  // Avatar — fetched on mount; updated via PhotoUploader.
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarLoading, setAvatarLoading] = useState(false);
  useEffect(() => {
    supabase
      .from("user_profiles")
      .select("avatar_url")
      .eq("uid", userId)
      .maybeSingle()
      .then(({ data }) => setAvatarUrl(data?.avatar_url ?? null));
  }, [userId]);
  const handleAvatarUpload = async (file: File) => {
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Avatar must be under 2MB.");
      return;
    }
    setAvatarLoading(true);
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase().slice(0, 5);
      const path = `${userId}/avatar-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("plant-images")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from("plant-images").getPublicUrl(path);
      const { error: dbError } = await supabase
        .from("user_profiles")
        .update({ avatar_url: publicUrl })
        .eq("uid", userId);
      if (dbError) throw dbError;
      setAvatarUrl(publicUrl);
      toast.success("Avatar updated.");
    } catch (err: any) {
      toast.error("Could not update avatar — please try again.");
    } finally {
      setAvatarLoading(false);
    }
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
        <label
          htmlFor="avatar-upload-input"
          className="relative w-14 h-14 rounded-full bg-rhozly-primary-container flex items-center justify-center shrink-0 overflow-hidden cursor-pointer group focus-within:ring-2 focus-within:ring-rhozly-primary"
          title="Change avatar"
          data-testid="gardener-profile-avatar"
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt="Your avatar"
              className="w-full h-full object-cover"
            />
          ) : (
            <User size={24} className="text-rhozly-primary" />
          )}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
            {avatarLoading ? (
              <Loader2 size={14} className="text-white animate-spin" />
            ) : (
              <span className="text-[9px] font-black uppercase tracking-widest text-white">Change</span>
            )}
          </div>
          <input
            id="avatar-upload-input"
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) handleAvatarUpload(f);
            }}
            data-testid="gardener-profile-avatar-input"
          />
        </label>
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
        <div className="space-y-5">
          <AccountTab
            userId={userId}
            homeId={homeId}
            displayName={displayName}
            email={email}
            subscriptionTier={subscriptionTier}
            isAdmin={isAdmin}
            onDisplayNameChange={onDisplayNameChange}
            onTierChange={onTierChange}
          />
          <PersonaSetting userId={userId} />
          <JournalAutoUpdateSetting userId={userId} />
          <div id="quick-launcher-section" />
          <QuickLauncherPicker
            userId={userId}
            homeId={homeId ?? null}
            subscriptionTier={
              (subscriptionTier as
                | "sprout"
                | "botanist"
                | "sage"
                | "evergreen"
                | null) ?? null
            }
            aiEnabled={aiEnabled}
            isBeta={isBeta}
          />
        </div>
      )}

      {tab === "notifications" && (
        <NotificationsTab userId={userId} />
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
