import { Toaster, toast } from "react-hot-toast";
import React, { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { supabase } from "./lib/supabase";
import {
  Cloud,
  Menu,
  Home,
  Loader2,
  Database,
  Stethoscope,
  X,
  Map,
  Sparkles,
} from "lucide-react";

// 🚀 NATIVE IMPORT
import { App as CapApp } from "@capacitor/app";

// 🚀 ROUTER
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";

import AdminGuideGenerator from "./components/AdminGuideGenerator";

// Components
import LocationTile from "./components/LocationTile";
import { HomeDropdown } from "./components/HomeDropdown";
import { LocationPage } from "./components/LocationPage";
import { LocationManager } from "./components/LocationManager";
import { Auth } from "./components/Auth";
import { HomeSetup } from "./components/HomeSetup";
import type { UserProfile } from "./types";
import { Logger } from "./lib/errorHandler";
import * as Sentry from "@sentry/react";
import WeatherForecast from "./components/WeatherForecast";
import { WeatherAlertBanner } from "./components/WeatherAlertBanner";
import TheShed from "./components/TheShed";
import TaskCalendar from "./components/TaskCalendar";
import TaskList from "./components/TaskList";
import PlantDoctor from "./components/PlantDoctor";
import LightSensor from "./components/LightSensor";
import SunTrajectoryAR from "./components/SunTrajectoryAR";
import GuideList from "./components/GuideList";

// 🚀 NEW: Import the Blueprint Manager
import BlueprintManager from "./components/BlueprintManager";

import { usePushNotifications } from "./hooks/usePushNotifications";
import PullToRefresh from "./components/PullToRefresh";
import { PlantDoctorProvider } from "./context/PlantDoctorContext";
import { HomeRealtimeProvider } from "./context/HomeRealtimeContext";
import { HomePermissionsProvider } from "./context/HomePermissionsContext";
import { useHomeRealtime } from "./hooks/useHomeRealtime";
import PlantDoctorChat from "./components/PlantDoctorChat";
import ErrorPage from "./components/ErrorPage";
import GardenProfile from "./components/GardenProfile";
import GardenerProfile from "./components/GardenerProfile";
import TierSelection from "./components/TierSelection";
import { type TierId } from "./constants/tiers";
import AssistantCard from "./components/AssistantCard";
import PlantVisualiser from "./components/PlantVisualiser";
import GardenLayoutList from "./components/GardenLayoutList";
import GardenLayoutEditor from "./components/GardenLayoutEditor";
import HomeManagement from "./components/HomeManagement";
import GardenHub from "./components/GardenHub";
import PlannerHub from "./components/PlannerHub";
import ToolsHub from "./components/ToolsHub";
import UserProfileDropdown from "./components/UserProfileDropdown";
import NavItem from "./components/NavItem";
import UpdateBanner from "./components/UpdateBanner";
import PrivacyPolicyModal from "./components/PrivacyPolicyModal";
import CookiePolicyModal from "./components/CookiePolicyModal";
import HelpCenter from "./onboarding/HelpCenter";
import type { OnboardingState } from "./onboarding/types";
import {
  getMidnightTonight,
  getCachedWeatherData,
  extractCurrentWeather,
  getCachedLocations,
  setLocationCache,
} from "./lib/clientCache";

// Service worker update checks + background-time reload safety net.
if ("serviceWorker" in navigator) {
  // When the SW changes controller (new SW activated after user taps "Reload"
  // in the UpdateBanner), reload the page so old JS doesn't run with the new SW.
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
        // If the app was backgrounded for > 30 minutes, do a hard reload.
        // This recovers from the OS killing the WebView process (common on iOS
        // under memory pressure) which can leave the app in a broken state.
        if (hiddenAt > 0 && Date.now() - hiddenAt > 30 * 60 * 1000) {
          window.location.reload();
        }
      }
    });
  });
}


export default function App() {
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
};

