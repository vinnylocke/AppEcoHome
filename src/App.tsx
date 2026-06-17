import { Toaster, toast } from "react-hot-toast";
import React, { useEffect, useState, useCallback, useMemo, useRef, lazy, Suspense } from "react";
import { createPortal } from "react-dom";
import { supabase } from "./lib/supabase";
import {
  Menu,
  Home,
  Loader2,
  X,
  MapPin,
  RefreshCw,
  AlertCircle,
  HelpCircle,
  Zap,
  BookOpen,
  NotebookPen,
} from "lucide-react";
import { IconPlants, IconPlanner, IconDoctor, IconAI, IconIntegrations } from "./constants/icons";

// 🚀 NATIVE IMPORT
import { App as CapApp } from "@capacitor/app";

// 🚀 ROUTER
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Analytics as VercelAnalytics } from "@vercel/analytics/react";
import SurfaceLoader from "./components/shared/SurfaceLoader";

// Components — always needed on first render (keep eager)
import LocationTile from "./components/LocationTile";
import { HomeDropdown } from "./components/HomeDropdown";
import { LocationPage } from "./components/LocationPage";
import { Auth } from "./components/Auth";
import { HomeSetup } from "./components/HomeSetup";
import type { UserProfile } from "./types";
import { Logger } from "./lib/errorHandler";
import { withRetry } from "./lib/withRetry";
import {
  readDashboardCache,
  writeDashboardCache,
  clearAllDashboardCaches,
  purgeLegacyV1DashboardCaches,
} from "./lib/dashboardCache";
import { clearLocalPins as clearQuickLauncherPins } from "./lib/quickLauncherPrefs";
import * as Sentry from "@sentry/react";
import WeatherForecast from "./components/WeatherForecast";
import { WeatherAlertBanner } from "./components/WeatherAlertBanner";
import TheShed from "./components/TheShed";
import TaskCalendar from "./components/TaskCalendar";
import { usePushNotifications } from "./hooks/usePushNotifications";
import PullToRefresh from "./components/PullToRefresh";
import { PlantDoctorProvider } from "./context/PlantDoctorContext";
import { HomeRealtimeProvider } from "./context/HomeRealtimeContext";
import { HomePermissionsProvider } from "./context/HomePermissionsContext";
import { useHomeRealtime } from "./hooks/useHomeRealtime";
import PlantDoctorChat from "./components/PlantDoctorChat";
import ErrorPage from "./components/ErrorPage";
import { type TierId } from "./constants/tiers";
import UserProfileDropdown from "./components/UserProfileDropdown";
import GlobalQuickAdd from "./components/GlobalQuickAdd";
import GlobalSearch from "./components/GlobalSearch";
import OfflineBadge from "./components/OfflineBadge";
import QueuedActionsBadge from "./components/QueuedActionsBadge";
import NavItem from "./components/NavItem";
import UpdateBanner from "./components/UpdateBanner";
import MaintenanceScreen from "./components/MaintenanceScreen";
import { useMaintenanceMode } from "./hooks/useMaintenanceMode";
import { useAppVersion } from "./hooks/useAppVersion";
import { useIsMobile } from "./hooks/useIsMobile";
import PrivacyPolicyModal from "./components/PrivacyPolicyModal";
import CookiePolicyModal from "./components/CookiePolicyModal";
import ReleaseNotesModal from "./components/ReleaseNotesModal";
import { useReleaseNotes } from "./hooks/useReleaseNotes";
import HelpCenter from "./onboarding/HelpCenter";
import GettingStartedChecklist from "./components/GettingStartedChecklist";
import NotificationOptInCard from "./components/NotificationOptInCard";
import DailyBriefCard from "./components/DailyBriefCard";
import InstallPwaPrompt from "./components/InstallPwaPrompt";
import WelcomeModal from "./components/WelcomeModal";
import type { OnboardingState } from "./onboarding/types";
import { BetaFeedbackProvider } from "./context/BetaFeedbackContext";
import BetaFeedbackSheet from "./components/BetaFeedbackSheet";
import BetaFeedbackBanner from "./components/BetaFeedbackBanner";

// Heavy route components — lazy loaded so they don't bloat the initial bundle
const HomeDashboard       = lazy(() => import("./components/HomeDashboard"));
const AdminGuideGenerator = lazy(() => import("./components/AdminGuideGenerator"));
const PlantLibraryAdmin = lazy(() => import("./components/admin/PlantLibraryAdmin"));
const PlantDoctor         = lazy(() => import("./components/PlantDoctor"));
const QuickAccessHome     = lazy(() => import("./components/QuickAccessHome"));
const LocalizedTaskCalendar = lazy(() => import("./components/quick/LocalizedTaskCalendar"));
const GlobalJournal         = lazy(() => import("./components/GlobalJournal"));
const WeeklyOverviewPage    = lazy(() => import("./components/WeeklyOverviewPage"));
const NotesPage             = lazy(() => import("./components/notes/NotesPage"));
const CreditsPage           = lazy(() => import("./components/CreditsPage"));
const GardenWalk            = lazy(() => import("./components/walk/GardenWalk"));
const MobileNavDrawer       = lazy(() => import("./components/MobileNavDrawer"));
const QuickAccessMenuButton = lazy(() => import("./components/QuickAccessMenuButton"));
const LightSensor         = lazy(() => import("./components/LightSensor"));
const SunTrajectoryAR     = lazy(() => import("./components/SunTrajectoryAR"));
const GuideList           = lazy(() => import("./components/GuideList"));
const BlueprintManager    = lazy(() => import("./components/BlueprintManager"));
const PlantVisualiser     = lazy(() => import("./components/PlantVisualiser"));
const GardenLayoutList    = lazy(() => import("./components/GardenLayoutList"));
const GardenLayoutEditor  = lazy(() => import("./components/GardenLayoutEditor"));
const SharedGardenLayout  = lazy(() => import("./components/garden/SharedGardenLayout"));
const JoinHomeViaToken    = lazy(() => import("./components/JoinHomeViaToken"));
const HomeManagement      = lazy(() => import("./components/HomeManagement"));
const GardenHub           = lazy(() => import("./components/GardenHub"));
const PlannerHub          = lazy(() => import("./components/PlannerHub"));
const ToolsHub            = lazy(() => import("./components/ToolsHub"));
const IntegrationsPage    = lazy(() => import("./components/integrations/IntegrationsPage"));
const GardenProfile       = lazy(() => import("./components/GardenProfile"));
const GardenerProfile     = lazy(() => import("./components/GardenerProfile"));
const LocationManager     = lazy(() => import("./components/LocationManager").then(m => ({ default: m.LocationManager })));
const AssistantCard       = lazy(() => import("./components/AssistantCard"));
const AuditPage           = lazy(() => import("./components/AuditPage"));
import { extractCurrentWeather } from "./lib/clientCache";
import { getLocalDateString } from "./lib/taskEngine";

// Service worker update checks + background-time reload safety net.
if ("serviceWorker" in navigator) {
  // When the SW changes controller (new SW activated), reload so old JS
  // doesn't run with the new SW's cache (mismatched chunk hashes = white screen).
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    window.location.reload();
  });

  navigator.serviceWorker.ready.then((registration) => {
    registration.update();

    let hiddenAt = 0;
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
      } else if (document.visibilityState === "visible") {
        // Check for a new SW version each time the app comes to the foreground.
        registration.update();

        // If a new SW is already waiting (deployed while the app was in the
        // background), activate it immediately. The user wasn't looking at the
        // app so there is nothing to lose, and the controllerchange listener
        // above will reload the page cleanly with the new SW's fresh cache —
        // preventing the white screen caused by old JS loading new chunk hashes.
        // Guard: hiddenAt > 0 ensures we were actually backgrounded first —
        // without this, visibilitychange fires on initial page load and triggers
        // an immediate SKIP_WAITING → reload → loop → white screen on mobile.
        if (hiddenAt > 0 && registration.waiting) {
          registration.waiting.postMessage({ type: "SKIP_WAITING" });
          return;
        }

        // Fallback: if the OS killed the WebView process (common on iOS under
        // memory pressure) and there is no waiting SW to activate, a hard
        // reload after 30 min in the background recovers any broken state.
        if (hiddenAt > 0 && Date.now() - hiddenAt > 30 * 60 * 1000) {
          window.location.reload();
        }
      }
    });
  });
}


export default function App() {
  const { isOn, message } = useMaintenanceMode();
  if (isOn) return <MaintenanceScreen message={message} />;
  return (
    <BrowserRouter>
      <Routes>
        {/* Public read-only routes — bypass the auth-gated AppShell entirely */}
        <Route path="/share/garden-layout/:token" element={
          <Suspense fallback={null}>
            <SharedGardenLayout />
          </Suspense>
        } />
        {/* UX review 2026-06-15 item 5.1 — invite redemption.
            Rendered outside AppShell so an invitee can land on the page
            before signing in (the component itself stashes the token +
            bounces to /auth via navigate("/") when no session is present). */}
        <Route path="/join/:token" element={
          <Suspense fallback={null}>
            <JoinHomeViaToken />
          </Suspense>
        } />
        <Route path="*" element={<AppShell />} />
      </Routes>
      <UpdateBanner />
      <VercelAnalytics />
    </BrowserRouter>
  );
}

const TAB_URL: Record<string, string> = {
  quick:           "/quick",
  quick_calendar:  "/quick/calendar",
  journal:         "/journal",
  notes:           "/notes",
  dashboard:       "/dashboard",
  task_management: "/schedule",
  shed:            "/shed",
  watchlist:       "/watchlist",
  visualiser:      "/visualiser",
  planner:         "/planner",
  doctor:          "/doctor",
  garden_profile:  "/profile",
  lightsensor:     "/lightsensor",
  guides:          "/guides",
  management:      "/management",
  garden_layout:    "/garden-layout",
  shopping:         "/shopping",
  home_management:  "/home-management",
  admin_guides:     "/admin/guides",
  tools:            "/tools",
  integrations:     "/integrations",
};

