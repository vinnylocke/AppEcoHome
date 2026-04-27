import { Toaster, toast } from "react-hot-toast";
import React, { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { supabase } from "./lib/supabase";
import {
  Cloud,
  Menu,
  Home,
  User,
  Wrench,
  Loader2,
  Sun,
  Database,
  Stethoscope,
  X,
  Map,
  Repeat, // 🚀 NEW: Imported Repeat for the Task Management icon
} from "lucide-react";

// 🚀 NATIVE IMPORT
import { App as CapApp } from "@capacitor/app";

// 🚀 ROUTER
import { BrowserRouter } from "react-router-dom";

import AdminGuideGenerator from "./components/AdminGuideGenerator";
import { Wand2 } from "lucide-react";

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
import GuideList from "./components/GuideList";
import { BookOpen } from "lucide-react";

import PlannerDashboard from "./components/PlannerDashboard";
// 🚀 NEW: Import the Blueprint Manager
import BlueprintManager from "./components/BlueprintManager";

import { usePushNotifications } from "./hooks/usePushNotifications";
import PullToRefresh from "./components/PullToRefresh";
import { PlantDoctorProvider } from "./context/PlantDoctorContext";
import PlantDoctorChat from "./components/PlantDoctorChat";
import RouteWatcher from "./components/RouteWatcher";
import NavItem from "./components/NavItem";
import {
  getMidnightTonight,
  getCachedWeatherData,
  extractCurrentWeather,
  getCachedLocations,
  setLocationCache,
} from "./lib/clientCache";

// Force the browser to check for Service Worker updates
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.ready.then((registration) => {
    registration.update();
  });
}


