import { Toaster, toast } from "react-hot-toast";
import React, { useEffect, useState, useCallback, lazy, Suspense } from "react";
import { createPortal } from "react-dom";
import { supabase } from "./lib/supabase";
import {
  Cloud,
  Menu,
  Home,
  Loader2,
  X,
  MapPin,
  RefreshCw,
  AlertCircle,
  HelpCircle,
} from "lucide-react";
import { IconShed, IconPlanner, IconDoctor, IconAI, IconIntegrations } from "./constants/icons";

// 🚀 NATIVE IMPORT
import { App as CapApp } from "@capacitor/app";

// 🚀 ROUTER
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";

// Components — always needed on first render (keep eager)
import LocationTile from "./components/LocationTile";
import { HomeDropdown } from "./components/HomeDropdown";
import { LocationPage } from "./components/LocationPage";
import { Auth } from "./components/Auth";
import { HomeSetup } from "./components/HomeSetup";
import type { UserProfile } from "./types";
import { Logger } from "./lib/errorHandler";
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
import NavItem from "./components/NavItem";
import UpdateBanner from "./components/UpdateBanner";
import MaintenanceScreen from "./components/MaintenanceScreen";
import { useMaintenanceMode } from "./hooks/useMaintenanceMode";
import { useAppVersion } from "./hooks/useAppVersion";
import PrivacyPolicyModal from "./components/PrivacyPolicyModal";
import CookiePolicyModal from "./components/CookiePolicyModal";
import ReleaseNotesModal from "./components/ReleaseNotesModal";
import { useReleaseNotes } from "./hooks/useReleaseNotes";
import HelpCenter from "./onboarding/HelpCenter";
import type { OnboardingState } from "./onboarding/types";

// Heavy route components — lazy loaded so they don't bloat the initial bundle
const HomeDashboard       = lazy(() => import("./components/HomeDashboard"));
const AdminGuideGenerator = lazy(() => import("./components/AdminGuideGenerator"));
const PlantDoctor         = lazy(() => import("./components/PlantDoctor"));
const LightSensor         = lazy(() => import("./components/LightSensor"));
const SunTrajectoryAR     = lazy(() => import("./components/SunTrajectoryAR"));
const GuideList           = lazy(() => import("./components/GuideList"));
const BlueprintManager    = lazy(() => import("./components/BlueprintManager"));
const PlantVisualiser     = lazy(() => import("./components/PlantVisualiser"));
const GardenLayoutList    = lazy(() => import("./components/GardenLayoutList"));
const GardenLayoutEditor  = lazy(() => import("./components/GardenLayoutEditor"));
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
import {
  getMidnightTonight,
  getCachedWeatherData,
  extractCurrentWeather,
  getCachedLocations,
  setLocationCache,
} from "./lib/clientCache";
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
      <AppShell />
      <UpdateBanner />
    </BrowserRouter>
  );
}

