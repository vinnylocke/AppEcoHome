import { Toaster, toast } from "react-hot-toast";
import React, { useEffect, useState, useCallback } from "react";
import { supabase } from "./lib/supabase";
import {
  Cloud,
  Menu,
  Home,
  User,
  Wrench,
  Loader2,
  Sun,
  CloudRain,
  CloudLightning,
  CloudFog,
  CloudDrizzle,
  Database,
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
import WeatherForecast from "./components/WeatherForecast";
import { WeatherAlertBanner } from "./components/WeatherAlertBanner";
import TheShed from "./components/TheShed";
import TaskCalendar from "./components/TaskCalendar";
import TaskList from "./components/TaskList";

// --- WEATHER & CACHE HELPERS ---
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

const getCachedWeatherData = (homeId: string) => {
  const cacheKey = `weather_cache_${homeId}`;
  const cached = sessionStorage.getItem(cacheKey);
  if (!cached) return null;
  const { data, expiresAt } = JSON.parse(cached);
  if (Date.now() > expiresAt) {
    sessionStorage.removeItem(cacheKey);
    return null;
  }
  return data;
};

const extractCurrentWeather = (meteoData: any) => {
  const data = meteoData?.data || meteoData;
  const hourly = data?.hourly;
  const targetTimezone = data?.timezone || "Europe/London";
  if (!hourly) return null;

  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: targetTimezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  });

  const p: Record<string, string> = {};
  formatter.formatToParts(now).forEach((part) => (p[part.type] = part.value));
  const hr = p.hour === "24" ? "00" : p.hour;
  const currentHourTarget = `${p.year}-${p.month}-${p.day}T${hr}:00`;

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

const getCachedLocations = (homeId: string) => {
  const cacheKey = `locations_cache_${homeId}`;
  const cached = sessionStorage.getItem(cacheKey);
  if (!cached) return null;
  const { data, expiresAt } = JSON.parse(cached);
  if (Date.now() > expiresAt) {
    sessionStorage.removeItem(cacheKey);
    return null;
  }
  return data;
};

const setLocationCache = (homeId: string, data: any[]) => {
  const cacheKey = `locations_cache_${homeId}`;
  const payload = { data: data, expiresAt: Date.now() + 60 * 60 * 1000 };
  sessionStorage.setItem(cacheKey, JSON.stringify(payload));
};

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAddingHome, setIsAddingHome] = useState(false);
  const [locations, setLocations] = useState<any[]>([]);
  const [weather, setWeather] = useState<any>(null);
  const [rawWeather, setRawWeather] = useState<any>(null);
  const [alerts, setAlerts] = useState<any[]>([]);

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

  return (
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
            className={`fixed bottom-0 left-0 w-full z-40 bg-rhozly-primary-container border-t border-rhozly-primary/50 md:relative md:border-t-0 md:border-r md:border-rhozly-primary/20 flex md:flex-col justify-around md:justify-start p-3 md:p-6 gap-2 transition-all duration-300 ${isNavCollapsed ? "md:w-28 md:items-center" : "md:w-72"}`}
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
              icon={<Database />}
              label="The Shed"
              active={activeTab === "shed"}
              onClick={() => {
                setActiveTab("shed");
                setSelectedLocationId(null);
              }}
              isCollapsed={isNavCollapsed}
            />
            <NavItem
              icon={<Wrench />}
              label="Location Management"
              active={activeTab === "management"}
              onClick={() => {
                setActiveTab("management");
                setSelectedLocationId(null);
              }}
              isCollapsed={isNavCollapsed}
            />
          </nav>

          <main className="flex-1 overflow-y-auto p-4 md:p-8 pb-28 md:pb-8 w-full">
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
                          {["locations", "calendar", "weather"].map((v) => (
                            <button
                              key={v}
                              onClick={() => setDashboardView(v as any)}
                              className={`px-4 py-1.5 rounded-xl font-bold text-sm transition-all ${dashboardView === v ? "bg-white text-rhozly-primary shadow-sm" : "text-rhozly-primary/60 hover:text-rhozly-primary"}`}
                            >
                              {v.charAt(0).toUpperCase() + v.slice(1)}
                            </button>
                          ))}
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
                                    {weather?.description || "Loading..."}
                                  </span>
                                </p>
                                <p className="text-xs font-bold opacity-70">
                                  Humidity: {weather?.humidity || "--"}% • Wind:{" "}
                                  {weather?.wind || "--"} km/h
                                </p>
                              </div>
                            </div>
                            <button
                              onClick={() => setDashboardView("weather")}
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
                                  onClick={() => setSelectedLocationId(loc.id)}
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
                              onClick={() => setDashboardView("calendar")}
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
          </main>
        </div>
      </div>
    </Sentry.ErrorBoundary>
  );
}

function NavItem({ icon, label, active, onClick, isCollapsed }: any) {
  return (
    <button
      onClick={onClick}
      className={`relative flex flex-col md:flex-row items-center gap-1.5 p-2.5 rounded-2xl transition-all duration-300 overflow-hidden group shrink-0 ${isCollapsed ? "md:w-14 md:h-14 md:justify-center" : "md:gap-4 md:px-5 md:py-4 w-full"} ${active ? "text-rhozly-primary shadow-md" : "text-white/60 hover:text-white hover:bg-white/10"}`}
    >
      {active && <div className="absolute inset-0 bg-white" />}
      <div
        className={`relative z-10 flex items-center justify-center transition-transform ${active ? "scale-110" : "group-hover:scale-110"}`}
      >
        {React.cloneElement(icon, { className: "w-5 h-5 md:w-6 md:h-6" })}
      </div>
      <span
        className={`relative z-10 text-[10px] md:text-sm ${active ? "font-black" : "font-bold"} ${isCollapsed ? "md:hidden" : "md:block"}`}
      >
        {label}
      </span>
    </button>
  );
}
