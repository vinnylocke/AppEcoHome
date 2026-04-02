import { Toaster } from "react-hot-toast";
import React, { useEffect, useState, useCallback } from "react";
import { supabase } from "./lib/supabase";
import {
  Cloud,
  Menu,
  Home,
  User,
  LogOut,
  MapPin,
  Wrench,
  Leaf,
  Calendar,
  Loader2,
  Sun,
  CloudRain,
  CloudSnow,
  CloudLightning,
  CloudFog,
  CloudDrizzle,
} from "lucide-react";

// Import your components
import LocationTile from "./components/LocationTile";
import { HomeDropdown } from "./components/HomeDropdown";
import { LocationPage } from "./components/LocationPage";
import { LocationManager } from "./components/LocationManager";
import { Auth } from "./components/Auth";
import { HomeSetup } from "./components/HomeSetup";
import type { UserProfile } from "./types";
import { Logger } from "./lib/errorHandler";
import * as Sentry from "@sentry/react";

// --- WEATHER & CACHE HELPERS (OUTSIDE THE COMPONENT) ---

const getMidnightTonight = () => {
  const now = new Date();
  const midnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    0,
    0,
    0,
    0,
  );
  return midnight.getTime();
};

// Weather Helpers
const getCachedWeatherData = (homeId: string) => {
  const cacheKey = `weather_cache_${homeId}`;
  const cached = sessionStorage.getItem(cacheKey);

  if (!cached) {
    console.log("🔍 [Cache] No local weather found for this home.");
    return null;
  }

  const { data, expiresAt } = JSON.parse(cached);

  if (Date.now() > expiresAt) {
    console.log("🗑️ [Cache] Local weather expired at midnight. Deleting...");
    sessionStorage.removeItem(cacheKey);
    return null;
  }

  console.log("⚡ [Cache] Valid weather found! Skipping database for weather.");
  return data;
};

const extractCurrentWeather = (meteoData: any) => {
  // 1. Safely handle the nested data structure
  const data = meteoData?.data || meteoData;
  const hourly = data?.hourly;
  const targetTimezone = data?.timezone || "Europe/London";

  if (!hourly) {
    console.error("❌ [Weather] No 'hourly' object found:", data);
    return null;
  }

  // 2. Format the current time INTO the home's timezone
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: targetTimezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  });

  // Extract the specific parts
  const p: Record<string, string> = {};
  formatter.formatToParts(now).forEach((part) => (p[part.type] = part.value));

  // Browsers sometimes format midnight as '24', so we fix that safely
  const hr = p.hour === "24" ? "00" : p.hour;

  // Build the exact string Open-Meteo uses: "YYYY-MM-DDTHH:00"
  const currentHourTarget = `${p.year}-${p.month}-${p.day}T${hr}:00`;

  console.log(`🕒 [Timezone Check] API Timezone: ${targetTimezone}`);
  console.log(
    `🎯 [Timezone Check] Looking for exact time: ${currentHourTarget}`,
  );

  // 3. Find the matching index
  const index = hourly.time.findIndex((t: string) =>
    t.startsWith(currentHourTarget),
  );
  const i = index !== -1 ? index : 0;

  const weatherMap: Record<number, { label: string; icon: any }> = {
    0: { label: "Clear Sky", icon: Sun },
    1: { label: "Mainly Clear", icon: Sun },
    2: { label: "Partly Cloudy", icon: Cloud },
    3: { label: "Overcast", icon: Cloud },
    45: { label: "Foggy", icon: CloudFog },
    51: { label: "Light Drizzle", icon: CloudDrizzle },
    61: { label: "Light Rain", icon: CloudRain },
    63: { label: "Rain", icon: CloudRain },
    80: { label: "Rain Showers", icon: CloudRain },
    95: { label: "Thunderstorm", icon: CloudLightning },
  };

  const code = hourly.weather_code[i];
  const info = weatherMap[code] || { label: "Partly Cloudy", icon: Cloud };

  return {
    temp: hourly.temperature_2m[i],
    humidity: hourly.relative_humidity_2m[i],
    wind: hourly.wind_speed_10m[i],
    description: info.label,
    Icon: info.icon,
  };
};

