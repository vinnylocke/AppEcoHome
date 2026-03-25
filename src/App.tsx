import React, { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";
import { User as SupabaseUser } from "@supabase/supabase-js";
import {
  UserProfile,
  InventoryItem,
  GardenTask,
  Plant,
  WeatherData,
  Location,
  WeatherAlert,
} from "./types";
import { Layout } from "./components/Layout";
import { Onboarding } from "./components/Onboarding";
import { GardenDashboard } from "./components/GardenDashboard";
import { CalendarView } from "./components/CalendarView";
import { InventoryManager } from "./components/InventoryManager";
import { PlantDoctor } from "./components/PlantDoctor";
import { WeatherWidget } from "./components/WeatherWidget";
import { LocationManager } from "./components/LocationManager";
import { LocationDetails } from "./components/LocationDetails";
import { GuideView } from "./components/GuideView";
import { TestingPanel } from "./components/TestingPanel";
import { useTaskNotifications } from "./hooks/useTaskNotifications";
import { MOCK_SCENARIOS } from "./config/mockScenarios";
import { getPlantDisplayName } from "./utils/plantUtils";
import { motion, AnimatePresence } from "motion/react";
import {
  LogIn,
  Leaf,
  Loader2,
  Sun,
  Droplets,
  Shovel,
  Calendar,
  Wheat,
  X,
  AlertTriangle,
} from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const WMO_CODE_MAP: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  71: "Slight snow",
  73: "Moderate snow",
  75: "Heavy snow",
  80: "Slight rain showers",
  81: "Moderate rain showers",
  82: "Violent rain showers",
  95: "Thunderstorm",
};

export const SUNLIGHT_OPTIONS: Record<string, { min: number; max: number }> = {
  "Full Sun": { min: 3500, max: 130000 },
  "Partial Sun": { min: 2500, max: 60000 },
  "Indirect Light": { min: 1000, max: 25000 },
  "Partial Shade": { min: 500, max: 10000 },
  "Full Shade": { min: 0, max: 2500 },
};
export const WATER_UNIT_MULTIPLIERS: Record<string, number> = {
  "Every Week": 1,
  "Every Two Weeks": 0.5,
  "Every Month": 0.25,
};
export const SOIL_OPTIONS: Record<string, { min: number; max: number }> = {
  "Very Rich Nutrient Soil": { min: 2400, max: 3200 },
  "Rich Nutrient Soil": { min: 1600, max: 2400 },
  "Low Nutrient Soil": { min: 800, max: 1600 },
  "Very Low Nutrient Soil": { min: 0, max: 800 },
};