function AppShell() {
  usePushNotifications();
  const versionState = useAppVersion();
  // Backwards-compat alias — `appVersion` was previously the only
  // value the rest of this file referenced. Now there are two: the
  // BUNDLE version (what the user is actually running) and the DB
  // version (what's available). Error pages, release-notes modal,
  // etc. should always report the bundle version so the displayed
  // version matches the code that printed the error.
  const appVersion = versionState.bundleVersion;
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const isMobile = useIsMobile();
  // Mobile Quick Access Wave 6 — focus-mode shell on /quick/* mobile routes:
  // hide the top bar + persistent side nav, expose nav via an overlay drawer.
  // Garden Walk at /walk shares the focus-mode treatment.
  const isFocusMode =
    isMobile &&
    (routerLocation.pathname.startsWith("/quick") ||
      routerLocation.pathname.startsWith("/walk"));
  const [quickDrawerOpen, setQuickDrawerOpen] = useState(false);

  // One-shot purge of legacy v1 dashboard cache entries on app mount.
  // v1 snapshots cached a serialised lucide forwardRef which crashed
  // the dashboard on hydration; v2 strips it AND recomputes on read.
  useEffect(() => {
    purgeLegacyV1DashboardCaches();
  }, []);

  // Close the drawer whenever the route changes (e.g. after picking a link).
  useEffect(() => {
    setQuickDrawerOpen(false);
  }, [routerLocation.pathname]);

  // Close the drawer if the viewport stops being mobile.
  useEffect(() => {
    if (!isFocusMode) setQuickDrawerOpen(false);
  }, [isFocusMode]);

  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoadError, setProfileLoadError] = useState(false);
  const [isAddingHome, setIsAddingHome] = useState(false);
  const [locations, setLocations] = useState<any[]>([]);
  const [weather, setWeather] = useState<any>(null);
  const [rawWeather, setRawWeather] = useState<any>(null);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [dashboardError, setDashboardError] = useState(false);
  const [dashboardLoaded, setDashboardLoaded] = useState(false);
  const [isHomeLoading, setIsHomeLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [locationTaskCounts, setLocationTaskCounts] = useState<Record<string, number>>({});
  const [overdueTaskCount, setOverdueTaskCount] = useState(0);
  const [homeLatLng, setHomeLatLng] = useState<{ lat: number | null; lng: number | null }>({ lat: null, lng: null });
  const [hardinessZone, setHardinessZone] = useState<number | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [, setSyncTick] = useState(0);
  // Re-render every 15s so the "Synced Xs ago" text stays accurate
  useEffect(() => {
    const id = setInterval(() => setSyncTick((n) => n + 1), 15000);
    return () => clearInterval(id);
  }, []);

  // Mobile Nav State
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [helpCenterOpen, setHelpCenterOpen] = useState(false);
  const [isMdBreakpoint, setIsMdBreakpoint] = useState(() => window.matchMedia("(min-width: 768px)").matches);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showCookies, setShowCookies] = useState(false);
  const allReleaseNotes = useReleaseNotes();
  const [releaseNotesMode, setReleaseNotesMode] = useState<"latest" | "history" | null>(null);

  // Filter release notes to only versions the user is ACTUALLY running.
  // The DB row for a new version is written by the deploy script before
  // the bundle finishes rolling out — without this filter, "What's new"
  // would show bullets for code the user hasn't yet received.
  const filteredReleaseNotes = useMemo(() => {
    const bundleKey = versionState.bundleVersionKey;
    if (!bundleKey) return [];
    const [bMajorStr, bMinorStr] = bundleKey.split(".");
    const bMajor = Number(bMajorStr);
    const bMinor = Number(bMinorStr);
    if (!Number.isFinite(bMajor) || !Number.isFinite(bMinor)) return allReleaseNotes;
    return allReleaseNotes.filter(
      (n) => n.major < bMajor || (n.major === bMajor && n.minor <= bMinor),
    );
  }, [allReleaseNotes, versionState.bundleVersionKey]);

  // Release notes — fire when the BUNDLE the user is running has a new
  // version they haven't seen yet. Two gates:
  //   1. Skip the "00.0000" sentinel (local dev / missing build stamp).
  //   2. Skip when an update is currently available — the user is about
  //      to reload onto the new bundle; showing "what's new in X" while
  //      they're still on bundle X-1 makes the timing confusing.
  // Keying off `bundleVersionKey` (not the DB version) ensures notes
  // land AFTER the reload, not while the user is still on stale code.
  useEffect(() => {
    const versionKey = versionState.bundleVersionKey;
    if (!versionKey) return;
    if (versionKey === "00.0000") return;
    if (versionState.updateAvailable) return;
    const lastSeen = localStorage.getItem("rhozly_last_seen_version");
    if (lastSeen !== versionKey) {
      localStorage.setItem("rhozly_last_seen_version", versionKey);
      if (lastSeen !== null) {
        setReleaseNotesMode("latest");
        sessionStorage.setItem("rhozly_just_saw_release_notes", "true");
      }
    }
  }, [versionState.bundleVersionKey, versionState.updateAvailable]);

  // (The `pwa-update-available` event is now dispatched directly by
  // `useAppVersion` when its poller spots a mismatch — no need for a
  // duplicate effect here. The SW path still fires the same event from
  // `main.tsx#onNeedRefresh`, and UpdateBanner dedupes both.)

  // Onboarding state — kept in sync with profile.onboarding_state
  const [onboardingState, setOnboardingState] = useState<OnboardingState>({});
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);

  // First-run welcome modal — only for users who:
  //   1) have never seen/dismissed it (onboarding_state.welcome_modal absent)
  //   2) have no locations yet (so existing pre-feature users don't get surprised)
  // dashboardLoaded ensures we don't flash the modal before locations are known.
  useEffect(() => {
    if (!profile?.home_id) return;
    if (!dashboardLoaded) return;
    const status = onboardingState["welcome_modal"];
    if (status === "completed" || status === "dismissed") return;
    if (locations.length > 0) return;
    setShowWelcomeModal(true);
  }, [profile?.home_id, dashboardLoaded, locations.length, onboardingState]);

  // UX review 2026-06-15 item 1.1 — Defer tier selection.
  //
  // When a user lands with a home but no subscription_tier, auto-assign
  // 'sprout' (free) so they go straight to the dashboard. They upgrade
  // later via /gardener?tab=subscription. Fire-and-forget — local state
  // updates optimistically.
  const defaultTierAppliedRef = useRef(false);
  useEffect(() => {
    if (defaultTierAppliedRef.current) return;
    if (!profile?.home_id) return;
    if (profile.subscription_tier) return;
    if (!session?.user?.id) return;
    defaultTierAppliedRef.current = true;
    const uid = session.user.id;
    void (async () => {
      try {
        await supabase
          .from("user_profiles")
          .update({
            subscription_tier: "sprout",
            ai_enabled: false,
            enable_perenual: false,
          })
          .eq("uid", uid);
      } catch (err) {
        Logger.error("Failed to default new user to sprout tier", err);
      }
      setProfile((prev: any) => prev
        ? { ...prev, subscription_tier: "sprout", ai_enabled: false, enable_perenual: false }
        : prev);
    })();
  }, [profile?.home_id, profile?.subscription_tier, session?.user?.id]);

  useEffect(() => {
    const handleDeepLink = async () => {
      CapApp.addListener("appUrlOpen", async (event) => {
        Logger.log("Deep link received: " + event.url);

        const url = new URL(event.url.replace("#", "?"));
        const accessToken = url.searchParams.get("access_token");
        const refreshToken = url.searchParams.get("refresh_token");

        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (!error) {
            Logger.success("Login Successful!");
          } else {
            Logger.error("Native session restoration failed", error, {}, "Sign-in failed — please try again.");
          }
        }
      });
    };

    handleDeepLink();

    return () => {
      CapApp.removeAllListeners();
    };
  }, []);

  useEffect(() => {
    if (!profile?.home_id) return;

    // Browser notification permission is now requested via the explicit
    // dashboard opt-in card (NotificationOptInCard) — not auto-requested
    // on load. This avoids the dreaded "Allow notifications?" prompt
    // before the user understands what they'll receive.

    const notificationChannel = supabase
      .channel("system-notifications")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `home_id=eq.${profile.home_id}`,
        },
        (payload) => {
          const { title, body } = payload.new;

          if (
            "Notification" in window &&
            Notification.permission === "granted"
          ) {
            try {
              new Notification(title, {
                body: body,
                icon: "/images/logo_small_rhozly.png",
              });
              toast.success(`📲 OS Notification:\n${title}`, {
                duration: 4000,
              });
            } catch (err) {
              toast.success(`${title}\n${body}`, { duration: 6000 });
            }
          } else {
            toast.success(`${title}\n${body}`, { duration: 6000 });
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(notificationChannel);
    };
  }, [profile?.home_id]);

  const [searchParams, setSearchParamsForView] = useSearchParams();
  const selectedLocationId = searchParams.get("locationId");
  const dashboardView = (searchParams.get("view") as "dashboard" | "locations" | "calendar" | "weather") || "dashboard";

  // Persist last selected dashboard view; restore on first visit to /dashboard with no view param.
  // Restore only runs once per mount — otherwise clicking the "Dashboard" sub-tab from a non-default
  // view would immediately be reverted by the saved value, making the default view unreachable.
  const hasRestoredViewRef = useRef(false);
  useEffect(() => {
    if (routerLocation.pathname !== "/dashboard") return;
    if (selectedLocationId) return; // viewing a specific location, not switching views
    const urlView = searchParams.get("view");
    if (urlView) {
      // User has an explicit view — remember it and mark restore as resolved
      localStorage.setItem("rhozly_dashboard_view", urlView);
      hasRestoredViewRef.current = true;
      return;
    }
    // No view param — only restore on first mount; subsequent clicks to "Dashboard" sub-tab must stick
    if (hasRestoredViewRef.current) {
      // User explicitly chose the default view this session — record it so next session opens here too
      localStorage.setItem("rhozly_dashboard_view", "dashboard");
      return;
    }
    hasRestoredViewRef.current = true;
    const saved = localStorage.getItem("rhozly_dashboard_view");
    if (saved && saved !== "dashboard" && ["locations", "calendar", "weather"].includes(saved)) {
      const next = new URLSearchParams(searchParams);
      next.set("view", saved);
      setSearchParamsForView(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routerLocation.pathname, searchParams.toString()]);
  const [isNavCollapsed, setIsNavCollapsed] = useState(
    () => localStorage.getItem("rhozly_nav") === "true",
  );
  const [quizCompleted, setQuizCompleted] = useState<boolean | null>(null);
  const [quizPromptDismissed, setQuizPromptDismissed] = useState(false);
  const [quizPromptFading, setQuizPromptFading] = useState(false);
  const [quizPromptConfirmDismiss, setQuizPromptConfirmDismiss] = useState(false);

  // UX review 2026-06-15 item 1.4 — quiz re-prompt mechanic.
  // Previously a permanent in-memory dismiss; now a server-persisted snooze
  // date inside onboarding_state. "Hide for now" snoozes 14 days; "Don't ask
  // again" sets ~100 years out. Re-prompt eligibility = no snooze OR snooze
  // date <= today.
  const QUIZ_PROMPT_SNOOZE_KEY = "quiz_prompt_snoozed_until";
  const quizPromptSnoozedUntil = onboardingState[QUIZ_PROMPT_SNOOZE_KEY] as
    | string
    | undefined;
  const quizPromptIsSnoozed =
    typeof quizPromptSnoozedUntil === "string" &&
    quizPromptSnoozedUntil > new Date().toISOString().split("T")[0];
  const persistQuizPromptSnooze = async (days: number) => {
    if (!session?.user?.id) return;
    const target = new Date();
    target.setDate(target.getDate() + days);
    const isoDate = target.toISOString().split("T")[0];
    const nextState: OnboardingState = {
      ...onboardingState,
      [QUIZ_PROMPT_SNOOZE_KEY]: isoDate,
    };
    setOnboardingState(nextState);
    try {
      await supabase
        .from("user_profiles")
        .update({ onboarding_state: nextState })
        .eq("uid", session.user.id);
    } catch (err) {
      Logger.error("Failed to persist quiz prompt snooze", err);
    }
  };

  useEffect(() => {
    if (!profile?.home_id || !session?.user?.id) return;
    let cancelled = false;
    const homeIdSnapshot = profile.home_id;
    const userIdSnapshot = session.user.id;
    withRetry(
      () =>
        supabase
          .from("home_quiz_completions")
          .select("id")
          .eq("home_id", homeIdSnapshot)
          .eq("user_id", userIdSnapshot)
          .maybeSingle(),
      { retries: 2, label: "quizCompletion" },
    )
      .then(({ data, error }) => {
        if (cancelled) return;
        // Critical: on a transient error we KEEP `quizCompleted = null`
        // ("unknown") rather than flipping to `false`. The prompt only
        // surfaces on an explicit `false`, so an unreliable network can
        // no longer trick the user into being told they need to redo a
        // quiz they've already finished.
        if (error) {
          Logger.error("Quiz completion check failed — keeping unknown", error);
          return;
        }
        setQuizCompleted(!!data);
      })
      .catch((err) => {
        if (cancelled) return;
        Logger.error("Quiz completion check threw — keeping unknown", err);
      });
    return () => { cancelled = true; };
  }, [profile?.home_id, session?.user?.id]);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const handler = (e: MediaQueryListEvent) => {
      setIsMdBreakpoint(e.matches);
      if (e.matches) setIsMobileSidebarOpen(false);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Global keyboard shortcut: "?" opens the Help Center (when not currently typing)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "?") return;
      const target = e.target as HTMLElement;
      const isTyping = target && (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        (target as any).isContentEditable
      );
      if (isTyping) return;
      e.preventDefault();
      setHelpCenterOpen((v) => !v);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    localStorage.setItem("rhozly_nav", isNavCollapsed.toString());
  }, [isNavCollapsed]);

  const fetchDashboardData = useCallback(async () => {
    if (!profile?.home_id) return;

    setDashboardError(false);

    // Local-first cache — hydrate the entire dashboard state from
    // localStorage IMMEDIATELY so the first paint isn't blank while
    // the network catches up. The cache is overwritten at the end of
    // the successful fetch path (and on realtime / nav-back), so a
    // background revalidation always wins eventually. The legacy
    // sessionStorage caches stay as a secondary fallback for now —
    // they'll be deleted in a follow-up release.
    const cached = readDashboardCache(profile.home_id);
    if (cached) {
      const s = cached.snapshot;
      setRawWeather(s.rawWeather);
      // Recompute `weather` from `rawWeather` rather than using the
      // cached value — `weather.Icon` is a lucide forwardRef object
      // whose function/Symbol fields get dropped by JSON.stringify,
      // leaving `Icon = {}` after a cache round-trip. Rendering that
      // empty object as `<weather.Icon />` throws React #130. The icon
      // is derived from the weather code in rawWeather, so we can
      // reconstruct it deterministically on every read.
      try {
        setWeather(extractCurrentWeather(s.rawWeather));
      } catch {
        setWeather(null);
      }
      setLocations(s.locations as any[]);
      if (s.homeLatLng) setHomeLatLng(s.homeLatLng);
      if (s.hardinessZone != null) setHardinessZone(s.hardinessZone);
      setOverdueTaskCount(s.overdueTaskCount);
      setAlerts(s.alerts as any[]);
      setLocationTaskCounts(s.locationTaskCounts);
      // Flip dashboardLoaded so any "skeleton vs data" gate paints data
      // immediately. The network revalidation will still flip it to true
      // again later, which is a no-op.
      setDashboardLoaded(true);
    }

    try {
    // Hardened: a single network blip used to leave the dashboard
    // stuck in the loading skeleton with no recovery. `withRetry` now
    // covers 2 transient failures with backoff + a 10s timeout per
    // attempt before surfacing the error to the outer catch.
    const { data, error } = await withRetry(
      () =>
        supabase
          .from("homes")
          .select(
            `
            *,
            weather_snapshots ( data, updated_at ),
            locations (
              *,
              areas ( id, name ),
              inventory_items ( id, status )
            )
          `,
          )
          .eq("id", profile.home_id!)
          .maybeSingle(),
      { retries: 2, label: "fetchDashboardData.homes" },
    );

    if (error) {
      Logger.error("Failed to fetch home data", error);
      // No toast — the inline retry card on /dashboard handles this
      // properly. Toasting globally pestered users who had already
      // navigated to another route while the fetch was still in flight.
      setDashboardError(true);
      setDashboardLoaded(true);
      return;
    }

    // Accumulate the values we're about to set so the local-first cache
    // write at the end of this function gets the same data the React
    // state will hold. setState updates are async — reading state back
    // here would race; the accumulator is the source of truth.
    let snapshotHomeLatLng: { lat: number | null; lng: number | null } | null = null;
    let snapshotHardinessZone: number | null = null;
    let snapshotLocations: unknown[] = [];
    let snapshotAlerts: unknown[] = [];
    let snapshotLocationTaskCounts: Record<string, number> = {};
    let snapshotOverdueTaskCount = 0;
    let snapshotRawWeather: unknown = null;
    let snapshotWeather: unknown = null;

    if (data) {
      // Capture home lat/lng + hardiness zone for Daily Brief
      snapshotHomeLatLng = { lat: (data as any).lat ?? null, lng: (data as any).lng ?? null };
      snapshotHardinessZone = (data as any).hardiness_zone ?? null;
      setHomeLatLng(snapshotHomeLatLng);
      setHardinessZone(snapshotHardinessZone);

      if (data.locations) {
        snapshotLocations = data.locations;
        setLocations(data.locations);

        const locationIds = data.locations.map((l: any) => l.id);
        if (locationIds.length > 0) {
          const todayStr = getLocalDateString(new Date());

          // Fetch alerts, today's physical tasks, overdue tasks, and blueprints in parallel
          const [alertResult, todayTasksResult, overdueResult, bpResult] = await Promise.all([
            supabase
              .from("weather_alerts")
              .select("*")
              .in("location_id", locationIds)
              .eq("is_active", true)
              .gte("starts_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
              .order("starts_at", { ascending: true }),
            supabase
              .from("tasks")
              .select("id, blueprint_id, location_id")
              .in("location_id", locationIds)
              .eq("due_date", todayStr)
              .neq("status", "Skipped")
              .neq("status", "Completed"),
            supabase
              .from("tasks")
              .select("id", { count: "exact", head: true })
              .in("location_id", locationIds)
              .lt("due_date", todayStr)
              .neq("status", "Skipped")
              .neq("status", "Completed")
              // Wave 20: a harvest task is NOT overdue while its window
              // is still open (window_end_date >= today). And a "Not yet"
              // snooze (next_check_at > today) hides the task entirely
              // until the snooze expires. Both `or` filters keep the
              // non-Wave-20 tasks (where the columns are NULL) intact.
              .or(`window_end_date.is.null,window_end_date.lt.${todayStr}`)
              .or(`next_check_at.is.null,next_check_at.lte.${todayStr}`),
            supabase
              .from("task_blueprints")
              .select("id, location_id, start_date, created_at, end_date, frequency_days")
              .in("location_id", locationIds)
              .eq("is_recurring", true),
          ]);

          snapshotOverdueTaskCount = overdueResult.count ?? 0;
          setOverdueTaskCount(snapshotOverdueTaskCount);

          snapshotAlerts = alertResult.data || [];
          setAlerts(snapshotAlerts as any[]);

          // Compute today's task count per location (physical + ghosts)
          const todayMs = new Date(todayStr).getTime();
          const counts: Record<string, number> = {};
          locationIds.forEach((id: string) => { counts[id] = 0; });

          const existingByLocation: Record<string, Set<string>> = {};
          (todayTasksResult.data || []).forEach((t: any) => {
            if (t.location_id) {
              counts[t.location_id] = (counts[t.location_id] || 0) + 1;
              if (t.blueprint_id) {
                if (!existingByLocation[t.location_id]) existingByLocation[t.location_id] = new Set();
                existingByLocation[t.location_id].add(t.blueprint_id);
              }
            }
          });

          (bpResult.data || []).forEach((bp: any) => {
            if (!bp.location_id || !bp.frequency_days) return;
            const anchorStr = (bp.start_date || bp.created_at || new Date().toISOString()).split("T")[0];
            const anchorMs = new Date(anchorStr).getTime();
            if (todayMs < anchorMs) return;
            if (bp.end_date && todayMs > new Date(bp.end_date).getTime()) return;
            const diffDays = Math.round((todayMs - anchorMs) / (1000 * 60 * 60 * 24));
            const existing = existingByLocation[bp.location_id];
            if (diffDays % bp.frequency_days === 0 && (!existing || !existing.has(bp.id))) {
              counts[bp.location_id] = (counts[bp.location_id] || 0) + 1;
            }
          });

          snapshotLocationTaskCounts = counts;
          setLocationTaskCounts(counts);
        }
      }

      if (data.weather_snapshots) {
        const snapshots = data.weather_snapshots;
        const snapshotRow = Array.isArray(snapshots) ? snapshots[0] : snapshots;
        const freshRawData = snapshotRow?.data;
        const updatedAtIso = snapshotRow?.updated_at as string | undefined;
        // If the snapshot is stale (>6h old) the daily cron likely missed this home —
        // trigger a defensive refresh so the forecast page shows a full 7 days.
        // sync-weather has a 1-hour idempotency guard, so repeated calls are cheap.
        if (updatedAtIso) {
          const ageMs = Date.now() - new Date(updatedAtIso).getTime();
          if (ageMs > 6 * 60 * 60 * 1000) {
            supabase.functions.invoke("sync-weather", { body: { home_id: profile.home_id } })
              .then(() => {
                // Re-fetch the snapshot once sync finishes; ignore errors silently.
                supabase
                  .from("weather_snapshots")
                  .select("data, updated_at")
                  .eq("home_id", profile.home_id)
                  .single()
                  .then(({ data: fresh }) => {
                    if (fresh?.data) setRawWeather(fresh.data);
                  });
              })
              .catch(() => { /* fall through — page still works with stale data */ });
          }
        }
        if (freshRawData) {
          snapshotRawWeather = freshRawData;
          setRawWeather(freshRawData);
          try {
            const extracted = extractCurrentWeather(freshRawData);
            snapshotWeather = extracted;
            setWeather(extracted);
          } catch (e) {
            Logger.error("Weather parse failed", e);
            toast.error("Could not load weather data");
          }
        }
      }
    }

    // Write the local-first snapshot AFTER all the network state has
    // landed in our accumulators. Next cold open paints from this
    // instantly; the network revalidation overwrites it again on
    // success. localStorage failures are swallowed inside the cache
    // module — nothing here is allowed to break the success path.
    if (profile.home_id) {
      // Strip `weather.Icon` before serialising — it's a lucide
      // forwardRef object whose function fields don't survive
      // JSON.stringify, and the residual empty object crashes the
      // dashboard on the next cold open (React #130). The read path
      // recomputes `weather` from rawWeather, so dropping it here is
      // belt-and-braces.
      const safeSnapshotWeather =
        snapshotWeather && typeof snapshotWeather === "object"
          ? (() => {
              const { Icon: _icon, ...rest } = snapshotWeather as Record<string, unknown>;
              return rest;
            })()
          : snapshotWeather;
      writeDashboardCache(profile.home_id, {
        rawWeather: snapshotRawWeather,
        weather: safeSnapshotWeather,
        locations: snapshotLocations,
        homeLatLng: snapshotHomeLatLng,
        hardinessZone: snapshotHardinessZone,
        overdueTaskCount: snapshotOverdueTaskCount,
        alerts: snapshotAlerts,
        locationTaskCounts: snapshotLocationTaskCounts,
      });
    }

    setDashboardLoaded(true);
    setLastSyncedAt(Date.now());
    } catch (unexpected) {
      // Outer-catch guard: a network blip on the homes query (or any of
      // the parallel children) used to throw an unhandled rejection here
      // and leave the UI stuck in the loading skeleton with no retry
      // surface. Now we always flip dashboardError + dashboardLoaded so
      // the existing "Could not load dashboard data" retry card renders.
      Logger.error("fetchDashboardData unexpectedly threw", unexpected, {
        home_id: profile?.home_id,
      });
      setDashboardError(true);
      setDashboardLoaded(true);
      // No toast — the inline retry card on /dashboard surfaces this
      // when the user is actually there. Toasting from a background
      // fetch interrupts users who've navigated to another route.
    }
  }, [profile?.home_id]);

  function formatSyncedAgo(ms: number | null): string {
    if (ms == null) return "Not synced yet";
    const diff = Date.now() - ms;
    if (diff < 30_000) return "Synced just now";
    if (diff < 60_000) return "Synced 30s ago";
    const mins = Math.floor(diff / 60_000);
    if (mins < 60) return `Synced ${mins} min${mins !== 1 ? "s" : ""} ago`;
    const hrs = Math.floor(mins / 60);
    return `Synced ${hrs}h ago`;
  }

  // Fetches profile for a given userId. Accepts userId directly so it can be
  // called inline after getSession() without waiting for a React re-render cycle.
  // Speculatively fetches home_members in parallel so the fallback path is free.
  //
  // Hardened with `withRetry`: a single network hiccup used to leave the
  // user staring at the loading spinner with no recovery short of
  // closing the app. The retry path covers 2 transient failures with
  // exponential backoff before surfacing the error to the caller.
  // `.maybeSingle()` (not `.single()`) so "row not yet present" is a
  // clean null rather than a thrown error.
  const loadProfile = async (userId: string) => {
    const [profileResult, membershipsResult] = await Promise.all([
      withRetry(
        () =>
          supabase
            .from("user_profiles")
            .select("uid, home_id, display_name, first_name, last_name, subscription_tier, ai_enabled, enable_perenual, is_admin, onboarding_state, can_view_audit, is_beta")
            .eq("uid", userId)
            .maybeSingle(),
        { retries: 2, label: "loadProfile.user_profiles" },
      ),
      withRetry(
        () =>
          supabase
            .from("home_members")
            .select("home_id")
            .eq("user_id", userId)
            .limit(1),
        { retries: 2, label: "loadProfile.home_members" },
      ),
    ]);
    const { data: profileData, error } = profileResult;
    if (error) throw error;
    if (profileData && !profileData.home_id && membershipsResult.data?.length) {
      const fallbackId = membershipsResult.data[0].home_id;
      await supabase
        .from("user_profiles")
        .update({ home_id: fallbackId })
        .eq("uid", userId);
      profileData.home_id = fallbackId;
    }
    setProfile(profileData);
    if (profileData?.onboarding_state) {
      setOnboardingState(profileData.onboarding_state);
    }
  };

  // Convenience wrapper used by realtime callbacks and manual refresh
  const refreshProfile = () => {
    if (!session?.user) return Promise.resolve();
    return loadProfile(session.user.id);
  };

  const handleManualRefresh = async () => {
    if (!profile?.home_id) return;
    setIsRefreshing(true);
    await Promise.all([fetchDashboardData(), refreshProfile()]);
    setIsRefreshing(false);
    toast.success("Feed refreshed");
  };

  // Stable callbacks passed into the Realtime subscriber component (inside the provider).
  const handleHomeDataRealtime = useCallback(() => {
    if (!profile?.home_id) return;
    fetchDashboardData();
  }, [profile?.home_id, fetchDashboardData]);

  // Lightweight refresh — only re-fetches inventory counts per location instead of the full home
  const handleInventoryRealtime = useCallback(async () => {
    if (!profile?.home_id) return;
    const { data } = await supabase
      .from("inventory_items")
      .select("id, status, location_id")
      .eq("home_id", profile.home_id)
      .limit(500);
    if (!data) return;
    setLocations((prev) =>
      prev.map((loc) => ({
        ...loc,
        inventory_items: data.filter((i) => i.location_id === loc.id),
      })),
    );
  }, [profile?.home_id]);

  const handleProfileRealtime = useCallback(() => {
    refreshProfile();
  }, []);

  const handleSwitchHome = async (homeId: string) => {
    setIsHomeLoading(true);
    setWeather(null);
    setRawWeather(null);
    setLocations([]);
    setAlerts([]);
    setDashboardLoaded(false);
    try {
      const { error } = await supabase
        .from("user_profiles")
        .update({ home_id: homeId })
        .eq("uid", session.user.id);
      if (error) throw error;
      setProfile((prev: any) => (prev ? { ...prev, home_id: homeId } : null));
      setIsAddingHome(false);
      toast.success("Switched home");
    } catch (err: any) {
      Logger.error("Failed to switch home", err);
      toast.error("Failed to switch home");
    } finally {
      setIsHomeLoading(false);
    }
  };

  // Re-derive current-hour weather from the already-loaded snapshot every 60 min.
  // No API call needed — just re-picks the current hour from data already in memory.
  useEffect(() => {
    if (!rawWeather) return;
    const id = setInterval(() => {
      try {
        setWeather(extractCurrentWeather(rawWeather));
      } catch (e: any) {
        Logger.error("Weather extraction failed on interval tick", e);
      }
    }, 60 * 60 * 1000);
    return () => clearInterval(id);
  }, [rawWeather]);

  useEffect(() => {
    // Single initialisation effect — gets session and starts profile fetch in
    // one chain, eliminating the React re-render cycle between the two steps.
    const bail = setTimeout(() => setLoading(false), 8_000);
    setProfileLoadError(false);

    supabase.auth.getSession()
      .then(async ({ data: { session } }) => {
        clearTimeout(bail);
        setSession(session);
        if (!session) {
          setLoading(false);
          return;
        }
        // Start profile fetch immediately — no extra effect cycle needed
        try {
          await loadProfile(session.user.id);
        } catch (err) {
          Logger.error("Profile load failed on cold start", err);
          setProfileLoadError(true);
        } finally {
          setLoading(false);
        }
      })
      .catch(() => {
        clearTimeout(bail);
        setLoading(false);
      });

    // Handle subsequent auth events (sign in, sign out, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (session) {
        loadProfile(session.user.id).catch(() => {});
        // UX review 2026-06-15 item 5.1 — pick up a stashed invite token
        // saved by JoinHomeViaToken when the user landed on /join/:token
        // while signed out. Only fire on the actual sign-in transition
        // (not on every token refresh) — INITIAL_SESSION + SIGNED_IN
        // cover the cold-start + post-auth cases.
        if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
          try {
            const stashed = localStorage.getItem("rhozly_pending_invite_token");
            if (stashed) {
              // Defer to next tick so the auth state has settled before
              // the router re-renders the redemption page.
              setTimeout(() => navigate(`/join/${stashed}`, { replace: true }), 0);
            }
          } catch { /* private mode — ignore */ }
        }
      } else {
        setProfile(null);
        // Sign-out: nuke every cached dashboard snapshot + per-device
        // launcher pins so a different account opening the app on the
        // same device never sees the previous user's data or shortcuts.
        clearAllDashboardCaches();
        clearQuickLauncherPins();
      }
    });

    return () => {
      clearTimeout(bail);
      subscription.unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Refresh dashboard data whenever the user navigates to /dashboard.
  // Realtime subscriptions handle live updates; no need to bust the cache on every visit.
  useEffect(() => {
    if (routerLocation.pathname !== "/dashboard") return;
    if (!profile?.home_id) return;
    fetchDashboardData();
  }, [routerLocation.pathname, profile?.home_id, fetchDashboardData]);

  if (loading)
    return (
      <div className="h-screen flex items-center justify-center bg-rhozly-bg">
        <Loader2 className="animate-spin text-rhozly-primary" size={40} />
      </div>
    );
  if (!session) return <Auth />;
  if (profileLoadError && !profile) return (
    <div className="h-screen flex flex-col items-center justify-center gap-4 bg-rhozly-bg px-6 text-center">
      <AlertCircle size={40} className="text-red-400" />
      <div>
        <p className="font-black text-lg text-rhozly-on-surface">Could not load your profile</p>
        <p className="text-sm text-rhozly-on-surface/50 mt-1">Check your connection and try again.</p>
      </div>
      <button
        onClick={() => { setProfileLoadError(false); setLoading(true); refreshProfile().catch(() => setProfileLoadError(true)).finally(() => setLoading(false)); }}
        className="px-6 py-3 bg-rhozly-primary text-white rounded-2xl font-black flex items-center gap-2 hover:opacity-90 transition"
      >
        <RefreshCw size={16} /> Retry
      </button>
    </div>
  );
  if (profile && (!profile.home_id || isAddingHome))
    return (
      <HomeSetup
        user={session.user}
        hasExistingHome={!!profile.home_id}
        onCancel={() => setIsAddingHome(false)}
        onHomeCreated={(id) => {
          setProfile({ ...profile, home_id: id } as any);
          setIsAddingHome(false);
        }}
      />
    );

  // UX review 2026-06-15 item 1.1 — Defer tier selection.
  //
  // Previously: users hit a hard TierSelection wall between Home Setup and
  // the Dashboard. Now we silently default new users to 'sprout' (free) and
  // let them upgrade later via /gardener?tab=subscription. The free Plant
  // Doctor identify quota (item 3.1) makes the deferred upsell viable.
  //
  // The effect lives below outside the early-return so it fires when the
  // profile loads. While the write is in flight we show a brief loader to
  // avoid flashing the dashboard before the local state catches up.
  if (profile && profile.home_id && !profile.subscription_tier) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="animate-spin text-rhozly-primary" />
      </div>
    );
  }

  const navLinks: Array<{
    id: string;
    icon: React.ReactElement;
    label: string;
    matchPaths: string[];
    badge?: number;
    badgeTone?: "amber" | "rose" | "primary";
  }> = [
    // "Quick" is mobile-only — the shortcut home for phone users. Hidden on
    // desktop to keep the nav focused on the full surfaces.
    ...(isMobile
      ? [{ id: "quick", icon: <Zap />, label: "Quick", matchPaths: ["/quick"] }]
      : []),
    { id: "dashboard", icon: <Home />, label: "Dashboard", matchPaths: ["/dashboard", ...(isMobile ? [] : ["/"])], badge: overdueTaskCount, badgeTone: "rose" },
    { id: "shed",      icon: <IconPlants />, label: "Plants", matchPaths: ["/shed", "/watchlist"] },
    { id: "planner",   icon: <IconPlanner />, label: "Planner",    matchPaths: ["/planner", "/shopping"] },
    { id: "journal",   icon: <BookOpen />, label: "Journal",    matchPaths: ["/journal"] },
    { id: "notes",     icon: <NotebookPen />, label: "Notes",   matchPaths: ["/notes"] },
    { id: "tools",        icon: <IconDoctor />, label: "Tools",        matchPaths: ["/tools", "/doctor", "/visualiser", "/lightsensor", "/guides", "/garden-layout", "/sun-trajectory"] },
    { id: "integrations", icon: <IconIntegrations />,        label: "Integrations", matchPaths: ["/integrations"] },
  ];

  const canUsePortal = typeof document !== "undefined";
  const sidebarIsCollapsed = isMdBreakpoint ? isNavCollapsed : !isMobileSidebarOpen;

  const RouteFallback = (
    <div className="flex items-center justify-center h-40">
      <Loader2 className="animate-spin text-rhozly-primary" size={28} />
    </div>
  );

  return (
    <BetaFeedbackProvider isBeta={profile?.is_beta ?? false} userId={session?.user?.id}>
    <HomePermissionsProvider homeId={profile?.home_id} userId={session?.user?.id}>
    <HomeRealtimeProvider homeId={profile?.home_id || ""}>
      <DashboardRealtimeSubscriber
        onDataRefresh={handleHomeDataRealtime}
        onProfileRefresh={handleProfileRealtime}
        onInventoryChange={handleInventoryRealtime}
      />
    <PlantDoctorProvider homeId={profile?.home_id || ""}>
      <Sentry.ErrorBoundary fallback={({ error }) => <ErrorPage error={error instanceof Error ? error : new Error(String(error))} appVersion={appVersion ?? undefined} />}>
          <Toaster />
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2.5 focus:bg-rhozly-primary focus:text-white focus:rounded-xl focus:font-bold focus:text-sm focus:shadow-lg"
          >
            Skip to main content
          </a>
          <div className={`h-screen text-rhozly-on-surface font-body flex flex-col relative selection:bg-rhozly-primary/20 ${
            isFocusMode
              ? "bg-gradient-to-b from-rhozly-primary-container/[0.07] via-rhozly-bg to-rhozly-bg border-4 border-rhozly-primary/60"
              : "bg-rhozly-bg"
          }`}>
            <div className="fixed top-0 left-1/4 w-96 h-96 bg-rhozly-primary/5 rounded-full blur-3xl pointer-events-none" />

            {!isFocusMode && (
            <header className="sticky top-0 z-30 bg-rhozly-primary border-b border-rhozly-primary-container px-4 md:px-8 py-4 flex justify-between items-center shadow-md">
              <div className="flex items-center gap-3 font-display font-black text-2xl tracking-tight text-white">
                <button
                  onClick={() => isMdBreakpoint ? setIsNavCollapsed(!isNavCollapsed) : setIsMobileSidebarOpen(!isMobileSidebarOpen)}
                  className="flex hover:bg-white/20 p-2 rounded-xl transition-colors items-center justify-center mr-1 min-h-[44px] min-w-[44px]"
                  aria-label="Toggle navigation"
                >
                  <Menu className="w-6 h-6" />
                </button>
                <div className="bg-white p-2 rounded-xl shadow-sm">
                  <img
                    src="/images/logo_small_rhozly.png"
                    alt="Rhozly"
                    className="h-8 w-auto"
                  />
                </div>
                <span className="uppercase tracking-wider text-xl hidden sm:block">
                  Rhozly
                </span>
                <div className="relative ml-2 md:ml-6 flex items-center gap-2">
                  <HomeDropdown
                    currentHomeId={profile?.home_id || null}
                    onSelectHome={handleSwitchHome}
                    onAddNewHome={() => setIsAddingHome(true)}
                    onHomeListChanged={refreshProfile}
                  />
                  <OfflineBadge />
                  <QueuedActionsBadge />
                  <GlobalSearch homeId={profile?.home_id ?? null} />
                  <GlobalQuickAdd />
                </div>
              </div>
              <UserProfileDropdown
                displayName={profile?.display_name ?? null}
                firstName={profile?.first_name ?? null}
                email={session?.user?.email ?? null}
                subscriptionTier={profile?.subscription_tier ?? null}
                isAdmin={profile?.is_admin ?? false}
                canViewAudit={profile?.can_view_audit ?? false}
                appVersion={appVersion ?? undefined}
                onVersionClick={() => setReleaseNotesMode("history")}
                onCheckForUpdate={versionState.refresh}
              />
            </header>
            )}

            <BetaFeedbackBanner />

            <div className="flex flex-1 overflow-hidden relative z-10 w-full">
              {!isFocusMode && (
              <nav
                aria-label="Primary navigation"
                className={`flex flex-col justify-between transition-all duration-300 border-r border-rhozly-primary/20 bg-rhozly-primary-container shrink-0 h-full overflow-hidden
                  ${sidebarIsCollapsed ? "w-20 items-center p-3" : "w-72 p-6"}
                `}
              >
                <div className="flex flex-col gap-2 overflow-y-auto flex-1 min-h-0">
                  {navLinks.map((link) => (
                    <NavItem
                      key={link.id}
                      icon={link.icon}
                      label={link.label}
                      active={link.matchPaths.some(p => routerLocation.pathname === p || routerLocation.pathname.startsWith(p + "/"))}
                      onClick={() => {
                        navigate(TAB_URL[link.id]);
                        if (!isMdBreakpoint) setIsMobileSidebarOpen(false);
                      }}
                      isCollapsed={sidebarIsCollapsed}
                      isMobile={!isMdBreakpoint}
                      badge={link.badge}
                      badgeTone={link.badgeTone}
                    />
                  ))}
                </div>
                <div className="flex flex-col gap-1 mt-4 shrink-0">
                  <NavItem
                    icon={<HelpCircle />}
                    label="Help Center"
                    active={false}
                    onClick={() => setHelpCenterOpen(true)}
                    isCollapsed={sidebarIsCollapsed}
                    isMobile={!isMdBreakpoint}
                  />
                  <div className={`flex flex-col gap-1 mt-1 ${!isMdBreakpoint && sidebarIsCollapsed ? "hidden" : ""}`}>
                    <button
                      onClick={() => setShowPrivacy(true)}
                      className="text-xs font-bold text-rhozly-on-surface/30 hover:text-rhozly-on-surface/60 transition-colors text-center py-2 px-1"
                    >
                      {sidebarIsCollapsed ? "Privacy" : "Privacy Policy"}
                    </button>
                    <button
                      onClick={() => setShowCookies(true)}
                      className="text-xs font-bold text-rhozly-on-surface/30 hover:text-rhozly-on-surface/60 transition-colors text-center py-2 px-1"
                    >
                      {sidebarIsCollapsed ? "Cookies" : "Cookie Policy"}
                    </button>
                  </div>
                </div>
              </nav>
              )}

              <main id="main-content" aria-label="Main content" className="flex-1 relative w-full overflow-hidden">
                {/* Full-bleed routes that must escape the padded PullToRefresh wrapper */}
                <Suspense fallback={null}>
                <Routes>
                  <Route path="/sun-trajectory" element={
                    <div className="absolute inset-0 z-20 animate-in fade-in duration-500">
                      {profile?.home_id ? (
                        <SunTrajectoryAR homeId={profile.home_id} />
                      ) : (
                        <div className="h-full flex items-center justify-center">
                          <SurfaceLoader
                            shape="spinner"
                            label="Mapping the sun's path across your garden…"
                          />
                        </div>
                      )}
                    </div>
                  } />
                  <Route path="*" element={null} />
                </Routes>
                </Suspense>

                <PullToRefresh onRefresh={handleManualRefresh}>
                  {isRefreshing && (
                    <div className="h-0.5 bg-rhozly-primary animate-pulse w-full" />
                  )}
                  {/* Focus mode (Quick Access + Library on mobile) draws to
                      the screen edge so the surface can size itself with
                      h-full; non-focus routes get the standard page padding. */}
                  <div className={isFocusMode ? "h-full" : "p-4 md:p-8 pb-28 md:pb-8 min-h-full"}>
                    <Suspense fallback={RouteFallback}>
                    <Routes>
                      <Route path="/" element={<Navigate to={isMobile ? "/quick" : "/dashboard"} replace />} />

                      <Route path="/quick" element={
                        <div className="h-full animate-in fade-in duration-500">
                          <QuickAccessHome
                            firstName={profile?.first_name ?? null}
                            homeId={profile?.home_id ?? null}
                            userId={session?.user?.id ?? null}
                            subscriptionTier={profile?.subscription_tier ?? null}
                            aiEnabled={!!profile?.ai_enabled}
                            isPremium={!!profile?.enable_perenual}
                            isBeta={!!profile?.is_beta}
                          />
                        </div>
                      } />
                      <Route path="/quick/calendar" element={
                        <div className="h-full animate-in fade-in duration-500">
                          <LocalizedTaskCalendar
                            homeId={profile?.home_id ?? ""}
                            aiEnabled={!!profile?.ai_enabled}
                            isPremium={!!profile?.enable_perenual}
                          />
                        </div>
                      } />

                      <Route path="/walk" element={
                        <div className="h-full animate-in fade-in duration-500">
                          <GardenWalk
                            homeId={profile?.home_id ?? ""}
                            userId={session?.user?.id ?? ""}
                            aiEnabled={!!profile?.ai_enabled}
                          />
                        </div>
                      } />

                      <Route path="/dashboard" element={
                        <div className="w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
                          {selectedLocationId ? (
                            <div className="w-full">
                              {(() => {
                                const loc = locations.find(
                                  (l) => l.id === selectedLocationId,
                                );
                                if (!loc)
                                  return (
                                    <div className="flex flex-col items-center py-20">
                                      <Loader2 className="animate-spin text-rhozly-primary mb-4" />
                                      <p className="text-sm font-bold opacity-40">
                                        Loading location details...
                                      </p>
                                    </div>
                                  );
                                return (
                                  <LocationPage
                                    location={loc}
                                    aiEnabled={profile?.ai_enabled ?? false}
                                    perenualEnabled={profile?.enable_perenual ?? false}
                                  />
                                );
                              })()}
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10">
                              <div
                                className="col-span-full space-y-6"
                              >
                                <WeatherAlertBanner
                                  alerts={alerts}
                                  isForecastScreen={dashboardView === "weather"}
                                />

                                <div className="flex items-center justify-between px-1">
                                  <div data-testid="dashboard-view-switcher" className="bg-rhozly-primary/5 p-1 rounded-2xl flex w-full">
                                    {["dashboard", "locations", "calendar", "weather"].map(
                                      (v) => (
                                        <button
                                          key={v}
                                          onClick={() =>
                                            navigate(v === "dashboard" ? "/dashboard" : `/dashboard?view=${v}`, { replace: true })
                                          }
                                          className={`flex-1 px-2 sm:px-4 py-2 min-h-[44px] rounded-xl text-xs sm:text-sm text-center transition-all ${dashboardView === v ? "bg-white text-rhozly-primary shadow-sm font-bold" : "text-rhozly-on-surface/50 hover:text-rhozly-primary font-normal"}`}
                                        >
                                          {v.charAt(0).toUpperCase() + v.slice(1)}
                                        </button>
                                      ),
                                    )}
                                  </div>
                                </div>
                                {/* Sync status indicator — tells the user when their data was last refreshed */}
                                <div className="flex items-center justify-end px-2 -mt-2 -mb-1">
                                  <span
                                    data-testid="dashboard-sync-status"
                                    className="text-[10px] font-bold text-rhozly-on-surface/35 uppercase tracking-widest"
                                  >
                                    {formatSyncedAgo(lastSyncedAt)}
                                  </span>
                                </div>

                                {dashboardView === "dashboard" ? (
                                  <div className="space-y-5">
                                    {/* Getting Started checklist — shown to new users until all steps done or dismissed */}
                                    {profile?.home_id && session?.user?.id && (
                                      <GettingStartedChecklist
                                        homeId={profile.home_id}
                                        userId={session.user.id}
                                        quizCompleted={!!quizCompleted}
                                        hasLocations={locations.length > 0}
                                        onboardingState={onboardingState}
                                        onStateChange={setOnboardingState}
                                      />
                                    )}
                                    {/* One-time notification opt-in (hides itself when granted/denied/dismissed) */}
                                    <NotificationOptInCard />
                                    {/* PWA install prompt — only when beforeinstallprompt fires + not already installed */}
                                    <InstallPwaPrompt />
                                    {/* Daily Brief — greets the user, surfaces today's tasks, weather, golden hour, frost risk in one card */}
                                    <DailyBriefCard
                                      firstName={profile?.first_name ?? null}
                                      weather={weather}
                                      rawWeather={rawWeather}
                                      locations={locations}
                                      alerts={alerts}
                                      todayTaskCount={Object.values(locationTaskCounts).reduce((a, b) => a + b, 0)}
                                      overdueCount={overdueTaskCount}
                                      homeLat={homeLatLng.lat}
                                      homeLng={homeLatLng.lng}
                                      hardinessZone={hardinessZone}
                                    />
                                    {/* Complete Home Profile quiz prompt */}
                                    {quizCompleted === false && !quizPromptDismissed && !quizPromptIsSnoozed && (
                                      <div className={`bg-gradient-to-br from-emerald-500 to-teal-600 text-white rounded-3xl p-5 shadow-md relative overflow-hidden transition-all duration-300 ${quizPromptFading ? "opacity-0 scale-95 pointer-events-none" : "opacity-100 scale-100"}`}>
                                        {quizPromptConfirmDismiss ? (
                                          <div className="flex flex-wrap items-center gap-2">
                                            <p className="text-sm font-bold text-white/90 flex-1 min-w-full sm:min-w-0">Hide this reminder?</p>
                                            <button
                                              data-testid="quiz-prompt-snooze-14d"
                                              onClick={() => {
                                                setQuizPromptFading(true);
                                                void persistQuizPromptSnooze(14);
                                                setTimeout(() => { setQuizPromptDismissed(true); setQuizPromptFading(false); setQuizPromptConfirmDismiss(false); }, 300);
                                                toast.success("Reminder hidden for 2 weeks — find it any time in Garden Quiz & Preferences.", { duration: 2500 });
                                              }}
                                              className="text-xs font-black bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-xl transition"
                                            >
                                              Snooze 2 weeks
                                            </button>
                                            <button
                                              data-testid="quiz-prompt-dont-ask-again"
                                              onClick={() => {
                                                setQuizPromptFading(true);
                                                void persistQuizPromptSnooze(365 * 100);
                                                setTimeout(() => { setQuizPromptDismissed(true); setQuizPromptFading(false); setQuizPromptConfirmDismiss(false); }, 300);
                                                toast.success("Done — we won't ask again. Find the quiz in Garden Quiz & Preferences.", { duration: 2500 });
                                              }}
                                              className="text-xs font-black bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-xl transition"
                                            >
                                              Don't ask again
                                            </button>
                                            <button
                                              onClick={() => setQuizPromptConfirmDismiss(false)}
                                              className="text-xs font-bold text-white/60 hover:text-white transition"
                                            >
                                              Keep
                                            </button>
                                          </div>
                                        ) : (
                                          <>
                                            <button
                                              onClick={() => setQuizPromptConfirmDismiss(true)}
                                              className="absolute top-3 right-3 text-white/60 hover:text-white transition"
                                              aria-label="Dismiss"
                                            >
                                              <X size={14} />
                                            </button>
                                            <div className="flex items-start gap-4">
                                              <div className="bg-white/20 p-3 rounded-2xl flex-shrink-0">
                                                <IconAI size={22} className="text-white" />
                                              </div>
                                              <div className="flex-1 min-w-0">
                                                <p className="font-black text-sm leading-tight mb-1">Set up your Garden Quiz</p>
                                                <p className="text-xs text-white/80 leading-snug mb-1">Answer a few quick questions so Rhozly can personalise your plant recommendations and watering schedules — takes about 2 minutes.</p>
                                                <button onClick={() => navigate("/profile")} className="bg-white text-emerald-700 text-xs font-black px-4 py-2 rounded-full hover:bg-white/90 transition">Start the quiz →</button>
                                              </div>
                                            </div>
                                          </>
                                        )}
                                      </div>
                                    )}
                                    {/* AI Insight card */}
                                    {session?.user?.id && (
                                      <Suspense fallback={null}>
                                        <div data-testid="dashboard-assistant-card">
                                          <AssistantCard userId={session.user.id} />
                                        </div>
                                      </Suspense>
                                    )}
                                    {/* Weekly stats + today's tasks */}
                                    <Suspense fallback={RouteFallback}>
                                      {profile?.home_id && (
                                        <HomeDashboard homeId={profile.home_id} aiEnabled={!!profile?.ai_enabled} isPremium={!!profile?.enable_perenual} />
                                      )}
                                    </Suspense>
                                  </div>
                                ) : dashboardView === "locations" ? (
                                  <div className="space-y-5">
                                    {dashboardError && (
                                      <div className="col-span-full p-8 text-center bg-rhozly-surface-lowest rounded-3xl border border-rhozly-outline/30 flex flex-col items-center gap-3">
                                        <p className="font-bold text-sm text-rhozly-on-surface/60">
                                          Could not load dashboard data.
                                        </p>
                                        <button
                                          data-testid="dashboard-retry-button"
                                          onClick={fetchDashboardData}
                                          className="flex items-center gap-2 bg-rhozly-primary text-white text-xs font-black px-4 py-2 rounded-2xl hover:opacity-90 transition-opacity"
                                        >
                                          <RefreshCw size={14} />
                                          Retry
                                        </button>
                                      </div>
                                    )}
                                    <div data-testid="dashboard-location-grid" className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                      {locations.length > 0 ? (
                                        locations.map((loc: any, idx: number) => (
                                          <LocationTile
                                            key={loc.id}
                                            site={loc}
                                            index={idx}
                                            tasksCount={locationTaskCounts[loc.id] ?? null}
                                            onClick={() =>
                                              navigate(`/dashboard?locationId=${loc.id}`)
                                            }
                                          />
                                        ))
                                      ) : !dashboardLoaded && !dashboardError ? (
                                        <>
                                          <div className="rounded-3xl bg-rhozly-surface-low animate-pulse h-36" />
                                          <div className="rounded-3xl bg-rhozly-surface-low animate-pulse h-36" />
                                          <div className="rounded-3xl bg-rhozly-surface-low animate-pulse h-36" />
                                        </>
                                      ) : dashboardLoaded && !dashboardError ? (
                                        <div className="col-span-full p-8 flex flex-col items-center gap-4 bg-rhozly-surface-lowest rounded-3xl border border-rhozly-outline/30">
                                          <div className="bg-rhozly-primary/10 p-4 rounded-3xl">
                                            <MapPin className="w-8 h-8 text-rhozly-primary" />
                                          </div>
                                          <div className="text-center">
                                            <p className="font-black text-sm text-rhozly-on-surface mb-1">
                                              No locations yet
                                            </p>
                                            <p className="text-xs text-rhozly-on-surface/50">
                                              Add your first garden location to get started.
                                            </p>
                                          </div>
                                          <button
                                            data-testid="dashboard-add-location-cta"
                                            onClick={() => navigate("/management")}
                                            className="bg-rhozly-primary text-white text-xs font-black px-5 py-2.5 rounded-2xl hover:opacity-90 transition-opacity"
                                          >
                                            Add Location
                                          </button>
                                        </div>
                                      ) : null}
                                    </div>
                                  </div>
                                ) : dashboardView === "calendar" ? (
                                  <div className="bg-rhozly-surface-lowest rounded-3xl border border-rhozly-outline/10 overflow-hidden shadow-sm">
                                    {profile?.home_id && (
                                      <TaskCalendar homeId={profile.home_id} preloadedLocations={locations} aiEnabled={profile?.ai_enabled ?? false} />
                                    )}
                                  </div>
                                ) : (
                                  <div className="space-y-6">
                                    {!dashboardLoaded && !rawWeather ? (
                                      <div className="space-y-4">
                                        <div className="rounded-3xl bg-rhozly-surface-low animate-pulse h-48" />
                                        <div className="rounded-3xl bg-rhozly-surface-low animate-pulse h-32" />
                                      </div>
                                    ) : (
                                      <WeatherForecast
                                        weatherData={rawWeather}
                                        alerts={alerts}
                                        homeId={profile?.home_id ?? null}
                                        onRefresh={fetchDashboardData}
                                      />
                                    )}
                                  </div>
                                )}
                              </div>

                            </div>
                          )}
                        </div>
                      } />

                      <Route path="/schedule" element={
                        profile?.home_id ? (
                          <div className="h-full animate-in fade-in duration-500">
                            <BlueprintManager homeId={profile.home_id} aiEnabled={profile.ai_enabled ?? false} />
                          </div>
                        ) : null
                      } />

                      <Route path="/shed" element={
                        profile?.home_id ? (
                          <GardenHub homeId={profile.home_id} aiEnabled={profile.ai_enabled ?? false} perenualEnabled={profile.enable_perenual ?? false} />
                        ) : null
                      } />

                      <Route path="/journal" element={
                        profile?.home_id ? (
                          <div className="h-full overflow-auto animate-in fade-in duration-500">
                            <GlobalJournal homeId={profile.home_id} />
                          </div>
                        ) : null
                      } />

                      <Route path="/weekly" element={
                        profile?.home_id ? (
                          <div className="h-full overflow-auto animate-in fade-in duration-500">
                            <WeeklyOverviewPage homeId={profile.home_id} aiEnabled={!!profile?.ai_enabled} isPremium={!!profile?.enable_perenual} />
                          </div>
                        ) : null
                      } />

                      <Route path="/notes" element={
                        profile?.home_id ? (
                          <div className="h-full overflow-auto animate-in fade-in duration-500">
                            <NotesPage homeId={profile.home_id} />
                          </div>
                        ) : null
                      } />

                      {/* Wave 22.0002 — image credits umbrella attribution page. */}
                      <Route path="/credits" element={
                        <div className="h-full overflow-auto animate-in fade-in duration-500">
                          <CreditsPage />
                        </div>
                      } />

                      {/* Redirect legacy /watchlist deep-link to the Garden Hub watchlist tab */}
                      <Route path="/watchlist" element={<Navigate to="/shed?tab=watchlist" replace />} />

                      {/* Redirect legacy /shopping deep-link to the Planner Hub shopping tab */}
                      <Route path="/shopping" element={<Navigate to="/planner?tab=shopping" replace />} />

                      <Route path="/tools" element={
                        <div className="h-full overflow-auto animate-in fade-in duration-500">
                          <ToolsHub />
                        </div>
                      } />

                      <Route path="/integrations" element={
                        profile?.home_id ? (
                          <div className="h-full overflow-auto animate-in fade-in duration-500">
                            <IntegrationsPage homeId={profile.home_id} />
                          </div>
                        ) : null
                      } />

                      <Route path="/visualiser" element={
                        profile?.home_id ? (
                          <div className="h-full animate-in fade-in duration-500">
                            <PlantVisualiser homeId={profile.home_id} aiEnabled={profile.ai_enabled ?? false} />
                          </div>
                        ) : null
                      } />

                      <Route path="/planner" element={
                        profile?.home_id ? (
                          <PlannerHub homeId={profile.home_id} aiEnabled={profile.ai_enabled ?? false} perenualEnabled={profile.enable_perenual ?? false} />
                        ) : null
                      } />

                      <Route path="/doctor" element={
                        <div className="h-full animate-in fade-in duration-500">
                          <PlantDoctor
                            homeId={profile?.home_id}
                            userId={session?.user?.id}
                            aiEnabled={profile?.ai_enabled}
                            isPremium={profile?.enable_perenual}
                            perenualEnabled={profile?.enable_perenual}
                          />
                        </div>
                      } />

                      <Route path="/profile" element={
                        profile?.home_id && session?.user?.id ? (
                          <div className="animate-in fade-in duration-500 py-6 px-4">
                            <GardenProfile
                              homeId={profile.home_id}
                              userId={session.user.id}
                              aiEnabled={profile.ai_enabled}
                              perenualEnabled={!!profile.enable_perenual}
                            />
                          </div>
                        ) : null
                      } />

                      <Route path="/gardener" element={
                        profile?.home_id && session?.user?.id ? (
                          <div className="animate-in fade-in duration-500 py-6 px-4">
                            <GardenerProfile
                              userId={session.user.id}
                              homeId={profile.home_id}
                              displayName={profile.display_name ?? null}
                              email={session.user.email ?? null}
                              subscriptionTier={profile.subscription_tier ?? null}
                              aiEnabled={!!profile.ai_enabled}
                              isBeta={!!profile.is_beta}
                              isAdmin={!!profile.is_admin}
                              onDisplayNameChange={(name) =>
                                setProfile((prev: any) => prev ? { ...prev, display_name: name } : prev)
                              }
                              onTierChange={(tier, aiEnabled, perenualEnabled) =>
                                setProfile((prev: any) => prev
                                  ? { ...prev, subscription_tier: tier, ai_enabled: aiEnabled, enable_perenual: perenualEnabled }
                                  : prev
                                )
                              }
                            />
                          </div>
                        ) : null
                      } />

                      <Route path="/lightsensor" element={
                        <div className="h-full animate-in fade-in duration-500">
                          {profile?.home_id ? (
                            <LightSensor homeId={profile.home_id} />
                          ) : (
                            <div className="h-full flex flex-col items-center justify-center p-10 text-center">
                              <Loader2
                                className="animate-spin text-rhozly-primary mb-4"
                                size={40}
                              />
                              <p className="font-bold text-rhozly-on-surface/40 uppercase tracking-widest text-[10px]">
                                Loading Home Data...
                              </p>
                            </div>
                          )}
                        </div>
                      } />


                      <Route path="/guides" element={
                        <div className="h-full animate-in fade-in duration-500">
                          <GuideList />
                        </div>
                      } />

                      {/* UX review 2026-06-15 item 6.8 — first-class
                          /help URL that lands the user on the App Help
                          tab of GuideList. Keeps the existing tab UI as
                          the single source of help truth while making
                          "type rhozly.app/help" actually work. */}
                      <Route path="/help" element={
                        <Navigate to="/guides?tab=help" replace />
                      } />

                      <Route path="/management" element={
                        <div className="h-full animate-in fade-in duration-500">
                          {profile?.home_id ? (
                            <LocationManager homeId={profile.home_id} onDataChanged={handleHomeDataRealtime} aiEnabled={!!profile?.ai_enabled} />
                          ) : (
                            <div className="p-10 text-center opacity-50 font-bold border-2 border-dashed rounded-3xl">
                              Please select a home.
                            </div>
                          )}
                        </div>
                      } />

                      <Route path="/garden-layout" element={
                        profile?.home_id ? (
                          <div className="h-full animate-in fade-in duration-500">
                            <GardenLayoutList homeId={profile.home_id} />
                          </div>
                        ) : null
                      } />

                      <Route path="/garden-layout/:layoutId" element={
                        profile?.home_id ? (
                          <div className="h-full animate-in fade-in duration-500">
                            <GardenLayoutEditor homeId={profile.home_id} />
                          </div>
                        ) : null
                      } />

                      <Route path="/home-management" element={
                        profile?.home_id && session?.user?.id ? (
                          <div className="h-full animate-in fade-in duration-500">
                            <HomeManagement
                              currentHomeId={profile.home_id}
                              userId={session.user.id}
                              onSwitchHome={handleSwitchHome}
                              onAddNewHome={() => setIsAddingHome(true)}
                              onHomeChanged={refreshProfile}
                            />
                          </div>
                        ) : null
                      } />

                      {profile?.is_admin && (
                        <Route path="/admin/guides" element={
                          <div className="h-full animate-in fade-in duration-500">
                            <AdminGuideGenerator />
                          </div>
                        } />
                      )}

                      {profile?.is_admin && session?.user?.id && (
                        <Route path="/admin/plant-library" element={
                          <div className="h-full animate-in fade-in duration-500">
                            <PlantLibraryAdmin
                              isAdmin={!!profile.is_admin}
                              userId={session.user.id}
                            />
                          </div>
                        } />
                      )}

                      {profile?.can_view_audit && (
                        <Route path="/audit" element={
                          <div className="h-full animate-in fade-in duration-500">
                            <AuditPage homeId={profile.home_id!} />
                          </div>
                        } />
                      )}

                      {/* No-op entries for full-bleed routes handled by the sibling Routes above */}
                      <Route path="/sun-trajectory" element={null} />

                      <Route path="*" element={<Navigate to="/dashboard" replace />} />
                    </Routes>
                    </Suspense>
                  </div>
                </PullToRefresh>
              </main>
              {isHomeLoading && (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-rhozly-bg/70 backdrop-blur-sm">
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="animate-spin text-rhozly-primary" size={36} />
                    <p className="text-xs font-black uppercase tracking-widest text-rhozly-on-surface/50">
                      Switching home...
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {isFocusMode && (
            <Suspense fallback={null}>
              <QuickAccessMenuButton onClick={() => setQuickDrawerOpen(true)} />
              {/* Floating profile button mirrors the burger on the
                  opposite corner. Tapping opens the same dropdown the
                  desktop header uses — Account Settings, Routines,
                  Members, Help, Check-for-update, Log out, etc.
                  The wrapper is a bare positioning shell — no chrome —
                  so only the avatar's own circular silhouette shows. */}
              <div
                className="fixed top-3 right-3 z-[105]"
                style={{
                  top: `calc(0.75rem + env(safe-area-inset-top, 0px))`,
                  right: `calc(0.75rem + env(safe-area-inset-right, 0px))`,
                }}
              >
                <UserProfileDropdown
                  displayName={profile?.display_name ?? null}
                  firstName={profile?.first_name ?? null}
                  email={session?.user?.email ?? null}
                  subscriptionTier={profile?.subscription_tier ?? null}
                  isAdmin={profile?.is_admin ?? false}
                  canViewAudit={profile?.can_view_audit ?? false}
                  appVersion={appVersion ?? undefined}
                  onVersionClick={() => setReleaseNotesMode("history")}
                  onCheckForUpdate={versionState.refresh}
                />
              </div>
              {/* UX review 2026-06-15 item 7.1 — bottom thumb-zone mirror
                  was tried as a SECOND floating UserProfileDropdown on
                  /quick (in addition to the existing top-right one). User
                  feedback flagged two problems: (1) two user icons on the
                  same screen is confusing, (2) the bottom-right placement
                  clashed with the PlantDoctorChat floating button at
                  bottom-6 right-6. Reverted — the top-right copy is the
                  single source of truth for the user menu again. Future
                  thumb-zone work would need to MOVE the dropdown, not add
                  a second instance. */}
              <MobileNavDrawer
                open={quickDrawerOpen}
                navLinks={navLinks}
                activePath={routerLocation.pathname}
                onClose={() => setQuickDrawerOpen(false)}
                onNavigate={(path) => {
                  setQuickDrawerOpen(false);
                  navigate(path);
                }}
                pathFor={(id) => TAB_URL[id] ?? "/"}
                onOpenHelp={() => setHelpCenterOpen(true)}
                onOpenPrivacy={() => setShowPrivacy(true)}
                onOpenCookies={() => setShowCookies(true)}
                appVersion={appVersion ?? undefined}
                onVersionClick={() => setReleaseNotesMode("history")}
              />
            </Suspense>
          )}

          {canUsePortal &&
            createPortal(
              <div className="font-body text-rhozly-on-surface antialiased">
                {profile?.home_id && (
                  <PlantDoctorChat homeId={profile.home_id} />
                )}
                <HelpCenter
                  userId={session?.user?.id}
                  onboardingState={onboardingState}
                  onStateChange={setOnboardingState}
                  open={helpCenterOpen}
                  onClose={() => setHelpCenterOpen(false)}
                />
                <BetaFeedbackSheet />
              </div>,
              document.body,
            )}
      {showPrivacy && <PrivacyPolicyModal onClose={() => setShowPrivacy(false)} />}
      {showCookies && <CookiePolicyModal onClose={() => setShowCookies(false)} />}
      {showWelcomeModal && session?.user?.id && (
        <WelcomeModal
          userId={session.user.id}
          onboardingState={onboardingState}
          onStateChange={setOnboardingState}
          onClose={() => setShowWelcomeModal(false)}
        />
      )}
      {!showWelcomeModal && releaseNotesMode && filteredReleaseNotes.length > 0 && (
        <ReleaseNotesModal
          notes={filteredReleaseNotes}
          currentVersion={appVersion?.replace("Rhozly OS ", "") ?? ""}
          mode={releaseNotesMode}
          onClose={() => setReleaseNotesMode(null)}
        />
      )}
      </Sentry.ErrorBoundary>
    </PlantDoctorProvider>
  </HomeRealtimeProvider>
  </HomePermissionsProvider>
  </BetaFeedbackProvider>
  );
}

function DashboardRealtimeSubscriber({
  onDataRefresh,
  onProfileRefresh,
  onInventoryChange,
}: {
  onDataRefresh: () => void;
  onProfileRefresh: () => void;
  onInventoryChange: () => void;
}) {
  useHomeRealtime("locations", onDataRefresh);
  useHomeRealtime("areas", onDataRefresh);
  useHomeRealtime("inventory_items", onInventoryChange);
  useHomeRealtime("homes", onProfileRefresh);
  // `tasks` was missing — adding a task today used to leave the
  // Dashboard's today-count / overdue chip stale until the user
  // navigated away and back. Subscribe so any INSERT / UPDATE / DELETE
  // for the home triggers a dashboard refetch. With local-first
  // caching (planned) this also keeps the on-disk snapshot fresh.
  useHomeRealtime("tasks", onDataRefresh);

  // Weather (snapshots + alerts) is NOT subscribed via realtime — it
  // changes on an hourly cron, not user action (scalability Wave D).
  // Instead we refetch on tab-focus, throttled to once per 5 minutes,
  // so returning to the app picks up fresh weather without the
  // per-client realtime cost.
  useEffect(() => {
    let lastRefetch = Date.now();
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastRefetch < 5 * 60_000) return;
      lastRefetch = Date.now();
      onDataRefresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [onDataRefresh]);

  return null;
}

