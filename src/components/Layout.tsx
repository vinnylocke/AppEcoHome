import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Leaf,
  LogOut,
  User,
  X,
  Check,
  ChevronDown,
  Home as HomeIcon,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { UserProfile, Home } from "../types";
import { HomeManager } from "./HomeManager";
import { getHomesForUser, leaveHome } from "../services/homeService";

interface LayoutProps {
  children: React.ReactNode;
  userProfile: UserProfile | null;
}

export const Layout: React.FC<LayoutProps> = ({ children, userProfile }) => {
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [localInterval, setLocalInterval] = useState(
    userProfile?.notificationIntervalHours || 8,
  );
  const [homes, setHomes] = useState<Home[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  useEffect(() => {
    if (userProfile) {
      getHomesForUser(userProfile.uid).then(setHomes);
    }
  }, [userProfile]);

  // Sync local state when profile opens or changes from outside
  React.useEffect(() => {
    if (userProfile?.notificationIntervalHours) {
      setLocalInterval(userProfile.notificationIntervalHours);
    }
  }, [userProfile?.notificationIntervalHours]);

  // Debounce the Supabase update
  React.useEffect(() => {
    if (!userProfile || localInterval === userProfile.notificationIntervalHours)
      return;

    const timeoutId = setTimeout(async () => {
      try {
        const { error } = await supabase
          .from("user_profiles")
          .update({ notificationIntervalHours: localInterval })
          .eq("uid", userProfile.uid);
        if (error) throw error;

        if (
          "Notification" in window &&
          Notification.permission !== "granted" &&
          Notification.permission !== "denied"
        ) {
          Notification.requestPermission();
        }
      } catch (error) {
        console.error("Error updating notification interval:", error);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [localInterval, userProfile]);

  const handleModeChange = async (newMode: "Novice" | "Expert") => {
    if (!userProfile) return;
    try {
      const { error } = await supabase
        .from("user_profiles")
        .update({ mode: newMode })
        .eq("uid", userProfile.uid);
      if (error) throw error;
    } catch (error) {
      console.error("Error updating mode:", error);
    }
  };

  const handleSwitchHome = async (homeId: string | null) => {
    if (!userProfile) return;
    try {
      const { error } = await supabase
        .from("user_profiles")
        .update({ homeId })
        .eq("uid", userProfile.uid);
      if (error) throw error;
      setIsDropdownOpen(false);
    } catch (error) {
      console.error("Error switching home:", error);
    }
  };

  const handleLeaveHome = async (homeId: string) => {
    if (!userProfile) return;
    try {
      await leaveHome(userProfile.uid, homeId);
    } catch (error) {
      console.error(error);
    }
  };

  const currentHome = homes.find((h) => h.id === userProfile?.homeId);

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 font-sans">
      <header className="bg-white border-b border-stone-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white">
                <Leaf size={24} />
              </div>
              <span className="text-xl font-semibold tracking-tight text-emerald-900">
                EcoHome
              </span>
            </div>

            {userProfile && (
              <div className="relative">
                <button
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className="flex items-center gap-2 px-4 py-2 bg-stone-100 rounded-xl text-sm font-medium text-stone-700 hover:bg-stone-200"
                >
                  <HomeIcon size={16} />
                  {currentHome ? currentHome.name : "Select a home"}
                  <ChevronDown size={16} />
                </button>
                {isDropdownOpen && (
                  <div className="absolute top-full left-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-stone-100 p-2 z-50">
                    {homes.map((home) => (
                      <div
                        key={home.id}
                        className="flex items-center justify-between px-4 py-2 text-sm text-stone-700 hover:bg-stone-50 rounded-lg"
                      >
                        <button
                          onClick={() => handleSwitchHome(home.id)}
                          className="flex-grow text-left"
                        >
                          {home.name}
                        </button>
                        <button
                          onClick={() => handleLeaveHome(home.id)}
                          className="text-xs text-red-500 hover:text-red-700"
                        >
                          Leave
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {userProfile && (
            <div className="flex items-center gap-4">
              <button
                onClick={() => setIsProfileModalOpen(true)}
                className="flex flex-col items-end hover:bg-stone-50 p-2 rounded-xl transition-colors text-right"
              >
                <span className="text-sm font-medium">
                  {userProfile.displayName}
                </span>
                <span className="text-xs text-stone-500">
                  {userProfile.mode} Mode
                </span>
              </button>
              <button
                onClick={() => supabase.auth.signOut()}
                className="p-2 hover:bg-stone-100 rounded-full transition-colors text-stone-600"
                title="Logout"
              >
                <LogOut size={20} />
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {children}
        </motion.div>
      </main>

      <AnimatePresence>
        {isProfileModalOpen && userProfile && (
          <div className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto"
            >
              <div className="p-6 border-b border-stone-100 flex items-center justify-between bg-stone-50">
                <h2 className="text-xl font-bold text-stone-900">
                  Profile Settings
                </h2>
                <button
                  onClick={() => setIsProfileModalOpen(false)}
                  className="p-2 text-stone-400 hover:text-stone-600 hover:bg-stone-200 rounded-full transition-all"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="p-6 flex flex-col gap-6">
                <div>
                  <h3 className="text-sm font-bold text-stone-900 mb-4 uppercase tracking-wider">
                    Gardening Experience
                  </h3>
                  <div className="flex flex-col gap-3">
                    <button
                      onClick={() => handleModeChange("Novice")}
                      className={`p-4 rounded-2xl border-2 text-left transition-all flex items-center justify-between ${userProfile.mode === "Novice" ? "border-emerald-500 bg-emerald-50" : "border-stone-100 hover:border-stone-200"}`}
                    >
                      <div>
                        <div
                          className={`font-bold ${userProfile.mode === "Novice" ? "text-emerald-900" : "text-stone-900"}`}
                        >
                          Novice
                        </div>
                        <div
                          className={`text-sm ${userProfile.mode === "Novice" ? "text-emerald-700" : "text-stone-500"}`}
                        >
                          Simple, easy-to-follow advice
                        </div>
                      </div>
                      {userProfile.mode === "Novice" && (
                        <Check className="text-emerald-600" size={20} />
                      )}
                    </button>
                    <button
                      onClick={() => handleModeChange("Expert")}
                      className={`p-4 rounded-2xl border-2 text-left transition-all flex items-center justify-between ${userProfile.mode === "Expert" ? "border-emerald-500 bg-emerald-50" : "border-stone-100 hover:border-stone-200"}`}
                    >
                      <div>
                        <div
                          className={`font-bold ${userProfile.mode === "Expert" ? "text-emerald-900" : "text-stone-900"}`}
                        >
                          Expert
                        </div>
                        <div
                          className={`text-sm ${userProfile.mode === "Expert" ? "text-emerald-700" : "text-stone-500"}`}
                        >
                          Technical details and advanced tips
                        </div>
                      </div>
                      {userProfile.mode === "Expert" && (
                        <Check className="text-emerald-600" size={20} />
                      )}
                    </button>
                  </div>
                </div>
                <div className="pt-6 border-t border-stone-100">
                  <h3 className="text-sm font-bold text-stone-900 mb-4 uppercase tracking-wider">
                    Notifications
                  </h3>
                  <div className="flex flex-col gap-4">
                    <label className="text-sm font-medium text-stone-700 flex justify-between items-center">
                      <span>Remind me about pending tasks every:</span>
                      <span className="font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-lg">
                        {localInterval} hours
                      </span>
                    </label>
                    <input
                      type="range"
                      min="1"
                      max="24"
                      value={localInterval}
                      onChange={(e) =>
                        setLocalInterval(parseInt(e.target.value))
                      }
                      className="w-full accent-emerald-600 h-2 bg-stone-200 rounded-lg appearance-none cursor-pointer"
                    />
                    <p className="text-xs text-stone-500">
                      We'll send you a browser notification if you have
                      incomplete tasks.
                    </p>
                  </div>
                </div>
                <div className="pt-6 border-t border-stone-100">
                  <HomeManager
                    userProfile={userProfile}
                    onHomeUpdated={() => {}}
                  />
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