export default function App() {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [realInventory, setRealInventory] = useState<InventoryItem[]>([]);
  const [realTasks, setRealTasks] = useState<GardenTask[]>([]);
  const [plants, setPlants] = useState<Plant[]>([]);
  const [realLocations, setRealLocations] = useState<Location[]>([]);
  const [weatherMap, setWeatherMap] = useState<Record<string, WeatherData>>({});
  const [realWeatherAlerts, setRealWeatherAlerts] = useState<WeatherAlert[]>(
    [],
  ); // ✅ Added Alert State
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(
    null,
  );
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [selectedShedItem, setSelectedShedItem] =
    useState<InventoryItem | null>(null);
  const [isEditingCare, setIsEditingCare] = useState(false);
  const [editedCare, setEditedCare] = useState<Plant["careGuide"] | null>(null);

  const [modalTab, setModalTab] = useState<"search" | "inventory">("search");
  const [activeTab, setActiveTab] = useState<
    "dashboard" | "calendar" | "guides"
  >("dashboard");
  const [selectedGuideId, setSelectedGuideId] = useState<string | null>(null);
  const [dismissedAlertIds, setDismissedAlertIds] = useState<Set<string>>(
    new Set(),
  );
  const [loading, setLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [mockUpdateCounter, setMockUpdateCounter] = useState(0);

  const getSunLabelFromLux = (maxLux: number): string => {
    if (maxLux >= 100000) return "Full Sun";
    if (maxLux >= 45000) return "Partial Sun";
    if (maxLux >= 15000) return "Indirect Light";
    if (maxLux >= 5000) return "Partial Shade";
    return "Full Shade";
  };

  const inventory = React.useMemo(() => {
    const activeMocks = MOCK_SCENARIOS.filter((s) => s.enabled);
    const mockInventory = activeMocks.flatMap((s) => s.inventory || []);
    return [...realInventory, ...mockInventory];
  }, [realInventory, mockUpdateCounter]);

  const tasks = React.useMemo(() => {
    const activeMocks = MOCK_SCENARIOS.filter((s) => s.enabled);
    const mockTasks = activeMocks.flatMap((s) => s.tasks || []);
    return [...realTasks, ...mockTasks];
  }, [realTasks, mockUpdateCounter]);

  const locations = React.useMemo(() => {
    const activeMocks = MOCK_SCENARIOS.filter((s) => s.enabled);
    const mockLocations = activeMocks
      .map((s) => s.location)
      .filter((l): l is Location => !!l);
    return [...realLocations, ...mockLocations];
  }, [realLocations, mockUpdateCounter]);

  // ✅ UPDATED: Derive alerts directly from the database state
  const weatherAlerts = React.useMemo(() => {
    return realWeatherAlerts.filter(
      (alert) => !dismissedAlertIds.has(alert.id),
    );
  }, [realWeatherAlerts, dismissedAlertIds]);

  useTaskNotifications(
    tasks,
    userProfile?.notification_interval_hours || 8,
    weatherAlerts,
  );

  const fetchData = async () => {
    if (!user || !userProfile) return;
    const homeId = userProfile.home_id || user.id;

    const [invRes, taskRes, locRes, plantRes, weatherRes, alertsRes] =
      await Promise.all([
        supabase.from("inventory_items").select("*").eq("home_id", homeId),
        supabase.from("tasks").select("*").eq("home_id", homeId),
        supabase.from("locations").select("*").eq("home_id", homeId),
        supabase.from("plants").select("*"),
        supabase.from("weather_snapshots").select("*"),
        supabase.from("weather_alerts").select("*"), // ✅ Fetch the background manager alerts
      ]);

    if (invRes.data)
      setRealInventory(
        invRes.data.map((item: any) => ({
          id: item.id,
          plantId: item.plant_id,
          plantName: item.plant_name,
          status: item.status,
          locationId: item.location_id,
          areaId: item.area_id,
          environment: item.environment,
          isEstablished: item.is_established,
          plantedAt: item.planted_at,
          createdAt: item.created_at,
          logs: item.logs,
          yieldData: item.yield_data,
        })),
      );

    if (taskRes.data)
      setRealTasks(
        taskRes.data.map((task: any) => ({
          id: task.id,
          title: task.title,
          description: task.description || "",
          status: task.status,
          dueDate: task.due_date,
          startDate: task.start_date,
          completedAt: task.completed_at,
          type: task.type,
          plantId: task.plant_id,
          inventoryItemId: task.inventory_item_id,
          isVirtual: task.is_virtual,
        })),
      );

    if (locRes.data)
      setRealLocations(
        locRes.data.map((loc: any) => ({
          id: loc.id,
          name: loc.name,
          address: loc.address,
          lat: loc.lat,
          lng: loc.lng,
          createdAt: loc.created_at,
          areas: loc.areas,
        })),
      );

    if (plantRes.data)
      setPlants(
        plantRes.data.map((p: any) => ({
          id: p.id,
          name: p.name,
          scientificName: p.scientific_name,
          careGuide: p.care_guide,
          isGlobal: p.is_global,
        })),
      );

    // ✅ Map Weather Snapshots
    if (weatherRes.data) {
      const newMap: Record<string, WeatherData> = {};
      weatherRes.data.forEach((snap: any) => {
        const d = snap.data;
        if (!d || !d.current) return;
        newMap[snap.location_id] = {
          temp: d.current.temperature_2m,
          condition: WMO_CODE_MAP[d.current.weather_code] || "Unknown",
          humidity: d.current.relative_humidity_2m,
          rainExpected: d.current.rain > 0 || (d.daily?.rain_sum?.[0] || 0) > 0,
          windSpeed: d.current.wind_speed_10m,
          pressure: d.current.surface_pressure,
          uvMax: d.daily?.uv_index_max?.[0] || 0,
          dewPoint: d.current.dew_point_2m,
          timestamp: new Date(snap.updated_at).getTime(),
          forecast24h:
            d.hourly?.time?.map((t: any, i: number) => ({
              time: t,
              temp: d.hourly.temperature_2m[i],
              code: d.hourly.weather_code[i],
              uv: d.hourly.uv_index[i],
              rain: d.hourly.rain?.[i] || 0, // ✅ Add this
              wind: d.hourly.wind_speed_10m?.[i] || 0, // ✅ Add this
            })) || [],
        } as WeatherData;
      });
      setWeatherMap(newMap);
    }

    // ✅ Map Database Alerts into State
    if (alertsRes.data) {
      setRealWeatherAlerts(
        alertsRes.data.map((a: any) => ({
          id: a.id,
          type: a.type,
          locationName:
            locRes.data?.find((l: any) => l.id === a.location_id)?.name ||
            "Unknown",
          message: a.message,
          date: a.starts_at,
          locationId: a.location_id, // This links the alert to the location filter
        })),
      );
    }
  };

  useEffect(() => {
    if (authReady && user && userProfile) fetchData();
  }, [user, userProfile, authReady]);

  // AUTH & PROFILE
  useEffect(() => {
    if (!supabase) {
      setAuthReady(true);
      setLoading(false);
      return;
    }
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      setUser(session?.user || null);
      if (!session?.user) setUserProfile(null);
      setAuthReady(true);
      setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || !supabase) return;
    const fetchProfile = async () => {
      const { data } = await supabase
        .from("user_profiles")
        .select("*")
        .eq("uid", user.id)
        .single();
      if (data)
        setUserProfile({
          uid: data.uid,
          email: data.email,
          display_name: data.display_name,
          mode: data.mode,
          onboarded: data.onboarded,
          home_id: data.home_id,
          aiEnabled: data.ai_enabled,
        });
    };
    fetchProfile();
  }, [user]);

  const handleRefreshWeather = () => fetchData();

  const handleToggleTask = async (taskId: string, currentStatus: string) => {
    if (!user) return;
    const newStatus = currentStatus === "Completed" ? "Pending" : "Completed";
    await supabase
      .from("tasks")
      .update({
        status: newStatus,
        completed_at:
          newStatus === "Completed" ? new Date().toISOString() : null,
      })
      .eq("id", taskId);
    fetchData();
  };

  const handleDismissAlert = (alertId: string) => {
    setDismissedAlertIds((prev) => {
      const next = new Set(prev);
      next.add(alertId);
      return next;
    });
  };

  const handleLogin = async () => {
    if (isLoggingIn) return;
    setIsLoggingIn(true);
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
  };

  if (!authReady || (user && !userProfile && loading)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <Loader2 className="animate-spin text-emerald-600" size={48} />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-white p-10 rounded-[2.5rem] shadow-2xl text-center">
          <Leaf size={40} className="mx-auto mb-8 text-emerald-600" />
          <h1 className="text-4xl font-bold text-emerald-900 mb-4">EcoHome</h1>
          <button
            onClick={handleLogin}
            className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold"
          >
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  if (!userProfile)
    return (
      <Layout userProfile={userProfile}>
        <Onboarding user={user} onComplete={setUserProfile} />
      </Layout>
    );

  const selectedLocation = locations.find((l) => l.id === selectedLocationId);

  return (
    <Layout userProfile={userProfile}>
      <AnimatePresence>
        {selectedShedItem && (
          <div className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white w-full max-w-md p-8 rounded-3xl shadow-2xl overflow-y-auto max-h-[90vh]"
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">
                  {selectedShedItem.plantName}
                </h2>
                <button onClick={() => setSelectedShedItem(null)}>
                  <X />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-amber-50 rounded-2xl">
                  <Sun className="text-amber-500 mb-2" size={20} />
                  <span className="block text-xs font-bold uppercase">
                    Sunlight
                  </span>
                  <span className="text-sm font-bold">
                    {getSunLabelFromLux(
                      plants.find((p) => p.id === selectedShedItem.plantId)
                        ?.careGuide.maxLightLux || 0,
                    )}
                  </span>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {selectedLocationId && selectedLocation ? (
        <LocationDetails
          userId={user.id}
          location={selectedLocation}
          weather={weatherMap[selectedLocationId] || null}
          inventory={inventory}
          tasks={tasks}
          plants={plants}
          weatherAlerts={weatherAlerts}
          onBack={() => setSelectedLocationId(null)}
          onRefresh={handleRefreshWeather}
          onToggleTask={handleToggleTask}
          onDismissAlert={handleDismissAlert}
        />
      ) : (
        <div className="flex flex-col gap-10">
          <div className="flex gap-4 bg-white p-2 rounded-3xl border border-stone-100 shadow-sm self-start">
            {["dashboard", "calendar", "guides"].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as any)}
                className={cn(
                  "px-6 py-2.5 rounded-2xl text-sm font-bold capitalize",
                  activeTab === tab
                    ? "bg-emerald-600 text-white shadow-lg shadow-emerald-200"
                    : "text-stone-400",
                )}
              >
                {tab}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {activeTab === "dashboard" ? (
              <motion.div
                key="dash"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col gap-10"
              >
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <WeatherWidget
                    locations={locations}
                    weatherMap={weatherMap}
                    onSelectLocation={setSelectedLocationId}
                    onRefresh={handleRefreshWeather}
                    tasks={tasks}
                    inventory={inventory}
                  />
                  <PlantDoctor
                    userId={user.id}
                    userProfile={userProfile}
                    mode={userProfile.mode}
                    homeId={userProfile.home_id || user.id}
                    inventory={inventory}
                  />
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <GardenDashboard
                    userId={user.id}
                    inventory={inventory}
                    tasks={tasks}
                    plants={plants}
                    locations={locations}
                    weatherMap={weatherMap}
                    weatherAlerts={weatherAlerts}
                    onToggleTask={handleToggleTask}
                    onDismissAlert={handleDismissAlert}
                    selectedItem={selectedItem}
                    setSelectedItem={setSelectedItem}
                  />
                  <LocationManager
                    userId={user.id}
                    homeId={userProfile.home_id || user.id}
                    locations={locations}
                  />
                </div>
                <InventoryManager
                  userId={user.id}
                  homeId={userProfile.home_id || user.id}
                  userProfile={userProfile}
                  inventory={inventory}
                  plants={plants}
                  locations={locations}
                  onViewPlantedInstance={setSelectedItem}
                  onSelectShedItem={setSelectedShedItem}
                />
              </motion.div>
            ) : activeTab === "calendar" ? (
              <CalendarView
                key="cal"
                inventory={inventory}
                tasks={tasks}
                plants={plants}
                locations={locations}
                weatherMap={weatherMap}
                onToggleTask={handleToggleTask}
              />
            ) : (
              <GuideView
                key="guide"
                initialGuideId={selectedGuideId}
                onGuideSelected={setSelectedGuideId}
              />
            )}
          </AnimatePresence>
        </div>
      )}
      <TestingPanel
        userId={user?.id}
        tasks={tasks}
        weatherAlerts={weatherAlerts}
      />
    </Layout>
  );
}