const TAB_URL: Record<string, string> = {
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
  const appVersion = useAppVersion();
  const navigate = useNavigate();
  const routerLocation = useLocation();

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

  // Mobile Nav State
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [helpCenterOpen, setHelpCenterOpen] = useState(false);
  const [isMdBreakpoint, setIsMdBreakpoint] = useState(() => window.matchMedia("(min-width: 768px)").matches);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showCookies, setShowCookies] = useState(false);
  const allReleaseNotes = useReleaseNotes();
  const [releaseNotesMode, setReleaseNotesMode] = useState<"latest" | "history" | null>(null);

  useEffect(() => {
    if (!appVersion) return;
    const versionKey = appVersion.replace("Rhozly OS ", "");
    const lastSeen = localStorage.getItem("rhozly_last_seen_version");
    if (lastSeen !== versionKey) {
      setReleaseNotesMode("latest");
      localStorage.setItem("rhozly_last_seen_version", versionKey);
      sessionStorage.setItem("rhozly_just_saw_release_notes", "true");
    }
  }, [appVersion]);

  // Onboarding state — kept in sync with profile.onboarding_state
  const [onboardingState, setOnboardingState] = useState<OnboardingState>({});

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

    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }

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

  const [searchParams] = useSearchParams();
  const selectedLocationId = searchParams.get("locationId");
  const dashboardView = (searchParams.get("view") as "dashboard" | "locations" | "calendar" | "weather") || "dashboard";
  const [isNavCollapsed, setIsNavCollapsed] = useState(
    () => localStorage.getItem("rhozly_nav") === "true",
  );
  const [quizCompleted, setQuizCompleted] = useState<boolean | null>(null);
  const [quizPromptDismissed, setQuizPromptDismissed] = useState(false);
  const [quizPromptFading, setQuizPromptFading] = useState(false);

  useEffect(() => {
    if (!profile?.home_id || !session?.user?.id) return;
    supabase
      .from("home_quiz_completions")
      .select("id")
      .eq("home_id", profile.home_id)
      .eq("user_id", session.user.id)
      .maybeSingle()
      .then(({ data }) => setQuizCompleted(!!data));
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

  useEffect(() => {
    localStorage.setItem("rhozly_nav", isNavCollapsed.toString());
  }, [isNavCollapsed]);

  const fetchDashboardData = useCallback(async () => {
    if (!profile?.home_id) return;

    setDashboardError(false);

    const cachedWeather = getCachedWeatherData(profile.home_id);
    const cachedLocs = getCachedLocations(profile.home_id);

    if (cachedWeather) {
      setRawWeather(cachedWeather);
      setWeather(extractCurrentWeather(cachedWeather));
    }
    if (cachedLocs) {
      setLocations(cachedLocs);
    }

    const { data, error } = await supabase
      .from("homes")
      .select(
        `
        *,
        weather_snapshots ( data ),
        locations (
          *,
          areas ( id, name ),
          inventory_items ( id, status )
        )
      `,
      )
      .eq("id", profile.home_id)
      .single();

    if (error) {
      Logger.error("Failed to fetch home data", error);
      toast.error("Could not load dashboard data");
      setDashboardError(true);
      setDashboardLoaded(true);
      return;
    }

    if (data) {
      if (data.locations) {
        setLocations(data.locations);
        setLocationCache(profile.home_id, data.locations);

        const locationIds = data.locations.map((l: any) => l.id);
        if (locationIds.length > 0) {
          const todayStr = getLocalDateString(new Date());

          // Fetch alerts, today's physical tasks, and blueprints in parallel
          const [alertResult, todayTasksResult, bpResult] = await Promise.all([
            supabase
              .from("weather_alerts")
              .select("*")
              .in("location_id", locationIds)
              .eq("is_active", true)
              .order("starts_at", { ascending: true }),
            supabase
              .from("tasks")
              .select("id, blueprint_id, location_id")
              .in("location_id", locationIds)
              .eq("due_date", todayStr)
              .neq("status", "Skipped")
              .neq("status", "Completed"),
            supabase
              .from("task_blueprints")
              .select("id, location_id, start_date, created_at, end_date, frequency_days")
              .in("location_id", locationIds)
              .eq("is_recurring", true),
          ]);

          setAlerts(alertResult.data || []);

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

          setLocationTaskCounts(counts);
        }
      }

      if (data.weather_snapshots) {
        const snapshots = data.weather_snapshots;
        const freshRawData = Array.isArray(snapshots)
          ? snapshots[0]?.data
          : snapshots?.data;
        if (freshRawData) {
          setRawWeather(freshRawData);
          try {
            setWeather(extractCurrentWeather(freshRawData));
            sessionStorage.setItem(
              `weather_cache_${profile.home_id}`,
              JSON.stringify({
                data: freshRawData,
                expiresAt: getMidnightTonight(),
              }),
            );
          } catch (e) {
            Logger.error("Weather parse/cache failed", e);
            toast.error("Could not load weather data");
          }
        }
      }
    }
    setDashboardLoaded(true);
  }, [profile?.home_id]);

  // Fetches profile for a given userId. Accepts userId directly so it can be
  // called inline after getSession() without waiting for a React re-render cycle.
  // Speculatively fetches home_members in parallel so the fallback path is free.
  const loadProfile = async (userId: string) => {
    const [profileResult, membershipsResult] = await Promise.all([
      supabase
        .from("user_profiles")
        .select("uid, home_id, display_name, first_name, last_name, subscription_tier, ai_enabled, enable_perenual, is_admin, onboarding_state, can_view_audit")
        .eq("uid", userId)
        .single(),
      supabase
        .from("home_members")
        .select("home_id")
        .eq("user_id", userId)
        .limit(1),
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
    sessionStorage.removeItem(`weather_cache_${profile.home_id}`);
    sessionStorage.removeItem(`locations_cache_${profile.home_id}`);
    await Promise.all([fetchDashboardData(), refreshProfile()]);
    setIsRefreshing(false);
    toast.success("Feed refreshed");
  };

  // Stable callbacks passed into the Realtime subscriber component (inside the provider).
  const handleHomeDataRealtime = useCallback(() => {
    if (!profile?.home_id) return;
    sessionStorage.removeItem(`locations_cache_${profile.home_id}`);
    sessionStorage.removeItem(`weather_cache_${profile.home_id}`);
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
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) loadProfile(session.user.id).catch(() => {});
      else setProfile(null);
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

  // New users who have a home but haven't picked a plan yet
  if (profile && profile.home_id && !profile.subscription_tier)
    return (
      <TierSelection
        userId={session.user.id}
        onComplete={(tier: TierId, aiEnabled: boolean, perenualEnabled: boolean) => {
          setProfile((prev: any) => prev
            ? { ...prev, subscription_tier: tier, ai_enabled: aiEnabled, enable_perenual: perenualEnabled }
            : prev
          );
        }}
      />
    );

  const navLinks = [
    { id: "dashboard", icon: <Home />, label: "Dashboard", matchPaths: ["/dashboard", "/"] },
    { id: "shed",      icon: <IconShed />, label: "Garden", matchPaths: ["/shed", "/watchlist"] },
    { id: "planner",   icon: <IconPlanner />, label: "Plan",    matchPaths: ["/planner", "/shopping"] },
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
          <div className="h-screen bg-rhozly-bg text-rhozly-on-surface font-body flex flex-col relative selection:bg-rhozly-primary/20">
            <div className="fixed top-0 left-1/4 w-96 h-96 bg-rhozly-primary/5 rounded-full blur-3xl pointer-events-none" />

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
              />
            </header>

            <div className="flex flex-1 overflow-hidden relative z-10 w-full">
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

              <main id="main-content" aria-label="Main content" className="flex-1 relative w-full overflow-hidden">
                {/* Full-bleed routes that must escape the padded PullToRefresh wrapper */}
                <Suspense fallback={null}>
                <Routes>
                  <Route path="/sun-trajectory" element={
                    <div className="absolute inset-0 z-20 animate-in fade-in duration-500">
                      {profile?.home_id ? (
                        <SunTrajectoryAR homeId={profile.home_id} />
                      ) : (
                        <div className="h-full flex flex-col items-center justify-center p-10 text-center">
                          <Loader2 className="animate-spin text-rhozly-primary mb-4" size={40} />
                          <p className="font-bold text-rhozly-on-surface/40 uppercase tracking-widest text-[10px]">
                            Loading Home Data...
                          </p>
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
                  <div className="p-4 md:p-8 pb-28 md:pb-8 min-h-full">
                    <Suspense fallback={RouteFallback}>
                    <Routes>
                      <Route path="/" element={<Navigate to="/dashboard" replace />} />

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

                                {dashboardView === "dashboard" ? (
                                  <div className="space-y-5">
                                    {/* Current weather widget */}
                                    <div data-testid="dashboard-weather-widget" className="bg-gradient-to-r from-rhozly-primary to-rhozly-primary-container text-white rounded-3xl p-5 shadow-md flex justify-between items-center">
                                      <div className="flex items-center gap-4">
                                        <div className="bg-white/20 p-3 rounded-2xl">
                                          {weather?.Icon ? (
                                            <weather.Icon className="w-8 h-8" />
                                          ) : (
                                            <Cloud className="w-8 h-8" />
                                          )}
                                        </div>
                                        <div>
                                          <p className="font-black text-2xl mb-1">
                                            {weather
                                              ? `${Math.round(weather.temp)}°C`
                                              : "--°C"}{" "}
                                            <span className="text-lg opacity-80">
                                              {weather?.description || "Loading..."}
                                            </span>
                                          </p>
                                          <p className="text-xs font-bold opacity-70">
                                            Humidity: {weather?.humidity || "--"}%
                                            • Wind: {weather?.wind || "--"} km/h
                                          </p>
                                        </div>
                                      </div>
                                      <button
                                        onClick={() => navigate("/dashboard?view=weather", { replace: true })}
                                        className="text-xs font-bold bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl border border-white/20"
                                      >
                                        Full Forecast
                                      </button>
                                    </div>
                                    {/* Complete Home Profile quiz prompt */}
                                    {quizCompleted === false && !quizPromptDismissed && (
                                      <div className={`bg-gradient-to-br from-emerald-500 to-teal-600 text-white rounded-3xl p-5 shadow-md relative overflow-hidden transition-all duration-300 ${quizPromptFading ? "opacity-0 scale-95 pointer-events-none" : "opacity-100 scale-100"}`}>
                                        <button
                                          onClick={() => { setQuizPromptFading(true); setTimeout(() => { setQuizPromptDismissed(true); setQuizPromptFading(false); }, 300); toast.success("Reminder dismissed — find it any time in Home Profile.", { duration: 2500 }); }}
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
                                            <p className="font-black text-sm leading-tight mb-1">Set up your Home Profile</p>
                                            <p className="text-xs text-white/80 leading-snug mb-3">Answer a few quick questions so the AI can personalise your recommendations.</p>
                                            <button onClick={() => navigate("/profile")} className="bg-white text-emerald-700 text-xs font-black px-4 py-2 rounded-full hover:bg-white/90 transition">Get started →</button>
                                          </div>
                                        </div>
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
                                        <HomeDashboard homeId={profile.home_id} />
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
                                      <TaskCalendar homeId={profile.home_id} preloadedLocations={locations} />
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
                            <BlueprintManager homeId={profile.home_id} />
                          </div>
                        ) : null
                      } />

                      <Route path="/shed" element={
                        profile?.home_id ? (
                          <GardenHub homeId={profile.home_id} aiEnabled={profile.ai_enabled ?? false} perenualEnabled={profile.enable_perenual ?? false} />
                        ) : null
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

                      <Route path="/management" element={
                        <div className="h-full animate-in fade-in duration-500">
                          {profile?.home_id ? (
                            <LocationManager homeId={profile.home_id} onDataChanged={handleHomeDataRealtime} />
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
              </div>,
              document.body,
            )}
      {showPrivacy && <PrivacyPolicyModal onClose={() => setShowPrivacy(false)} />}
      {showCookies && <CookiePolicyModal onClose={() => setShowCookies(false)} />}
      {releaseNotesMode && allReleaseNotes.length > 0 && (
        <ReleaseNotesModal
          notes={allReleaseNotes}
          currentVersion={appVersion?.replace("Rhozly OS ", "") ?? ""}
          mode={releaseNotesMode}
          onClose={() => setReleaseNotesMode(null)}
        />
      )}
      </Sentry.ErrorBoundary>
    </PlantDoctorProvider>
  </HomeRealtimeProvider>
  </HomePermissionsProvider>
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
  useHomeRealtime("weather_alerts", onDataRefresh);
  useHomeRealtime("inventory_items", onInventoryChange);
  useHomeRealtime("weather_snapshots", onDataRefresh);
  useHomeRealtime("homes", onProfileRefresh);
  return null;
}