export default function App() {
  usePushNotifications();

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

  const [activeTab, setActiveTab] = useState(
    () => localStorage.getItem("rhozly_tab") || "dashboard",
  );
  const [dashboardView, setDashboardView] = useState<
    "locations" | "calendar" | "weather"
  >(() => (localStorage.getItem("rhozly_view") as any) || "locations");
  const [selectedLocationId, setSelectedLocationId] = useState<
    number | string | null
  >(() => localStorage.getItem("rhozly_locationId") || null);
  const [isNavCollapsed, setIsNavCollapsed] = useState(
    () => localStorage.getItem("rhozly_nav") === "true",
  );

  useEffect(() => {
    localStorage.setItem("rhozly_tab", activeTab);
  }, [activeTab]);
  useEffect(() => {
    localStorage.setItem("rhozly_view", dashboardView);
  }, [dashboardView]);
  useEffect(() => {
    if (selectedLocationId)
      localStorage.setItem("rhozly_locationId", selectedLocationId.toString());
    else localStorage.removeItem("rhozly_locationId");
  }, [selectedLocationId]);
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
          setWeather(extractCurrentWeather(freshRawData));
          sessionStorage.setItem(
            `weather_cache_${profile.home_id}`,
            JSON.stringify({
              data: freshRawData,
              expiresAt: getMidnightTonight(),
            }),
          );
        }
      }
    }
  }, [profile?.home_id]);

  const refreshProfile = async () => {
    if (!session?.user) return;
    const { data: profileData } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("uid", session.user.id)
      .single();
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
  };

  const handleManualRefresh = async () => {
    if (!profile?.home_id) return;
    sessionStorage.removeItem(`weather_cache_${profile.home_id}`);
    sessionStorage.removeItem(`locations_cache_${profile.home_id}`);
    await Promise.all([fetchDashboardData(), refreshProfile()]);
  };

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
      setSelectedLocationId(null);
    } catch (err: any) {
      Logger.error("Failed to switch home", err);
    }
  };

  useEffect(() => {
    if (!profile?.home_id) return;
    const homeChannel = supabase
      .channel("home-updates")
      .on("postgres_changes", { event: "*", schema: "public" }, (payload) => {
        if (
          [
            "locations",
            "areas",
            "homes",
            "weather_alerts",
            "inventory_items",
          ].includes(payload.table)
        ) {
          sessionStorage.removeItem(`locations_cache_${profile.home_id}`);
          fetchDashboardData();
        }
        if (["user_profiles", "home_members"].includes(payload.table))
          refreshProfile();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(homeChannel);
    };
  }, [profile?.home_id, fetchDashboardData]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (!session) setLoading(false);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) =>
      setSession(session),
    );
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session?.user) refreshProfile().then(() => setLoading(false));
  }, [session]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

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

  const navLinks = [
    { id: "dashboard", icon: <Home />, label: "Dashboard" },
    // 🚀 NEW: Task Management Tab
    { id: "task_management", icon: <Repeat />, label: "Task Management" },
    { id: "shed", icon: <Database />, label: "The Shed" },
    { id: "planner", icon: <Map />, label: "Planner" },
    { id: "doctor", icon: <Stethoscope />, label: "Plant Doctor" },
    { id: "lightsensor", icon: <Sun />, label: "Light Sensor" },
    { id: "guides", icon: <BookOpen />, label: "Guides" },
    { id: "management", icon: <Wrench />, label: "Location Management" },
  ];

  if (profile?.is_admin) {
    navLinks.push({
      id: "admin_guides",
      icon: <Wand2 />,
      label: "Guide Studio",
    });
  }

  const canUsePortal = typeof document !== "undefined";

  return (
    <BrowserRouter>
      <PlantDoctorProvider homeId={profile?.home_id || ""}>
        <RouteWatcher
          setActiveTab={setActiveTab}
          setSelectedLocationId={setSelectedLocationId}
        />

        <Sentry.ErrorBoundary fallback={<p>An unexpected error occurred.</p>}>
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
              <div className="flex items-center gap-4 cursor-pointer group">
                <button
                  onClick={() => supabase.auth.signOut()}
                  className="text-xs font-black text-white/60 hover:text-white uppercase tracking-widest transition-colors mr-2"
                >
                  Sign Out
                </button>
                <div className="text-right hidden sm:block text-white">
                  <p className="text-sm font-bold">
                    {profile?.display_name || "Guest"}
                  </p>
                  <p className="text-[10px] uppercase tracking-widest text-white/60 font-semibold">
                    Master Gardener
                  </p>
                </div>
                <div className="w-11 h-11 rounded-full bg-white/20 p-[2px] backdrop-blur-sm">
                  <div className="w-full h-full rounded-full border-2 border-white/30 bg-rhozly-primary-container flex items-center justify-center overflow-hidden">
                    <User className="w-5 h-5 text-white" />
                  </div>
                </div>
              </div>
            </header>

            <div className="flex flex-1 overflow-hidden relative z-10 w-full">
              <nav
                className={`hidden md:flex flex-col justify-start p-6 gap-2 transition-all duration-300 border-r border-rhozly-primary/20 bg-rhozly-primary-container ${isNavCollapsed ? "w-28 items-center" : "w-72"}`}
              >
                {navLinks.map((link) => (
                  <NavItem
                    key={link.id}
                    icon={link.icon}
                    label={link.label}
                    active={activeTab === link.id}
                    onClick={() => {
                      setActiveTab(link.id);
                      setSelectedLocationId(null);
                    }}
                    isCollapsed={isNavCollapsed}
                    isMobile={false}
                  />
                ))}
              </nav>

              <main className="flex-1 relative w-full overflow-hidden">
                <PullToRefresh onRefresh={handleManualRefresh}>
                  <div className="p-4 md:p-8 pb-28 md:pb-8 min-h-full">
                    {activeTab === "planner" && profile?.home_id && (
                      <div className="h-full animate-in fade-in duration-500">
                        <PlannerDashboard homeId={profile.home_id} />
                      </div>
                    )}

                    {/* 🚀 NEW: Task Management Render Block */}
                    {activeTab === "task_management" && profile?.home_id && (
                      <div className="h-full animate-in fade-in duration-500">
                        <BlueprintManager homeId={profile.home_id} />
                      </div>
                    )}

                    {activeTab === "dashboard" && (
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
                                  onBack={() => setSelectedLocationId(null)}
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
                                <div className="bg-rhozly-primary/5 p-1 rounded-2xl inline-flex">
                                  {["locations", "calendar", "weather"].map(
                                    (v) => (
                                      <button
                                        key={v}
                                        onClick={() =>
                                          setDashboardView(v as any)
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
                                  <div className="bg-gradient-to-r from-rhozly-primary to-rhozly-primary-container text-white rounded-3xl p-5 shadow-md flex justify-between items-center">
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
                                        setDashboardView("weather")
                                      }
                                      className="text-xs font-bold bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl border border-white/20"
                                    >
                                      Full Forecast
                                    </button>
                                  </div>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                    {locations.length > 0 ? (
                                      locations.map((loc: any, idx: number) => (
                                        <LocationTile
                                          key={loc.id}
                                          site={loc}
                                          index={idx}
                                          onClick={() =>
                                            setSelectedLocationId(loc.id)
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
                                  />
                                </div>
                              )}
                            </div>

                            {dashboardView !== "weather" &&
                              dashboardView !== "calendar" && (
                                <div className="lg:col-span-5 xl:col-span-4 space-y-6">
                                  <div className="flex items-center justify-between px-1">
                                    <h2 className="font-black opacity-60 uppercase tracking-widest text-sm">
                                      Daily Tasks
                                    </h2>
                                    <button
                                      onClick={() =>
                                        setDashboardView("calendar")
                                      }
                                      className="text-[10px] font-black text-rhozly-primary uppercase tracking-widest hover:underline transition-all"
                                    >
                                      View Calendar
                                    </button>
                                  </div>
                                  <div className="bg-rhozly-surface-lowest/80 rounded-[2.5rem] p-4 sm:p-6 border border-rhozly-outline/10 shadow-sm min-h-[400px]">
                                    {profile?.home_id && (
                                      <TaskList homeId={profile.home_id} />
                                    )}
                                  </div>
                                </div>
                              )}
                          </div>
                        )}
                      </div>
                    )}

                    {activeTab === "shed" && profile?.home_id && (
                      <TheShed homeId={profile.home_id} />
                    )}

                    {activeTab === "doctor" && (
                      <div className="h-full animate-in fade-in duration-500">
                        <PlantDoctor
                          homeId={profile.home_id}
                          aiEnabled={profile.ai_enabled}
                          isPremium={profile.enable_perenual}
                          perenualEnabled={profile.enable_perenual}
                        />
                      </div>
                    )}

                    {activeTab === "lightsensor" && (
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
                    )}

                    {activeTab === "guides" && (
                      <div className="h-full animate-in fade-in duration-500">
                        <GuideList />
                      </div>
                    )}

                    {activeTab === "management" && (
                      <section className="h-full">
                        {profile?.home_id ? (
                          <LocationManager homeId={profile.home_id} />
                        ) : (
                          <div className="p-10 text-center opacity-50 font-bold border-2 border-dashed rounded-3xl">
                            Please select a home.
                          </div>
                        )}
                      </section>
                    )}
                    {activeTab === "admin_guides" && profile?.is_admin && (
                      <div className="h-full animate-in fade-in duration-500">
                        <AdminGuideGenerator />
                      </div>
                    )}
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
                      active={activeTab === link.id}
                      onClick={() => {
                        setActiveTab(link.id);
                        setSelectedLocationId(null);
                        setIsMobileMenuOpen(false);
                      }}
                      isCollapsed={false}
                      isMobile={true}
                    />
                  ))}
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
              </div>,
              document.body,
            )}
        </Sentry.ErrorBoundary>
      </PlantDoctorProvider>
    </BrowserRouter>
  );
}

