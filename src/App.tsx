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
import { fetchWeather } from "./services/weather";
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

export default function App() {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [realInventory, setRealInventory] = useState<InventoryItem[]>([]);
  const [realTasks, setRealTasks] = useState<GardenTask[]>([]);
  const [plants, setPlants] = useState<Plant[]>([]);
  const [realLocations, setRealLocations] = useState<Location[]>([]);
  const [weatherMap, setWeatherMap] = useState<Record<string, WeatherData>>({});
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(
    null,
  );
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [selectedShedItem, setSelectedShedItem] =
    useState<InventoryItem | null>(null);
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

  // Compute weather alerts based on locations and weatherMap
  const weatherAlerts: WeatherAlert[] = React.useMemo(() => {
    const alerts: WeatherAlert[] = [];
    locations.forEach((loc) => {
      const weather = weatherMap[loc.id];
      if (!weather) return;

      const processWarnings = (
        warnings: any,
        dayLabel: string,
        dateStr: string,
      ) => {
        if (warnings.wind.active) {
          const { maxSpeed, timePeriod, severity, description } = warnings.wind;
          alerts.push({
            id: `wind-${loc.id}-${dayLabel}`,
            type: "wind",
            locationName: loc.name,
            message: `${severity} Wind Warning (${maxSpeed} km/h) expected ${dayLabel} (${timePeriod}) at ${loc.name}. ${description} Secure loose items and delicate plants!`,
            date: dateStr,
          });
        }

        if (warnings.frost.active) {
          alerts.push({
            id: `frost-${loc.id}-${dayLabel}`,
            type: "frost",
            locationName: loc.name,
            message: `Frost warning ${dayLabel} (${warnings.frost.timePeriod}) at ${loc.name}! Protect young or sensitive plants.`,
            date: dateStr,
          });
        }

        if (warnings.heat.active) {
          alerts.push({
            id: `heat-${loc.id}-${dayLabel}`,
            type: "heat",
            locationName: loc.name,
            message: `Heat wave expected ${dayLabel} (${warnings.heat.timePeriod}) at ${loc.name}. Ensure plants are well-watered and consider providing shade.`,
            date: dateStr,
          });
        }

        if (warnings.rain.active) {
          alerts.push({
            id: `rain-${loc.id}-${dayLabel}`,
            type: "rain",
            locationName: loc.name,
            message: `Rain expected ${dayLabel} (${warnings.rain.timePeriod}) at ${loc.name}. You might not need to water outdoor plants.`,
            date: dateStr,
          });
        }
      };

      const today = new Date().toISOString().split("T")[0];
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];

      if (weather.todayWarnings) {
        processWarnings(weather.todayWarnings, "today", today);
      }
      if (weather.tomorrowWarnings) {
        processWarnings(weather.tomorrowWarnings, "tomorrow", tomorrow);
      }
    });
    return alerts.filter((alert) => !dismissedAlertIds.has(alert.id));
  }, [locations, weatherMap, dismissedAlertIds]);

  useTaskNotifications(
    tasks,
    userProfile?.notification_interval_hours || 8,
    weatherAlerts,
  );

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true);
      setLoading(false);
      return;
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      const supabaseUser = session?.user || null;
      setUser(supabaseUser);
      if (!supabaseUser) {
        setUserProfile(null);
      }
      setAuthReady(true);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || !supabase) return;

    const fetchProfile = async () => {
      const { data, error } = await supabase
        .from("user_profiles")
        .select("*")
        .eq("uid", user.id)
        .single();

      if (data) {
        setUserProfile({
          uid: data.uid,
          email: data.email,
          display_name: data.display_name,
          mode: data.mode,
          onboarded: data.onboarded,
          home_id: data.home_id,
        });
      }
    };

    fetchProfile();

    const channel = supabase
      .channel("public:user_profiles")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_profiles",
          filter: `uid=eq.${user.id}`,
        },
        (payload) => {
          const data = payload.new as any;
          setUserProfile({
            uid: data.uid,
            email: data.email,
            display_name: data.display_name,
            mode: data.mode,
            onboarded: data.onboarded,
            home_id: data.home_id,
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  useEffect(() => {
    if (!user || !userProfile || !supabase) return;

    const homeId = userProfile.home_id || user.id;

    const fetchData = async () => {
      const [invRes, taskRes, locRes, plantRes] = await Promise.all([
        supabase.from("inventory_items").select("*").eq("home_id", homeId),
        supabase.from("tasks").select("*").eq("home_id", homeId),
        supabase.from("locations").select("*").eq("home_id", homeId),
        supabase.from("plants").select("*"),
      ]);

      if (invRes.data)
        setRealInventory(
          invRes.data.map((item) => ({
            id: item.id,
            plantId: item.plant_id,
            plantName: item.plant_name,
            status: item.status,
            locationId: item.location_id,
            locationName: item.location_name,
            areaId: item.area_id,
            areaName: item.area_name,
            plantedAt: item.planted_at,
            createdAt: item.created_at,
            yieldData: item.yield_data,
          })),
        );

      if (taskRes.data)
        setRealTasks(
          taskRes.data.map((task) => ({
            id: task.id,
            title: task.title,
            description: task.description,
            status: task.status,
            dueDate: task.due_date,
            type: task.type,
            plantId: task.plant_id,
            inventoryItemId: task.inventory_item_id,
          })),
        );

      if (locRes.data)
        setRealLocations(
          locRes.data.map((loc) => ({
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
          plantRes.data.map((p) => ({
            id: p.id,
            name: p.name,
            scientificName: p.scientific_name,
            careGuide: p.care_guide,
            isGlobal: p.is_global,
          })),
        );
    };

    fetchData();

    const invChannel = supabase
      .channel("inventory")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "inventory_items",
          filter: `home_id=eq.${homeId}`,
        },
        fetchData,
      )
      .subscribe();
    const taskChannel = supabase
      .channel("tasks")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tasks",
          filter: `home_id=eq.${homeId}`,
        },
        fetchData,
      )
      .subscribe();
    const locChannel = supabase
      .channel("locations")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "locations",
          filter: `home_id=eq.${homeId}`,
        },
        fetchData, // This triggers a re-fetch of all data whenever a location changes
      )
      .subscribe();
    const plantChannel = supabase
      .channel("plants")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "plants" },
        fetchData,
      )
      .subscribe();

    return () => {
      supabase.removeChannel(invChannel);
      supabase.removeChannel(taskChannel);
      supabase.removeChannel(locChannel);
      supabase.removeChannel(plantChannel);
    };
  }, [user, userProfile]);

  useEffect(() => {
    if (!user || !authReady || !locations.length) return;

    const updateWeather = async () => {
      const activeMocks = MOCK_SCENARIOS.filter((s) => s.enabled);
      const globalWeather = activeMocks.find((s) => s.weather)?.weather;

      for (const loc of locations) {
        if (globalWeather) {
          setWeatherMap((prev) => ({ ...prev, [loc.id]: globalWeather }));
        } else {
          const mockScenario = activeMocks.find(
            (s) => s.location?.id === loc.id,
          );
          if (mockScenario && mockScenario.weather) {
            setWeatherMap((prev) => ({
              ...prev,
              [loc.id]: mockScenario.weather!,
            }));
          } else {
            try {
              const data = await fetchWeather(loc.lat, loc.lng);
              setWeatherMap((prev) => ({ ...prev, [loc.id]: data }));
            } catch (err) {
              console.error(`Weather fetch error for ${loc.name}:`, err);
            }
          }
        }
      }
    };

    updateWeather();
  }, [locations, mockUpdateCounter, user, authReady]);

  const handleRefreshWeather = async (locationId?: string) => {
    const locsToUpdate = locationId
      ? locations.filter((l) => l.id === locationId)
      : locations;
    const activeMocks = MOCK_SCENARIOS.filter((s) => s.enabled);

    await Promise.all(
      locsToUpdate.map(async (loc) => {
        try {
          const mockScenario = activeMocks.find(
            (s) => s.location.id === loc.id,
          );
          if (mockScenario) {
            setWeatherMap((prev) => ({
              ...prev,
              [loc.id]: mockScenario.weather,
            }));
          } else {
            const data = await fetchWeather(loc.lat, loc.lng);
            setWeatherMap((prev) => ({ ...prev, [loc.id]: data }));
          }
        } catch (err) {
          console.error(`Weather fetch error for ${loc.name}:`, err);
        }
      }),
    );
  };

  useEffect(() => {
    if (locations.length === 0) return;
    const interval = setInterval(
      () => {
        handleRefreshWeather();
      },
      30 * 60 * 1000,
    );
    return () => clearInterval(interval);
  }, [locations]);

  useEffect(() => {
    const handleNavigateToTab = (e: any) => {
      setActiveTab(e.detail);
      if (e.detail !== "guides") {
        setSelectedGuideId(null);
      }
    };

    const handleNavigateToGuide = (e: any) => {
      setActiveTab("guides");
      setSelectedGuideId(e.detail);
    };

    const handleMockUpdate = () => {
      setMockUpdateCounter((prev) => prev + 1);
    };

    window.addEventListener("navigate-to-tab", handleNavigateToTab);
    window.addEventListener("navigate-to-guide", handleNavigateToGuide);
    window.addEventListener("mock-scenarios-updated", handleMockUpdate);

    return () => {
      window.removeEventListener("navigate-to-tab", handleNavigateToTab);
      window.removeEventListener("navigate-to-guide", handleNavigateToGuide);
      window.removeEventListener("mock-scenarios-updated", handleMockUpdate);
    };
  }, []);

  const handleToggleTask = async (taskId: string, currentStatus: string) => {
    if (!user) return;
    const newStatus = currentStatus === "Completed" ? "Pending" : "Completed";
    try {
      await supabase
        .from("tasks")
        .update({
          status: newStatus,
          completed_at:
            newStatus === "Completed" ? new Date().toISOString() : null,
        })
        .eq("id", taskId);

      // If completing a task, remove any other pending tasks of the same type for the same plant that are due today or earlier
      if (newStatus === "Completed") {
        const completedTask = tasks.find((t) => t.id === taskId);
        if (completedTask) {
          const today = new Date();
          today.setHours(23, 59, 59, 999);

          const duplicateTasks = tasks.filter(
            (t) =>
              t.id !== taskId &&
              t.inventoryItemId === completedTask.inventoryItemId &&
              t.type === completedTask.type &&
              t.status !== "Completed" &&
              new Date(t.dueDate) <= today,
          );

          for (const dup of duplicateTasks) {
            await supabase.from("tasks").delete().eq("id", dup.id);
          }
        }
      }
    } catch (error) {
      console.error("Error toggling task:", error);
    }
  };

  // Auto-complete watering tasks if rain is expected
  useEffect(() => {
    if (!user || tasks.length === 0 || Object.keys(weatherMap).length === 0)
      return;

    const autoUpdateTasks = async () => {
      const now = new Date();
      const todayEnd = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        23,
        59,
        59,
        999,
      );

      // Find pending watering tasks where rain is expected TODAY at their location
      const tasksToComplete = tasks.filter((task) => {
        if (
          task.status !== "Pending" ||
          task.type !== "Watering" ||
          task.isVirtual
        )
          return false;

        // Only auto-complete if due today or overdue
        const dueDate = new Date(task.dueDate);
        if (dueDate > todayEnd) return false;

        const item = inventory.find((i) => i.id === task.inventoryItemId);
        if (!item || !item.locationId) return false;

        // Robust Outdoors check:
        // 1. Explicitly set to Outdoors
        // 2. In an area marked as 'outside'
        // 3. Default to true if Planted and no environment/area info (safe assumption for rain)
        let isOutdoors = item.environment === "Outdoors";
        if (!isOutdoors && item.environment !== "Indoors") {
          if (item.areaId) {
            const loc = locations.find((l) => l.id === item.locationId);
            const area = loc?.areas?.find((a) => a.id === item.areaId);
            if (area?.type === "outside") isOutdoors = true;
          } else {
            // If no area info, assume outdoors for planted items
            isOutdoors = item.status === "Planted";
          }
        }

        if (!isOutdoors) return false;

        const weather = weatherMap[item.locationId];
        // Use today's specific rain warning
        return weather?.todayWarnings?.rain.active;
      });

      if (tasksToComplete.length === 0) return;

      for (const task of tasksToComplete) {
        if (task.id.startsWith("mock-")) continue; // Skip mock tasks for Supabase updates
        try {
          await supabase
            .from("tasks")
            .update({
              status: "Completed",
              completed_at: new Date().toISOString(),
            })
            .eq("id", task.id);
        } catch (error) {
          console.error(`Auto-complete error for task ${task.id}:`, error);
        }
      }
    };

    autoUpdateTasks();
  }, [user, tasks, weatherMap, inventory, locations]);

  // Cleanup effect: remove auto-completion message from existing tasks
  useEffect(() => {
    if (!user || tasks.length === 0) return;

    const cleanupTasks = async () => {
      const tasksWithOldMessage = tasks.filter(
        (task) =>
          !task.isVirtual &&
          task.description?.includes(
            "[Auto-completed: Rain expected at this location]",
          ),
      );

      if (tasksWithOldMessage.length === 0) return;

      for (const task of tasksWithOldMessage) {
        if (task.id.startsWith("mock-")) continue;

        // Remove the message and any preceding double newlines
        const newDescription = task.description
          .replace(
            /\n\n\[Auto-completed: Rain expected at this location\]/g,
            "",
          )
          .replace(/\[Auto-completed: Rain expected at this location\]/g, "");

        try {
          await supabase
            .from("tasks")
            .update({
              description: newDescription.trim(),
            })
            .eq("id", task.id);
        } catch (error) {
          console.error(`Error cleaning up task ${task.id}:`, error);
        }
      }
    };

    cleanupTasks();
  }, [user, tasks.length]);

  const handleDismissAlert = (alertId: string) => {
    setDismissedAlertIds((prev) => {
      const next = new Set(prev);
      next.add(alertId);
      return next;
    });
  };

  const handleLogin = async () => {
    if (!supabase) {
      alert(
        "Supabase is not configured. Please add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your environment variables.",
      );
      return;
    }
    if (isLoggingIn) return;
    setIsLoggingIn(true);
    try {
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin,
        },
      });
    } catch (error: any) {
      console.error("Login error:", error);
    } finally {
      setIsLoggingIn(false);
    }
  };

  if (!supabase) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50 p-4">
        <div className="max-w-md w-full bg-white p-10 rounded-[2.5rem] shadow-2xl border border-red-100 text-center">
          <div className="w-20 h-20 bg-red-100 text-red-600 rounded-3xl flex items-center justify-center mx-auto mb-8">
            <AlertTriangle size={40} />
          </div>
          <h1 className="text-2xl font-bold text-stone-900 mb-4">
            Configuration Missing
          </h1>
          <p className="text-stone-500 mb-8">
            Supabase URL or Anon Key is missing. Please add{" "}
            <code className="bg-stone-100 px-1.5 py-0.5 rounded text-red-600">
              VITE_SUPABASE_URL
            </code>{" "}
            and{" "}
            <code className="bg-stone-100 px-1.5 py-0.5 rounded text-red-600">
              VITE_SUPABASE_ANON_KEY
            </code>{" "}
            to your environment variables in AI Studio settings.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="w-full py-4 bg-stone-900 text-white rounded-2xl font-bold hover:bg-stone-800 transition-all"
          >
            I've added them, reload app
          </button>
        </div>
      </div>
    );
  }

  if (!authReady || (user && !userProfile && loading)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="animate-spin text-emerald-600" size={48} />
          <p className="text-stone-500 font-medium">Loading EcoHome...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white p-10 rounded-[2.5rem] shadow-2xl border border-stone-100 text-center"
        >
          <div className="w-20 h-20 bg-emerald-600 text-white rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-xl shadow-emerald-200">
            <Leaf size={40} />
          </div>
          <h1 className="text-4xl font-bold text-emerald-900 mb-4 tracking-tight">
            EcoHome
          </h1>
          <p className="text-stone-500 mb-10 leading-relaxed">
            Your context-aware, AI-driven gardening companion. Grow smarter, not
            harder.
          </p>
          <button
            onClick={handleLogin}
            className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition-all flex items-center justify-center gap-3 group"
          >
            <LogIn
              size={20}
              className="group-hover:translate-x-1 transition-transform"
            />
            Sign in with Google
          </button>
        </motion.div>
      </div>
    );
  }

  if (!userProfile) {
    return (
      <Layout userProfile={userProfile}>
        <Onboarding user={user} onComplete={setUserProfile} />
      </Layout>
    );
  }

  const selectedLocation = locations.find((l) => l.id === selectedLocationId);

  return (
    <Layout userProfile={userProfile}>
      {selectedShedItem && (
        <div className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="bg-white w-full max-w-md p-8 rounded-3xl shadow-2xl flex flex-col max-h-[90vh]"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-stone-900">
                {plants.find((p) => p.id === selectedShedItem.plantId)?.name ||
                  "Plant Details"}
              </h2>
              <button
                onClick={() => setSelectedShedItem(null)}
                className="p-2 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex items-center gap-2 mb-6 p-1 bg-stone-100 rounded-2xl shrink-0">
              <button
                onClick={() => setModalTab("search")}
                className={cn(
                  "flex-1 py-2 text-xs font-bold rounded-xl transition-all",
                  modalTab === "search"
                    ? "bg-white text-emerald-600 shadow-sm"
                    : "text-stone-500 hover:text-stone-700",
                )}
              >
                Care Guide
              </button>
              <button
                onClick={() => setModalTab("inventory")}
                className={cn(
                  "flex-1 py-2 text-xs font-bold rounded-xl transition-all",
                  modalTab === "inventory"
                    ? "bg-white text-emerald-600 shadow-sm"
                    : "text-stone-500 hover:text-stone-700",
                )}
              >
                Planted Versions
              </button>
            </div>

            {modalTab === "search" ? (
              <div className="space-y-4 overflow-y-auto pr-2 flex-1">
                {(() => {
                  const plant = plants.find(
                    (p) => p.id === selectedShedItem.plantId,
                  );
                  if (!plant)
                    return (
                      <p className="text-sm text-stone-500">
                        Care guide not available.
                      </p>
                    );
                  return (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <div className="p-4 bg-amber-50 rounded-2xl flex flex-col gap-2">
                        <Sun className="text-amber-500" size={20} />
                        <span className="text-xs font-bold text-amber-900 uppercase tracking-wider">
                          Sun
                        </span>
                        <p className="text-sm text-amber-800">
                          {plant.careGuide.sun}
                        </p>
                      </div>
                      <div className="p-4 bg-blue-50 rounded-2xl flex flex-col gap-2">
                        <Droplets className="text-blue-500" size={20} />
                        <span className="text-xs font-bold text-blue-900 uppercase tracking-wider">
                          Water
                        </span>
                        <p className="text-sm text-blue-800">
                          {plant.careGuide.water}
                        </p>
                      </div>
                      <div className="p-4 bg-stone-100 rounded-2xl flex flex-col gap-2">
                        <Shovel className="text-stone-500" size={20} />
                        <span className="text-xs font-bold text-stone-900 uppercase tracking-wider">
                          Soil
                        </span>
                        <p className="text-sm text-stone-800">
                          {plant.careGuide.soil}
                        </p>
                      </div>
                      <div className="p-4 bg-emerald-50 rounded-2xl flex flex-col gap-2">
                        <Calendar className="text-emerald-500" size={20} />
                        <span className="text-xs font-bold text-emerald-900 uppercase tracking-wider">
                          Planting
                        </span>
                        <p className="text-sm text-emerald-800">
                          {plant.careGuide.plantingMonth}
                        </p>
                      </div>
                      {plant.careGuide.harvestMonth && (
                        <div className="p-4 bg-orange-50 rounded-2xl flex flex-col gap-2 col-span-2 sm:col-span-4">
                          <Wheat className="text-orange-500" size={20} />
                          <span className="text-xs font-bold text-orange-900 uppercase tracking-wider">
                            Harvesting
                          </span>
                          <p className="text-sm text-orange-800">
                            {plant.careGuide.harvestMonth}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div className="space-y-3 overflow-y-auto pr-2 flex-1">
                {inventory
                  .filter(
                    (i) =>
                      i.plantId === selectedShedItem.plantId &&
                      i.status === "Planted",
                  )
                  .map((instance) => (
                    <div
                      key={instance.id}
                      className="flex items-center justify-between p-4 bg-stone-50 rounded-2xl border border-stone-100"
                    >
                      <span className="text-sm font-medium text-stone-900">
                        {getPlantDisplayName(instance)}
                      </span>
                      <button
                        onClick={() => {
                          setSelectedShedItem(null);
                          setActiveTab("dashboard");
                          setSelectedItem(instance);
                        }}
                        className="text-xs font-bold text-emerald-600 hover:underline"
                      >
                        View
                      </button>
                    </div>
                  ))}
              </div>
            )}
          </motion.div>
        </div>
      )}
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
          onRefresh={() => handleRefreshWeather(selectedLocationId)}
          onToggleTask={handleToggleTask}
          onDismissAlert={handleDismissAlert}
        />
      ) : (
        <div className="flex flex-col gap-10">
          {/* Tab Navigation */}
          <div className="flex items-center gap-4 bg-white p-2 rounded-3xl border border-stone-100 shadow-sm self-start">
            <button
              onClick={() => setActiveTab("dashboard")}
              className={cn(
                "px-6 py-2.5 rounded-2xl text-sm font-bold transition-all",
                activeTab === "dashboard"
                  ? "bg-emerald-600 text-white shadow-lg shadow-emerald-200"
                  : "text-stone-400 hover:text-stone-600",
              )}
            >
              Dashboard
            </button>
            <button
              onClick={() => setActiveTab("calendar")}
              className={cn(
                "px-6 py-2.5 rounded-2xl text-sm font-bold transition-all",
                activeTab === "calendar"
                  ? "bg-emerald-600 text-white shadow-lg shadow-emerald-200"
                  : "text-stone-400 hover:text-stone-600",
              )}
            >
              Calendar
            </button>
            <button
              onClick={() => setActiveTab("guides")}
              className={cn(
                "px-6 py-2.5 rounded-2xl text-sm font-bold transition-all",
                activeTab === "guides"
                  ? "bg-emerald-600 text-white shadow-lg shadow-emerald-200"
                  : "text-stone-400 hover:text-stone-600",
              )}
            >
              Guides
            </button>
          </div>

          <AnimatePresence mode="wait">
            {activeTab === "dashboard" ? (
              <motion.div
                key="dashboard"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="flex flex-col gap-10"
              >
                {/* Top Section: Weather & AI Doctor */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <WeatherWidget
                    locations={locations}
                    weatherMap={weatherMap}
                    onSelectLocation={setSelectedLocationId}
                    onRefresh={() => handleRefreshWeather()}
                    tasks={tasks}
                    inventory={inventory}
                  />
                  <PlantDoctor
                    mode={userProfile.mode}
                    homeId={userProfile.home_id || user.id}
                    inventory={inventory}
                  />
                </div>

                {/* Middle Section: Dashboard & Tasks */}
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
                  <div className="flex flex-col gap-8">
                    <LocationManager
                      userId={user.id}
                      homeId={userProfile.home_id || user.id}
                      locations={locations}
                    />
                  </div>
                </div>

                {/* Bottom Section: Inventory */}
                <InventoryManager
                  userId={user.id}
                  homeId={userProfile.home_id || user.id}
                  inventory={inventory}
                  plants={plants}
                  locations={locations}
                  onViewPlantedInstance={(instance) => {
                    setSelectedItem(instance);
                    setActiveTab("dashboard");
                  }}
                  onSelectShedItem={setSelectedShedItem}
                />
              </motion.div>
            ) : activeTab === "calendar" ? (
              <motion.div
                key="calendar"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                <CalendarView
                  inventory={inventory}
                  tasks={tasks}
                  plants={plants}
                  locations={locations}
                  weatherMap={weatherMap}
                  onToggleTask={handleToggleTask}
                />
              </motion.div>
            ) : (
              <motion.div
                key="guides"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                <GuideView
                  initialGuideId={selectedGuideId}
                  onGuideSelected={(id) => setSelectedGuideId(id)}
                />
              </motion.div>
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
