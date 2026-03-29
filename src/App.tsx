// src/App.tsx
import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";
import { Auth } from "./components/Auth";
import { Loader2 } from "lucide-react";
import type { UserProfile } from "./types";
import { HomeSetup } from "./components/HomeSetup";
import { HomeDropdown } from "./components/HomeDropdown";
import { LocationManager } from "./components/LocationManager";
import { WeatherTile } from "./components/WeatherTile";
import { LocationPage } from "./components/LocationPage";
import { ecoTheme as theme } from "./styles/theme";

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAddingHome, setIsAddingHome] = useState(false);
  const [activeTab, setActiveTab] = useState<"dashboard" | "management">(
    "dashboard",
  );

  const [locations, setLocations] = useState<any[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(
    null,
  );

  const refreshProfile = async () => {
    if (!session?.user) return;
    const { data } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("uid", session.user.id)
      .single();
    setProfile(data);
  };

  const handleSwitchHome = async (homeId: string) => {
    const { error } = await supabase
      .from("user_profiles")
      .update({ home_id: homeId })
      .eq("uid", session.user.id);

    if (!error) {
      setProfile((prev) => (prev ? { ...prev, home_id: homeId } : null));
      setIsAddingHome(false);
      setSelectedLocationId(null); // Reset view if we switch homes
    }
  };

  // 1. Handle Auth Session
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

  // 2. Fetch Profile
  useEffect(() => {
    if (session?.user) {
      refreshProfile().then(() => setLoading(false));
    }
  }, [session]);

  // 3. Fetch Dashboard Data (Locations + Weather)
  useEffect(() => {
    const fetchDashboardData = async () => {
      if (!profile?.home_id) return;

      const { data, error } = await supabase
        .from("locations")
        .select(
          `
          *,
          weather_snapshots ( data )
        `,
        )
        .eq("home_id", profile.home_id);

      if (!error && data) {
        setLocations(data);
      }
    };

    fetchDashboardData();
  }, [profile?.home_id]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-stone-50">
        <Loader2 className="animate-spin text-emerald-600" size={40} />
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
        onHomeCreated={(newId) => {
          setProfile({ ...profile, home_id: newId });
          setIsAddingHome(false);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 font-sans">
      {/* FULL WIDTH HEADER */}
      <header className="p-4 sm:p-6 w-full px-8 mx-auto flex justify-between items-center">
        <div className="flex items-center gap-8">
          <div>
            <h1 className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.3em] mb-1">
              EcoHome
            </h1>
            <HomeDropdown
              currentHomeId={profile?.home_id || null}
              onSelectHome={handleSwitchHome}
              onAddNewHome={() => setIsAddingHome(true)}
              onHomeListChanged={refreshProfile}
            />
          </div>

          <nav className="hidden md:flex bg-stone-100 p-1 rounded-2xl border border-stone-200">
            <button
              onClick={() => setActiveTab("dashboard")}
              className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${
                activeTab === "dashboard"
                  ? "bg-white text-stone-900 shadow-sm"
                  : "text-stone-400 hover:text-stone-600"
              }`}
            >
              Dashboard
            </button>
            <button
              onClick={() => setActiveTab("management")}
              className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${
                activeTab === "management"
                  ? "bg-white text-stone-900 shadow-sm"
                  : "text-stone-400 hover:text-stone-600"
              }`}
            >
              Home Management
            </button>
          </nav>
        </div>

        <button
          onClick={() => supabase.auth.signOut()}
          className="text-xs font-black text-stone-300 hover:text-red-500 uppercase tracking-widest transition-colors"
        >
          Sign Out
        </button>
      </header>

      {/* FULL WIDTH MAIN CONTENT AREA */}
      <main className="w-full mx-auto px-8 sm:px-6 lg:px-8 pt-4 pb-24">
        {activeTab === "dashboard" ? (
          <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* --- INTEGRATED WEATHER TILES LOGIC --- */}
            {selectedLocationId ? (
              // 1. Find the location first
              (() => {
                const activeLoc = locations.find(
                  (l) => l.id === selectedLocationId,
                );

                // 2. If it's not found yet, show a loader or nothing
                if (!activeLoc)
                  return <Loader2 className="animate-spin mx-auto mt-20" />;

                // 3. Only render if we have the data
                return (
                  <LocationPage
                    location={activeLoc}
                    onBack={() => setSelectedLocationId(null)}
                  />
                );
              })()
            ) : (
              <div className="space-y-8">
                {/* Welcome Widget */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="md:col-span-2 bg-white p-8 rounded-[40px] border border-stone-100 flex items-center text-stone-400">
                    <p>
                      Welcome back! Select a location to see the detailed
                      forecast.
                    </p>
                  </div>
                  <div className="bg-emerald-900 rounded-[40px] p-8 text-emerald-50">
                    <h2 className="text-2xl font-black mb-1">Garden Status</h2>
                    <p className="text-emerald-400 text-sm">
                      All systems normal.
                    </p>
                  </div>
                </div>

                {/* Weather Tiles Grid */}
                <div>
                  <h2 className="text-sm font-black text-stone-400 uppercase tracking-widest mb-4 px-2">
                    Your Locations
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {locations.map((loc: any) => (
                      <WeatherTile
                        key={loc.id}
                        site={loc}
                        onClick={() => setSelectedLocationId(loc.id)}
                      />
                    ))}
                    {locations.length === 0 && (
                      <p className="text-stone-400 italic px-2">
                        No locations found. Add one in Home Management!
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>
        ) : (
          <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <LocationManager homeId={profile!.home_id!} />
          </section>
        )}
      </main>

      {/* MOBILE NAVIGATION */}
      <nav className="md:hidden fixed bottom-8 left-1/2 -translate-x-1/2 bg-stone-900/90 backdrop-blur-md px-2 py-2 rounded-3xl flex gap-1 shadow-2xl border border-white/10 z-50">
        <button
          onClick={() => setActiveTab("dashboard")}
          className={`px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === "dashboard" ? "bg-emerald-500 text-white" : "text-stone-500"}`}
        >
          Dash
        </button>
        <button
          onClick={() => setActiveTab("management")}
          className={`px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === "management" ? "bg-emerald-500 text-white" : "text-stone-500"}`}
        >
          Manage
        </button>
      </nav>
    </div>
  );
}
