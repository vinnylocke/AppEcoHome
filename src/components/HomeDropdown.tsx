import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  ChevronDown,
  Plus,
  Home as HomeIcon,
  Trash2,
  LogOut,
  UserPlus,
  Loader2,
} from "lucide-react";
import { ConfirmModal } from "./ConfirmModal";
import { Logger } from "../lib/errorHandler";

interface HomeWithRole {
  id: string;
  name: string;
  role: "owner" | "member";
}

interface Props {
  currentHomeId: string | null;
  onSelectHome: (homeId: string) => void;
  onAddNewHome: () => void;
  onHomeListChanged: () => void;
}

export const HomeDropdown: React.FC<Props> = ({
  currentHomeId,
  onSelectHome,
  onAddNewHome,
  onHomeListChanged,
}) => {
  const [homes, setHomes] = useState<HomeWithRole[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isFetching, setIsFetching] = useState(false);

  // --- NEW: Unified Modal State ---
  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    type: "leave" | "delete" | null;
    homeId: string | null;
    homeName: string;
  }>({
    isOpen: false,
    type: null,
    homeId: null,
    homeName: "",
  });
  const [isProcessing, setIsProcessing] = useState(false);

  const fetchUserHomes = async () => {
    setIsFetching(true);
    try {
      // 1. Get the current user
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      // 2. ONLY fetch home_members rows that belong to this specific user
      const { data, error } = await supabase
        .from("home_members")
        .select(
          `
          role,
          homes ( id, name )
        `,
        )
        .eq("user_id", session.user.id);

      if (!error && data) {
        // Filter out any potential null homes and map the data
        const homeList = data
          .filter((item) => item.homes)
          .map((item: any) => ({
            ...item.homes,
            role: item.role,
          }));
        setHomes(homeList);
      }
    } finally {
      setIsFetching(false);
    }
  };
  useEffect(() => {
    fetchUserHomes();
  }, [currentHomeId]);

  // --- UPGRADED: Modal Confirmation Handler ---
  const handleConfirmAction = async () => {
    if (!modalConfig.homeId || !modalConfig.type) return;

    setIsProcessing(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      Logger.log(`${modalConfig.type}ing home: ${modalConfig.homeName}`);

      // 1. Call your existing RPCs
      const rpcName =
        modalConfig.type === "delete" ? "delete_home_entirely" : "leave_home";
      const { error } = await supabase.rpc(rpcName, {
        home_id_param: modalConfig.homeId,
      });

      if (error) throw error;

      // 2. Safety Net: If we just left/deleted our ACTIVE home, we need to clear our profile
      // so App.tsx knows to redirect us back to the Setup/Join screen.
      if (currentHomeId === modalConfig.homeId) {
        await supabase
          .from("user_profiles")
          .update({ home_id: null })
          .eq("uid", session.user.id);
      }

      // ✨ UPGRADED: Show a clean success toast!
      Logger.success(
        `Successfully ${modalConfig.type === "delete" ? "deleted" : "left"} ${modalConfig.homeName}`,
      );

      // 3. Clean up UI
      await fetchUserHomes();
      onHomeListChanged(); // Tells App.tsx to refresh Profile
      setModalConfig({ isOpen: false, type: null, homeId: null, homeName: "" });
      setIsOpen(false);
    } catch (error: any) {
      // ✨ UPGRADED: Replaced alert() with a user-friendly toast message
      Logger.error(
        `Failed to ${modalConfig.type} home`,
        error,
        { attemptedHomeId: modalConfig.homeId },
        `Could not ${modalConfig.type} home: ${error.message}`,
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const activeHome = homes.find((h) => h.id === currentHomeId);

  return (
    <div className="relative inline-block text-left w-full sm:w-auto">
      {/* Glassmorphic Top Bar Button */}
      <button
        // e.stopPropagation() stops the App.tsx background from interfering
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className="flex items-center justify-between sm:justify-start gap-2 bg-white/10 hover:bg-white/20 px-3 py-2 md:px-4 md:py-2 rounded-xl transition-colors text-white border border-white/10 w-full"
      >
        <div className="flex items-center gap-2">
          {isFetching ? (
            <Loader2 className="w-4 h-4 animate-spin opacity-70" />
          ) : (
            <HomeIcon className="w-4 h-4 hidden sm:block opacity-70" />
          )}
          <span className="font-bold text-sm">
            {activeHome?.name || "Select Home"}
          </span>
        </div>
        <ChevronDown
          className={`w-4 h-4 transition-transform opacity-70 ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <>
          {/* Clickaway Overlay */}
          <div
            className="fixed inset-0 z-40"
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(false);
            }}
          />

          {/* Dropdown Menu */}
          <div className="absolute top-full left-0 mt-2 w-72 sm:w-80 lg:w-96 bg-white rounded-2xl shadow-xl border border-rhozly-outline/20 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="p-2 lg:p-3">
              <p className="text-[10px] font-black text-rhozly-on-surface/40 uppercase tracking-widest px-3 py-2">
                Your Homes
              </p>

              {isFetching && (
                <div className="space-y-1 px-1 pb-1">
                  {[1, 2].map((i) => (
                    <div
                      key={i}
                      className="h-11 rounded-xl bg-rhozly-surface-low animate-pulse"
                    />
                  ))}
                </div>
              )}

              {!isFetching && homes.length === 0 && (
                <p className="text-sm text-rhozly-on-surface/40 font-bold px-3 py-4 text-center">
                  No homes yet. Create one below.
                </p>
              )}

              {!isFetching && homes.map((home) => (
                <div
                  key={home.id}
                  onClick={() => {
                    onSelectHome(home.id);
                    setIsOpen(false);
                  }}
                  className={`group flex items-center justify-between p-2 rounded-xl cursor-pointer transition-colors ${
                    home.id === currentHomeId
                      ? "bg-rhozly-primary/5"
                      : "hover:bg-rhozly-surface-low"
                  }`}
                >
                  {/* Select Home Label */}
                  <div className="flex-1 min-w-0 text-left px-1 py-1.5 flex items-center gap-2">
                    <div
                      className={`w-2 h-2 flex-shrink-0 rounded-full ${home.id === currentHomeId ? "bg-rhozly-primary" : "bg-transparent"}`}
                    />
                    <span
                      className={`text-sm font-bold truncate ${home.id === currentHomeId ? "text-rhozly-primary" : "text-rhozly-on-surface"}`}
                    >
                      {home.name}
                    </span>
                  </div>

                  {/* Quick Actions (Reveal on Hover) */}
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {home.role === "owner" && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(home.id);
                          Logger.success("Home ID copied to clipboard!");
                        }}
                        className="min-w-[44px] min-h-[44px] flex items-center justify-center text-rhozly-on-surface/40 hover:text-rhozly-primary hover:bg-rhozly-primary/10 rounded-lg transition-colors"
                        title="Copy Invite ID"
                      >
                        <UserPlus className="w-4 h-4" />
                      </button>
                    )}

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setModalConfig({
                          isOpen: true,
                          type: "leave",
                          homeId: home.id,
                          homeName: home.name,
                        });
                      }}
                      className="min-w-[44px] min-h-[44px] flex items-center justify-center text-rhozly-on-surface/40 hover:text-red-500 hover:bg-rhozly-tertiary/60 rounded-lg transition-colors"
                      title="Leave Home"
                    >
                      <LogOut className="w-4 h-4" />
                    </button>

                    {home.role === "owner" && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setModalConfig({
                            isOpen: true,
                            type: "delete",
                            homeId: home.id,
                            homeName: home.name,
                          });
                        }}
                        className="min-w-[44px] min-h-[44px] flex items-center justify-center text-rhozly-on-surface/40 hover:text-red-500 hover:bg-rhozly-tertiary/60 rounded-lg transition-colors"
                        title="Delete Home"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Create New Home Footer */}
            <div className="border-t border-rhozly-outline/10 p-2 bg-rhozly-surface-lowest">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onAddNewHome();
                  setIsOpen(false);
                }}
                className="flex items-center gap-2 w-full p-3 text-sm font-bold text-rhozly-primary hover:bg-rhozly-primary/5 rounded-xl transition-colors"
              >
                <Plus className="w-4 h-4" />
                Create New Home
              </button>
            </div>
          </div>
        </>
      )}

      {/* --- RENDER THE CONFIRM MODAL --- */}
      <ConfirmModal
        isOpen={modalConfig.isOpen}
        isLoading={isProcessing}
        onClose={() => setModalConfig({ ...modalConfig, isOpen: false })}
        onConfirm={handleConfirmAction}
        title={modalConfig.type === "delete" ? "Delete Home" : "Leave Home"}
        description={
          modalConfig.type === "delete"
            ? `Are you absolutely sure you want to permanently delete "${modalConfig.homeName}"? This will erase all locations, areas, and weather data associated with it. This action cannot be undone.`
            : `Are you sure you want to leave "${modalConfig.homeName}"? You will lose access to its dashboard and locations until an owner invites you back.`
        }
        confirmText={
          modalConfig.type === "delete" ? "Delete Home" : "Leave Home"
        }
        isDestructive={true}
      />
    </div>
  );
};