// Location Helpers
const getCachedLocations = (homeId: string) => {
  const cacheKey = `locations_cache_${homeId}`;
  const cached = sessionStorage.getItem(cacheKey);

  if (!cached) return null;

  const { data, expiresAt } = JSON.parse(cached);

  // Locations don't need to expire at midnight like weather,
  // but we'll set a 1-hour "sanity" TTL just in case.
  if (Date.now() > expiresAt) {
    sessionStorage.removeItem(cacheKey);
    return null;
  }

  console.log("⚡ [Cache] Locations loaded from memory.");
  return data;
};

const setLocationCache = (homeId: string, data: any[]) => {
  const cacheKey = `locations_cache_${homeId}`;
  const payload = {
    data: data,
    expiresAt: Date.now() + 60 * 60 * 1000, // 1 hour TTL
  };
  sessionStorage.setItem(cacheKey, JSON.stringify(payload));
};

export default function App() {
  // ==========================================
  // 1. THE BRAIN: SUPABASE & STATE MANAGEMENT
  // ==========================================
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAddingHome, setIsAddingHome] = useState(false);
  const [locations, setLocations] = useState<any[]>([]);
  const [weather, setWeather] = useState<any>(null);

  // ==========================================
  // UI STATE (With Local Storage Persistence)
  // ==========================================

  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem("rhozly_tab") || "dashboard";
  });

  const [dashboardView, setDashboardView] = useState<
    "locations" | "calendar" | "weather"
  >(() => {
    return (localStorage.getItem("rhozly_view") as any) || "locations";
  });

  const [selectedLocationId, setSelectedLocationId] = useState<
    number | string | null
  >(() => {
    return localStorage.getItem("rhozly_locationId") || null;
  });

  const [isNavCollapsed, setIsNavCollapsed] = useState(() => {
    return localStorage.getItem("rhozly_nav") === "true";
  });

  // --- UI STATE SAVERS ---
  // These effects silently save the user's place every time they click a button

  useEffect(() => {
    localStorage.setItem("rhozly_tab", activeTab);
  }, [activeTab]);

  useEffect(() => {
    localStorage.setItem("rhozly_view", dashboardView);
  }, [dashboardView]);

  useEffect(() => {
    if (selectedLocationId) {
      localStorage.setItem("rhozly_locationId", selectedLocationId.toString());
    } else {
      localStorage.removeItem("rhozly_locationId");
    }
  }, [selectedLocationId]);

  useEffect(() => {
    localStorage.setItem("rhozly_nav", isNavCollapsed.toString());
  }, [isNavCollapsed]);

  // Fetching Logic
  const fetchDashboardData = useCallback(async () => {
    if (!profile?.home_id) return;

    // 1. PEEK AT THE CACHES
    const cachedWeather = getCachedWeatherData(profile.home_id);
    const cachedLocs = getCachedLocations(profile.home_id);

    // 2. APPLY CACHES TO UI
    if (cachedWeather) setWeather(extractCurrentWeather(cachedWeather));
    if (cachedLocs) setLocations(cachedLocs);

    // 3. THE "STRICT" KILL SWITCH
    if (cachedWeather && cachedLocs) {
      console.log("🛑 [Database] Skipped! Both caches are valid.");
      return;
    }

    // 4. WE ONLY GET HERE IF SOMETHING IS MISSING
    console.log("🌐 [Database] Cache missing. Fetching from cloud...");

    let query = "*";
    if (cachedWeather && !cachedLocs) {
      query = "*, locations ( * )";
    } else if (!cachedWeather && cachedLocs) {
      query = "*, weather_snapshots ( data )";
    } else {
      query = "*, weather_snapshots ( data ), locations ( * )";
    }

    console.log(`📡 [Database] Sending Query: ${query}`);

    const { data, error } = await supabase
      .from("homes")
      .select(query)
      .eq("id", profile.home_id)
      .single();

    // --- X-RAY LOGS START HERE ---
    console.log("📦 [Database] Raw response received:", { data, error });

    if (error) {
      console.error("❌ [Database] Supabase returned an error:", error);
      return;
    }

    if (data) {
      // Handle Locations
      if (data.locations) {
        console.log("✅ [Data] Locations found, updating UI/Cache.");
        setLocations(data.locations);
        setLocationCache(profile.home_id, data.locations);
      }

      // Handle Weather
      if (data.weather_snapshots) {
        console.log(
          "✅ [Data] Weather snapshots array found:",
          data.weather_snapshots,
        );

        const snapshots = data.weather_snapshots;
        const freshRawData = Array.isArray(snapshots)
          ? snapshots[0]?.data
          : snapshots?.data;

        if (freshRawData) {
          console.log(
            "✅ [Data] Extracted raw weather JSON, updating UI/Cache.",
          );
          setWeather(extractCurrentWeather(freshRawData));
          sessionStorage.setItem(
            `weather_cache_${profile.home_id}`,
            JSON.stringify({
              data: freshRawData,
              expiresAt: getMidnightTonight(),
            }),
          );
        } else {
          console.warn(
            "⚠️ [Data] The snapshot array is empty! No weather exists yet.",
          );
          setWeather(null);
        }
      } else if (!cachedWeather) {
        console.warn(
          "⚠️ [Data] 'weather_snapshots' key is completely missing.",
        );
        setWeather(null);
      }
    }
  }, [profile?.home_id]);

  const refreshProfile = async () => {
    if (!session?.user) return;

    // 1. Fetch the user's current profile
    const { data: profileData } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("uid", session.user.id)
      .single();

    // 2. THE SAFETY NET: If they have no active home, check for backups!
    if (profileData && !profileData.home_id) {
      console.log(
        "🛡️ [Fallback] No active home detected. Checking for other memberships...",
      );

      const { data: otherMemberships } = await supabase
        .from("home_members")
        .select("home_id")
        .eq("user_id", session.user.id)
        .limit(1);

      if (otherMemberships && otherMemberships.length > 0) {
        const fallbackHomeId = otherMemberships[0].home_id;
        console.log(
          `♻️ [Fallback] Found another home! Auto-switching to: ${fallbackHomeId}`,
        );

        // Auto-update their profile in the database to point to the backup home
        await supabase
          .from("user_profiles")
          .update({ home_id: fallbackHomeId })
          .eq("uid", session.user.id);

        // Update our local variable so the UI doesn't flash the setup screen
        profileData.home_id = fallbackHomeId;
      }
    }

    // 3. Finally, set the profile state
    setProfile(profileData);
  };

  const handleSwitchHome = async (homeId: string) => {
    // Optimistically clear the UI to prevent data leakage
    setWeather(null);
    setLocations([]);

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
      Logger.error(
        "Failed to switch active home",
        err,
        { attemptedHomeId: homeId },
        "Could not switch homes. Please try again.",
      );
    }
  };

  // Real Time Listener Effect
  useEffect(() => {
    if (!profile?.home_id) return;

    const isLocal = import.meta.env.DEV;
    let homeChannel: any = null;

    // The centralized change handler
    const handleDatabaseChange = (payload: any) => {
      const table = payload.table;
      console.log(`🔄 [Logic] Database change detected in: ${table}`);
      if (["locations", "areas", "homes"].includes(table)) {
        console.log("✨ [Logic] Refreshing dashboard data...");
        // KILL THE CACHE so the next fetch gets fresh data
        sessionStorage.removeItem(`locations_cache_${profile.home_id}`);
        fetchDashboardData();
      }
      if (table === "user_profiles" || table === "home_members") {
        console.log("👤 [Logic] Refreshing profile...");
        refreshProfile();
      }
    };

    if (!isLocal) {
      console.log("🌐 [Realtime] Connecting to Cloud Realtime...");
      homeChannel = supabase
        .channel("home-updates")
        .on("postgres_changes", { event: "*", schema: "public" }, (payload) => {
          handleDatabaseChange(payload);
        })
        .subscribe();
    } else {
      console.log(
        "🏠 [Realtime] Local mode: Realtime container disabled. Use simulateUpdate() to test.",
      );
    }

    // Attach simulator to window for manual testing
    window.simulateUpdate = (tableName = "locations") => {
      console.warn(
        `🧪 [Simulation] Manually triggering update for: ${tableName}`,
      );
      handleDatabaseChange({ table: tableName });
    };

    return () => {
      if (homeChannel) supabase.removeChannel(homeChannel);
      delete (window as any).simulateUpdate;
    };
  }, [profile?.home_id, fetchDashboardData]);

  // Auth Effect
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (!session) setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Profile Effect
  useEffect(() => {
    if (session?.user) {
      refreshProfile().then(() => setLoading(false));
    }
  }, [session]);

  // Trigger Dashboard Data Fetch on Home change
  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // ==========================================
  // 2. EARLY RETURNS (LOADING, LOGIN, SETUP)
  // ==========================================
  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-rhozly-bg">
        <Loader2 className="animate-spin text-rhozly-primary" size={40} />
      </div>
    );
  }

  if (!session) return <Auth />;

  if (profile && (!profile.home_id || isAddingHome)) {
    return (
      <HomeSetup
        user={session.user}
        hasExistingHome={!!profile.home_id}
        onCancel={() => setIsAddingHome(false)}
        onHomeCreated={(newId: string) => {
          setProfile({ ...profile, home_id: newId } as any);
          setIsAddingHome(false);
        }}
      />
    );
  }

  // ==========================================
  // 3. THE BODY: RHOZLY DIGITAL ARBORETUM UI
  // ==========================================
  return (
    <Sentry.ErrorBoundary
      fallback={
        <p>An unexpected error occurred. Our team has been notified!</p>
      }
    >
      {/* 🚀 ONLY ONE TOASTER HERE! */}
      <Toaster />

      <div className="min-h-screen bg-rhozly-bg text-rhozly-on-surface font-body flex flex-col relative selection:bg-rhozly-primary/20">
        <div className="fixed top-0 left-1/4 w-96 h-96 bg-rhozly-primary/5 rounded-full blur-3xl pointer-events-none" />
        <div className="fixed bottom-0 right-1/4 w-[30rem] h-[30rem] bg-rhozly-primary-container/5 rounded-full blur-3xl pointer-events-none" />

        <header className="sticky top-0 z-30 bg-rhozly-primary border-b border-rhozly-primary-container px-4 md:px-8 py-4 flex justify-between items-center shadow-md">
          <div className="flex items-center gap-3 font-display font-black text-2xl tracking-tight">
            <button
              onClick={() => setIsNavCollapsed(!isNavCollapsed)}
              className="hidden md:flex text-white hover:bg-white/20 p-2 rounded-xl transition-colors items-center justify-center mr-1"
            >
              <Menu className="w-6 h-6" />
            </button>

            <div className="bg-white p-2 rounded-xl shadow-sm backdrop-blur-sm">
              <img
                src="/images/logo_small_rhozly.png"
                alt="Rhozly"
                className="h-8 w-auto object-contain drop-shadow-sm"
              />
              {/*<Leaf className="w-6 h-6 text-white" />*/}
            </div>
            <span className="text-white uppercase tracking-wider text-xl hidden sm:block">
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
            <div className="text-right hidden sm:block">
              <p className="text-sm font-bold text-white group-hover:text-white/80 transition-colors">
                {profile?.full_name || "Guest"}
              </p>
              <p className="text-[10px] uppercase tracking-widest text-white/60 font-semibold">
                Master Gardener
              </p>
            </div>
            <div className="w-11 h-11 rounded-full bg-white/20 p-[2px] shadow-sm group-hover:shadow-md transition-all backdrop-blur-sm">
              <div className="w-full h-full rounded-full border-2 border-white/30 bg-rhozly-primary-container flex items-center justify-center overflow-hidden">
                <User className="w-5 h-5 text-white" />
              </div>
            </div>
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden relative z-10 w-full">
          <nav
            className={`
          fixed bottom-0 left-0 w-full z-40 bg-rhozly-primary-container border-t border-rhozly-primary/50 pb-safe shadow-[0_-8px_24px_rgba(7,87,55,0.15)]
          md:relative md:border-t-0 md:border-r md:border-rhozly-primary/20 md:bg-rhozly-primary-container md:pb-0 md:shadow-none
          flex md:flex-col justify-around md:justify-start p-3 md:p-6 gap-2 md:gap-3
          transition-all duration-300 ease-in-out
          ${isNavCollapsed ? "md:w-28 md:items-center md:px-4" : "md:w-72"}
        `}
          >
            <NavItem
              icon={<Home />}
              label="Dashboard"
              active={activeTab === "dashboard"}
              onClick={() => {
                setActiveTab("dashboard");
                setSelectedLocationId(null);
              }}
              isCollapsed={isNavCollapsed}
            />
            <NavItem
              icon={<Wrench />}
              label="Location Management"
              active={activeTab === "management"}
              onClick={() => setActiveTab("management")}
              isCollapsed={isNavCollapsed}
            />
          </nav>

          <main className="flex-1 overflow-y-auto p-4 md:p-8 pb-28 md:pb-8 w-full">
            {activeTab === "dashboard" && (
              <div className="w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
                {selectedLocationId ? (
                  <div className="w-full">
                    <LocationPage
                      location={locations.find(
                        (l) => l.id === selectedLocationId,
                      )}
                      onBack={() => setSelectedLocationId(null)}
                    />
                  </div>
                ) : (
                  // Dashboard Grid View
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10">
                    {/* Left Column (Expands to full width if Tasks are hidden) */}
                    <div
                      className={`${dashboardView === "weather" ? "col-span-full" : "lg:col-span-7 xl:col-span-8"} space-y-6 transition-all duration-500 ease-in-out`}
                    >
                      <div className="flex items-center justify-between px-1">
                        <div className="bg-rhozly-primary/5 p-1 rounded-2xl inline-flex">
                          <button
                            onClick={() => setDashboardView("locations")}
                            className={`px-4 py-1.5 rounded-xl font-bold text-sm transition-all duration-300 ${dashboardView === "locations" ? "bg-white text-rhozly-primary shadow-sm" : "text-rhozly-primary/60 hover:text-rhozly-primary"}`}
                          >
                            Overview
                          </button>
                          <button
                            onClick={() => setDashboardView("calendar")}
                            className={`px-4 py-1.5 rounded-xl font-bold text-sm transition-all duration-300 ${dashboardView === "calendar" ? "bg-white text-rhozly-primary shadow-sm" : "text-rhozly-primary/60 hover:text-rhozly-primary"}`}
                          >
                            Calendar
                          </button>
                          <button
                            onClick={() => setDashboardView("weather")}
                            className={`px-4 py-1.5 rounded-xl font-bold text-sm transition-all duration-300 ${dashboardView === "weather" ? "bg-white text-rhozly-primary shadow-sm" : "text-rhozly-primary/60 hover:text-rhozly-primary"}`}
                          >
                            Weather
                          </button>
                        </div>
                        {dashboardView === "locations" &&
                          locations?.length > 0 && (
                            <span className="text-xs font-bold text-rhozly-primary bg-rhozly-primary/10 px-3 py-1 rounded-full hidden sm:block">
                              {locations.length} Active
                            </span>
                          )}
                      </div>

                      {/* Dynamic View Logic */}
                      {dashboardView === "locations" ? (
                        <div className="space-y-5">
                          {/* Weather Banner */}
                          <div className="bg-gradient-to-r from-rhozly-primary to-rhozly-primary-container text-white rounded-3xl p-5 shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-in fade-in duration-500">
                            <div className="flex items-center gap-4">
                              <div className="bg-white/20 p-3 rounded-2xl backdrop-blur-sm">
                                {weather?.Icon ? (
                                  <weather.Icon className="w-8 h-8 text-white" />
                                ) : (
                                  <Cloud className="w-8 h-8 text-white" />
                                )}
                              </div>
                              <div>
                                <p className="font-display font-black text-2xl tracking-tight leading-none mb-1">
                                  {weather
                                    ? `${Math.round(weather.temp)}°C`
                                    : "--°C"}{" "}
                                  <span className="text-lg font-bold text-white/80 ml-1">
                                    {weather?.description || "Loading..."}
                                  </span>
                                </p>
                                <p className="text-xs font-bold text-white/70 uppercase tracking-widest">
                                  Humidity: {weather?.humidity || "--"}% • Wind:{" "}
                                  {weather?.wind || "--"} km/h
                                </p>
                              </div>
                            </div>
                            <button
                              onClick={() => setDashboardView("weather")}
                              className="text-xs font-bold bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl transition-colors whitespace-nowrap border border-white/20"
                            >
                              Full Forecast
                            </button>
                          </div>

                          {/* Location Tiles */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                            {locations?.length > 0 ? (
                              locations.map((loc: any, index: number) => (
                                <LocationTile
                                  key={loc.id}
                                  site={loc}
                                  index={index}
                                  onClick={() => setSelectedLocationId(loc.id)}
                                />
                              ))
                            ) : (
                              <div className="col-span-full p-8 text-center bg-rhozly-surface-lowest rounded-3xl border border-rhozly-outline/30 text-rhozly-on-surface/50 font-bold text-sm">
                                No locations found. Add one in Home Management!
                              </div>
                            )}
                          </div>
                        </div>
                      ) : dashboardView === "calendar" ? (
                        <div className="bg-rhozly-surface-lowest rounded-3xl p-8 shadow-[0_8px_24px_-4px_rgba(26,28,27,0.04)] border border-rhozly-outline/30 flex flex-col items-center justify-center min-h-[300px] text-center animate-in fade-in duration-500">
                          <div className="w-16 h-16 bg-rhozly-primary/10 rounded-2xl flex items-center justify-center mb-4">
                            <Calendar className="w-8 h-8 text-rhozly-primary" />
                          </div>
                          <h3 className="text-xl font-display font-black text-rhozly-primary mb-2">
                            Calendar View
                          </h3>
                          <p className="text-rhozly-on-surface/60 max-w-md text-sm">
                            Your upcoming gardening tasks will appear here.
                          </p>
                        </div>
                      ) : (
                        <div className="bg-rhozly-surface-lowest rounded-3xl p-8 shadow-[0_8px_24px_-4px_rgba(26,28,27,0.04)] border border-rhozly-outline/30 flex flex-col items-center justify-center min-h-[300px] text-center animate-in fade-in duration-500">
                          <div className="w-16 h-16 bg-rhozly-primary/10 rounded-2xl flex items-center justify-center mb-4">
                            <Cloud className="w-8 h-8 text-rhozly-primary" />
                          </div>
                          <h3 className="text-xl font-display font-black text-rhozly-primary mb-2">
                            Weather Forecast
                          </h3>
                          <p className="text-rhozly-on-surface/60 max-w-md text-sm">
                            Detailed predictions for your locations appear here.
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Right Column: Tasks Placeholder (HIDDEN ON WEATHER VIEW) */}
                    {dashboardView !== "weather" && (
                      <div className="lg:col-span-5 xl:col-span-4 space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                        <div className="flex items-center justify-between px-1">
                          <h2 className="font-display font-black text-rhozly-on-surface/60 uppercase tracking-widest text-sm">
                            Daily Tasks
                          </h2>
                        </div>
                        <div className="bg-rhozly-surface-lowest/80 backdrop-blur-sm rounded-3xl p-6 shadow-[0_8px_24px_-4px_rgba(26,28,27,0.05)] border border-rhozly-outline/40 text-center text-sm font-bold text-rhozly-on-surface/50">
                          Task list component goes here
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {activeTab === "management" && (
              <section className="animate-in fade-in slide-in-from-bottom-4 duration-500 h-full">
                {profile?.home_id ? (
                  <LocationManager homeId={profile.home_id} />
                ) : (
                  <div className="w-full h-full border-2 border-dashed border-rhozly-primary/20 rounded-3xl p-10 text-center text-rhozly-primary font-bold">
                    Please select or create a home first.
                  </div>
                )}
              </section>
            )}
          </main>
        </div>
      </div>
    </Sentry.ErrorBoundary>
  );
}

function NavItem({ icon, label, active, onClick, isCollapsed }: any) {
  return (
    <Sentry.ErrorBoundary
      fallback={
        <p>An unexpected error occurred. Our team has been notified!</p>
      }
    >
      <button
        onClick={onClick}
        className={`relative flex flex-col md:flex-row items-center gap-1.5 p-2.5 rounded-2xl transition-all duration-300 overflow-hidden group shrink-0
        ${isCollapsed ? "md:gap-0 md:p-0 md:justify-center w-full md:w-14 md:h-14" : "md:gap-4 md:justify-start md:px-5 md:py-4 w-full"}
        ${active ? "text-rhozly-primary shadow-[0_4px_16px_rgba(0,0,0,0.1)]" : "text-white/60 hover:text-white hover:bg-white/10"}`}
      >
        {active && (
          <>
            <div className="absolute inset-0 bg-white opacity-100" />
            <div
              className={`absolute left-0 top-1/4 bottom-1/4 w-1.5 bg-rhozly-primary-container rounded-r-full z-20 ${isCollapsed ? "hidden" : "hidden md:block"}`}
            />
          </>
        )}
        <div
          className={`relative z-10 flex items-center justify-center transition-transform duration-300 ${active ? "scale-110 md:scale-100" : "group-hover:scale-110 md:group-hover:scale-100"}`}
        >
          {React.cloneElement(icon, { className: "w-5 h-5 md:w-6 md:h-6" })}
        </div>
        <span
          className={`relative z-10 text-[10px] md:text-sm transition-all duration-300 ${active ? "font-black" : "font-bold"} ${isCollapsed ? "md:hidden" : "md:block whitespace-nowrap"}`}
        >
          {label}
        </span>
      </button>
    </Sentry.ErrorBoundary>
  );
}