function AppShell() {
  usePushNotifications();
  const navigate = useNavigate();
  const routerLocation = useLocation();

  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAddingHome, setIsAddingHome] = useState(false);
  const [locations, setLocations] = useState<any[]>([]);
  const [weather, setWeather] = useState<any>(null);
  const [rawWeather, setRawWeather] = useState<any>(null);
  const [alerts, setAlerts] = useState<any[]>([]);

  // Mobile Nav State
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showCookies, setShowCookies] = useState(false);

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
            Logger.error("Native session restoration failed", error);
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
  const dashboardView = (searchParams.get("view") as "locations" | "calendar" | "weather") || "locations";
  const [isNavCollapsed, setIsNavCollapsed] = useState(
    () => localStorage.getItem("rhozly_nav") === "true",
  );
  const [quizCompleted, setQuizCompleted] = useState<boolean | null>(null);
  const [quizPromptDismissed, setQuizPromptDismissed] = useState(false);

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
    localStorage.setItem("rhozly_nav", isNavCollapsed.toString());
  }, [isNavCollapsed]);

  const fetchDashboardData = useCallback(async () => {
    if (!profile?.home_id) return;

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
          areas ( id ),
          inventory_items ( id, status )
        )
      `,
      )
      .eq("id", profile.home_id)
      .single();

    if (error) {
      Logger.error("Failed to fetch home data", error);
      return;
    }

    if (data) {
      if (data.locations) {
        setLocations(data.locations);
        setLocationCache(profile.home_id, data.locations);

        const locationIds = data.locations.map((l: any) => l.id);
        if (locationIds.length > 0) {
          const { data: alertData } = await supabase
            .from("weather_alerts")
            .select("*")
            .in("location_id", locationIds)
            .eq("is_active", true)
            .order("starts_at", { ascending: true });

          setAlerts(alertData || []);
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
          }
        }
      }
    }
  }, [profile?.home_id]);

  const refreshProfile = async () => {
    if (!session?.user) return;
    const { data: profileData, error } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("uid", session.user.id)
      .single();
    if (error) throw error;
    if (profileData && !profileData.home_id) {
      const { data: otherMemberships } = await supabase
        .from("home_members")
        .select("home_id")
        .eq("user_id", session.user.id)
        .limit(1);
      if (otherMemberships && otherMemberships.length > 0) {
        const fallbackId = otherMemberships[0].home_id;
        await supabase
          .from("user_profiles")
          .update({ home_id: fallbackId })
          .eq("uid", session.user.id);
        profileData.home_id = fallbackId;
      }
    }
    setProfile(profileData);
    if (profileData?.onboarding_state) {
      setOnboardingState(profileData.onboarding_state);
    }
  };

  const handleManualRefresh = async () => {
    if (!profile?.home_id) return;
    sessionStorage.removeItem(`weather_cache_${profile.home_id}`);
    sessionStorage.removeItem(`locations_cache_${profile.home_id}`);
    await Promise.all([fetchDashboardData(), refreshProfile()]);
  };

  // Stable callbacks passed into the Realtime subscriber component (inside the provider).
  const handleHomeDataRealtime = useCallback(() => {
    if (!profile?.home_id) return;
    sessionStorage.removeItem(`locations_cache_${profile.home_id}`);
    sessionStorage.removeItem(`weather_cache_${profile.home_id}`);
    fetchDashboardData();
  }, [profile?.home_id, fetchDashboardData]);

  const handleProfileRealtime = useCallback(() => {
    refreshProfile();
  }, []);

  const handleSwitchHome = async (homeId: string) => {
    setWeather(null);
    setRawWeather(null);
    setLocations([]);
    setAlerts([]);
    try {
      const { error } = await supabase
        .from("user_profiles")
        .update({ home_id: homeId })
        .eq("uid", session.user.id);
      if (error) throw error;
      setProfile((prev: any) => (prev ? { ...prev, home_id: homeId } : null));
      setIsAddingHome(false);
    } catch (err: any) {
      Logger.error("Failed to switch home", err);
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
    // Safety bail: if auth resolution never completes (offline, SW update race,
    // expired token refresh hang) unblock the UI after 8 s so the screen
    // doesn't stay blank/spinning forever.
    const bail = setTimeout(() => setLoading(false), 8_000);

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        clearTimeout(bail);
        setSession(session);
        if (!session) setLoading(false);
      })
      .catch(() => {
        clearTimeout(bail);
        setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) =>
      setSession(session),
    );
    return () => {
      clearTimeout(bail);
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session?.user) return;
    // Safety bail: if the profile query hangs (slow network after cold open),
    // unblock the UI so the user isn't stuck on a loading spinner.
    const bail = setTimeout(() => setLoading(false), 8_000);
    refreshProfile()
      .catch(err => Logger.error("Profile load failed on cold start", err))
      .finally(() => {
        clearTimeout(bail);
        setLoading(false);
      });
    return () => clearTimeout(bail);
  }, [session]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Refresh dashboard data whenever the user navigates to /dashboard so the
  // location tiles always reflect the latest state (e.g. after adding/deleting
  // an area in Location Management).
  useEffect(() => {
    if (routerLocation.pathname !== "/dashboard") return;
    if (!profile?.home_id) return;
    sessionStorage.removeItem(`locations_cache_${profile.home_id}`);
    fetchDashboardData();
  }, [routerLocation.pathname, profile?.home_id, fetchDashboardData]);

  if (loading)
    return (
      <div className="h-screen flex items-center justify-center bg-rhozly-bg">
        <Loader2 className="animate-spin text-rhozly-primary" size={40} />
      </div>
    );
  if (!session) return <Auth />;
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
    { id: "dashboard", icon: <Home />, label: "Home",   matchPaths: ["/dashboard", "/"] },
    { id: "shed",      icon: <Database />, label: "Garden", matchPaths: ["/shed", "/watchlist"] },
    { id: "planner",   icon: <Map />, label: "Plan",    matchPaths: ["/planner", "/shopping"] },
    { id: "tools",     icon: <Stethoscope />, label: "Tools",   matchPaths: ["/tools", "/doctor", "/visualiser", "/lightsensor", "/guides", "/garden-layout", "/sun-trajectory"] },
  ];

  const canUsePortal = typeof document !== "undefined";

  return (
    <HomePermissionsProvider homeId={profile?.home_id} userId={session?.user?.id}>
    <HomeRealtimeProvider homeId={profile?.home_id || ""}>
      <DashboardRealtimeSubscriber
        onDataRefresh={handleHomeDataRealtime}
        onProfileRefresh={handleProfileRealtime}
      />
    <PlantDoctorProvider homeId={profile?.home_id || ""}>
      <Sentry.ErrorBoundary fallback={({ error }) => <ErrorPage error={error instanceof Error ? error : undefined} />}>
          <Toaster />
          <div className="min-h-screen bg-rhozly-bg text-rhozly-on-surface font-body flex flex-col relative selection:bg-rhozly-primary/20">
            <div className="fixed top-0 left-1/4 w-96 h-96 bg-rhozly-primary/5 rounded-full blur-3xl pointer-events-none" />

            <header className="sticky top-0 z-30 bg-rhozly-primary border-b border-rhozly-primary-container px-4 md:px-8 py-4 flex justify-between items-center shadow-md">
              <div className="flex items-center gap-3 font-display font-black text-2xl tracking-tight text-white">
                <button
                  onClick={() => setIsNavCollapsed(!isNavCollapsed)}
                  className="hidden md:flex hover:bg-white/20 p-2 rounded-xl transition-colors items-center justify-center mr-1"
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
                <div className="relative ml-2 md:ml-6">
                  <HomeDropdown
                    currentHomeId={profile?.home_id || null}
                    onSelectHome={handleSwitchHome}
                    onAddNewHome={() => setIsAddingHome(true)}
                    onHomeListChanged={refreshProfile}
                  />
                </div>
              </div>
              <UserProfileDropdown
                displayName={profile?.display_name ?? null}
                email={session?.user?.email ?? null}
                isAdmin={profile?.is_admin ?? false}
              />
            </header>

            <div className="flex flex-1 overflow-hidden relative z-10 w-full">
              <nav
                className={`hidden md:flex flex-col justify-between p-6 transition-all duration-300 border-r border-rhozly-primary/20 bg-rhozly-primary-container ${isNavCollapsed ? "w-28 items-center" : "w-72"}`}
              >
                <div className="flex flex-col gap-2">
                  {navLinks.map((link) => (
                    <NavItem
                      key={link.id}
                      icon={link.icon}
                      label={link.label}
                      active={link.matchPaths.some(p => routerLocation.pathname === p || routerLocation.pathname.startsWith(p + "/"))}
                      onClick={() => navigate(TAB_URL[link.id])}
                      isCollapsed={isNavCollapsed}
                      isMobile={false}
                    />
                  ))}
                </div>
                <div className="flex flex-col gap-1 mt-4">
                  <button
                    onClick={() => setShowPrivacy(true)}
                    className="text-[10px] font-bold text-rhozly-on-surface/30 hover:text-rhozly-on-surface/60 transition-colors text-center"
                  >
                    {isNavCollapsed ? "Privacy" : "Privacy Policy"}
                  </button>
                  <button
                    onClick={() => setShowCookies(true)}
                    className="text-[10px] font-bold text-rhozly-on-surface/30 hover:text-rhozly-on-surface/60 transition-colors text-center"
                  >
                    {isNavCollapsed ? "Cookies" : "Cookie Policy"}
                  </button>
                </div>
              </nav>

              <main className="flex-1 relative w-full overflow-hidden">
                {/* Full-bleed routes that must escape the padded PullToRefresh wrapper */}
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
                </Routes>

                <PullToRefresh onRefresh={handleManualRefresh}>
                  <div className="p-4 md:p-8 pb-28 md:pb-8 min-h-full">
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
                                className={`${dashboardView === "weather" || dashboardView === "calendar" ? "col-span-full" : "lg:col-span-7 xl:col-span-8"} space-y-6`}
                              >
                                <WeatherAlertBanner
                                  alerts={alerts}
                                  isForecastScreen={dashboardView === "weather"}
                                />

                                <div className="flex items-center justify-between px-1">
                                  <div data-testid="dashboard-view-switcher" className="bg-rhozly-primary/5 p-1 rounded-2xl inline-flex">
                                    {["locations", "calendar", "weather"].map(
                                      (v) => (
                                        <button
                                          key={v}
                                          onClick={() =>
                                            navigate(v === "locations" ? "/dashboard" : `/dashboard?view=${v}`, { replace: true })
                                          }
                                          className={`px-4 py-1.5 rounded-xl font-bold text-sm transition-all ${dashboardView === v ? "bg-white text-rhozly-primary shadow-sm" : "text-rhozly-primary/60 hover:text-rhozly-primary"}`}
                                        >
                                          {v.charAt(0).toUpperCase() + v.slice(1)}
                                        </button>
                                      ),
                                    )}
                                  </div>
                                </div>

                                {dashboardView === "locations" ? (
                                  <div className="space-y-5">
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
                                              {weather?.description ||
                                                "Loading..."}
                                            </span>
                                          </p>
                                          <p className="text-xs font-bold opacity-70">
                                            Humidity: {weather?.humidity || "--"}%
                                            • Wind: {weather?.wind || "--"} km/h
                                          </p>
                                        </div>
                                      </div>
                                      <button
                                        onClick={() =>
                                          navigate("/dashboard?view=weather", { replace: true })
                                        }
                                        className="text-xs font-bold bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl border border-white/20"
                                      >
                                        Full Forecast
                                      </button>
                                    </div>
                                    <div data-testid="dashboard-location-grid" className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                      {locations.length > 0 ? (
                                        locations.map((loc: any, idx: number) => (
                                          <LocationTile
                                            key={loc.id}
                                            site={loc}
                                            index={idx}
                                            onClick={() =>
                                              navigate(`/dashboard?locationId=${loc.id}`)
                                            }
                                          />
                                        ))
                                      ) : (
                                        <div className="col-span-full p-8 text-center bg-rhozly-surface-lowest rounded-3xl border border-rhozly-outline/30 opacity-50">
                                          No locations found.
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ) : dashboardView === "calendar" ? (
                                  <div className="bg-rhozly-surface-lowest rounded-[3rem] border border-rhozly-outline/10 overflow-hidden shadow-sm">
                                    {profile?.home_id && (
                                      <TaskCalendar homeId={profile.home_id} />
                                    )}
                                  </div>
                                ) : (
                                  <div className="space-y-6">
                                    <WeatherForecast
                                      weatherData={rawWeather}
                                      alerts={alerts}
                                      homeId={profile?.home_id ?? null}
                                    />
                                  </div>
                                )}
                              </div>

                              {dashboardView !== "weather" &&
                                dashboardView !== "calendar" && (
                                  <div className="lg:col-span-5 xl:col-span-4 space-y-6">
                                    {quizCompleted === false && !quizPromptDismissed && (
                                      <div className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white rounded-3xl p-5 shadow-md relative overflow-hidden">
                                        <button
                                          onClick={() => setQuizPromptDismissed(true)}
                                          className="absolute top-3 right-3 text-white/60 hover:text-white transition"
                                          aria-label="Dismiss"
                                        >
                                          <X size={14} />
                                        </button>
                                        <div className="flex items-start gap-4">
                                          <div className="bg-white/20 p-3 rounded-2xl flex-shrink-0">
                                            <Sparkles size={22} className="text-white" />
                                          </div>
                                          <div className="flex-1 min-w-0">
                                            <p className="font-black text-sm leading-tight mb-1">
                                              Set up your Garden Profile
                                            </p>
                                            <p className="text-xs text-white/80 leading-snug mb-3">
                                              Answer a few quick questions so the AI can personalise your recommendations.
                                            </p>
                                            <button
                                              onClick={() => navigate("/profile")}
                                              className="bg-white text-emerald-700 text-xs font-black px-4 py-2 rounded-full hover:bg-white/90 transition"
                                            >
                                              Get started →
                                            </button>
                                          </div>
                                        </div>
                                      </div>
                                    )}

                                    {session?.user?.id && (
                                      <div data-testid="dashboard-assistant-card">
                                        <AssistantCard userId={session.user.id} />
                                      </div>
                                    )}

                                    <div className="flex items-center justify-between px-1">
                                      <h2 className="font-black opacity-60 uppercase tracking-widest text-sm">
                                        Daily Tasks
                                      </h2>
                                      <button
                                        onClick={() =>
                                          navigate("/dashboard?view=calendar", { replace: true })
                                        }
                                        className="text-[10px] font-black text-rhozly-primary uppercase tracking-widest hover:underline transition-all"
                                      >
                                        View Calendar
                                      </button>
                                    </div>
                                    <div data-testid="dashboard-task-list" className="bg-rhozly-surface-lowest/80 rounded-[2.5rem] p-4 sm:p-6 border border-rhozly-outline/10 shadow-sm min-h-[400px]">
                                      {profile?.home_id && (
                                        <TaskList homeId={profile.home_id} />
                                      )}
                                    </div>
                                  </div>
                                )}
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

                      {/* No-op entries for full-bleed routes handled by the sibling Routes above */}
                      <Route path="/sun-trajectory" element={null} />

                      <Route path="*" element={<Navigate to="/dashboard" replace />} />
                    </Routes>
                  </div>
                </PullToRefresh>
              </main>
            </div>
          </div>

          {canUsePortal &&
            createPortal(
              <div className="font-body text-rhozly-on-surface antialiased">
                <div
                  className={`md:hidden fixed inset-0 z-40 bg-rhozly-bg/80 backdrop-blur-sm transition-opacity duration-300 ${isMobileMenuOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`}
                  onClick={() => setIsMobileMenuOpen(false)}
                />

                <nav
                  className={`md:hidden fixed bottom-24 right-6 left-6 bg-rhozly-primary-container p-4 rounded-[2rem] shadow-2xl flex flex-col gap-2 z-50 transition-all duration-300 border border-rhozly-primary/20 ${isMobileMenuOpen ? "scale-100 opacity-100 translate-y-0" : "scale-90 opacity-0 translate-y-10 pointer-events-none origin-bottom-left"}`}
                >
                  {navLinks.map((link) => (
                    <NavItem
                      key={link.id}
                      icon={link.icon}
                      label={link.label}
                      active={link.matchPaths.some(p => routerLocation.pathname === p || routerLocation.pathname.startsWith(p + "/"))}
                      onClick={() => {
                        navigate(TAB_URL[link.id]);
                        setIsMobileMenuOpen(false);
                      }}
                      isCollapsed={false}
                      isMobile={true}
                    />
                  ))}
                  <div className="flex justify-center gap-4 pt-1 pb-0.5">
                    <button
                      onClick={() => { setShowPrivacy(true); setIsMobileMenuOpen(false); }}
                      className="text-[10px] font-bold text-rhozly-on-surface/30 hover:text-rhozly-on-surface/60 transition-colors"
                    >
                      Privacy Policy
                    </button>
                    <button
                      onClick={() => { setShowCookies(true); setIsMobileMenuOpen(false); }}
                      className="text-[10px] font-bold text-rhozly-on-surface/30 hover:text-rhozly-on-surface/60 transition-colors"
                    >
                      Cookie Policy
                    </button>
                  </div>
                </nav>

                <button
                  onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                  className={`md:hidden fixed bottom-6 left-6 w-14 h-14 rounded-full flex items-center justify-center shadow-2xl z-50 transition-all duration-300 ${isMobileMenuOpen ? "bg-white text-rhozly-primary" : "bg-rhozly-primary text-white"}`}
                >
                  {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
                </button>

                {profile?.home_id && (
                  <PlantDoctorChat homeId={profile.home_id} />
                )}
                <HelpCenter
                  userId={session?.user?.id}
                  onboardingState={onboardingState}
                  onStateChange={setOnboardingState}
                />
              </div>,
              document.body,
            )}
      {showPrivacy && <PrivacyPolicyModal onClose={() => setShowPrivacy(false)} />}
      {showCookies && <CookiePolicyModal onClose={() => setShowCookies(false)} />}
      </Sentry.ErrorBoundary>
    </PlantDoctorProvider>
  </HomeRealtimeProvider>
  </HomePermissionsProvider>
  );
}

function DashboardRealtimeSubscriber({
  onDataRefresh,
  onProfileRefresh,
}: {
  onDataRefresh: () => void;
  onProfileRefresh: () => void;
}) {
  useHomeRealtime("locations", onDataRefresh);
  useHomeRealtime("areas", onDataRefresh);
  useHomeRealtime("weather_alerts", onDataRefresh);
  useHomeRealtime("inventory_items", onDataRefresh);
  useHomeRealtime("weather_snapshots", onDataRefresh);
  useHomeRealtime("homes", onProfileRefresh);
  return null;
}

