import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  ChevronDown,
  Plus,
  Home as HomeIcon,
  Trash2,
  LogOut,
  UserPlus,
  Copy,
  Check,
} from "lucide-react";

interface HomeWithRole {
  id: string;
  name: string;
  role: "owner" | "member";
}

interface Props {
  currentHomeId: string | null;
  onSelectHome: (homeId: string) => void;
  onAddNewHome: () => void;
  onHomeListChanged: () => void; // Added to tell App.tsx to refresh
}

export const HomeDropdown: React.FC<Props> = ({
  currentHomeId,
  onSelectHome,
  onAddNewHome,
  onHomeListChanged,
}) => {
  const [homes, setHomes] = useState<HomeWithRole[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const fetchUserHomes = async () => {
    const { data, error } = await supabase.from("home_members").select(`
        role,
        homes ( id, name )
      `);

    if (!error && data) {
      const homeList = data.map((item: any) => ({
        ...item.homes,
        role: item.role,
      }));
      setHomes(homeList);
    }
  };

  useEffect(() => {
    fetchUserHomes();
  }, [currentHomeId]);

  const handleAction = async (
    e: React.MouseEvent,
    action: "leave" | "delete",
    homeId: string,
  ) => {
    e.stopPropagation();

    if (!window.confirm("Are you sure?")) return;

    const rpcName = action === "delete" ? "delete_home_entirely" : "leave_home";
    const { error } = await supabase.rpc(rpcName, { home_id_param: homeId });

    if (error) {
      alert(error.message);
    } else {
      // If we were deleting, we might not get an ID back, so we still refresh
      await fetchUserHomes();
      onHomeListChanged(); // This triggers refreshProfile in App.tsx
    }
  };
  const activeHome = homes.find((h) => h.id === currentHomeId);

  return (
    <div className="relative inline-block text-left">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-white border border-stone-200 rounded-2xl shadow-sm hover:bg-stone-50 transition-all text-sm font-bold text-stone-700"
      >
        <HomeIcon size={16} className="text-emerald-500" />
        {activeHome?.name || "Select Home"}
        <ChevronDown
          size={14}
          className={`transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute left-0 mt-2 w-72 bg-white border border-stone-100 rounded-3xl shadow-2xl z-20 overflow-hidden py-2">
            <div className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-stone-400">
              Your Homes
            </div>

            {homes.map((home) => (
              <div
                key={home.id}
                onClick={() => {
                  onSelectHome(home.id);
                  setIsOpen(false);
                }}
                className="group flex items-center justify-between px-4 py-3 hover:bg-stone-50 cursor-pointer transition-colors"
              >
                <span
                  className={`text-sm ${home.id === currentHomeId ? "text-emerald-600 font-bold" : "text-stone-600"}`}
                >
                  {home.name}
                </span>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {home.role === "owner" && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(home.id);
                        alert(
                          `Home ID Copied: ${home.id}\nShare this with your friends!`,
                        );
                      }}
                      className="p-2 text-stone-400 hover:text-emerald-500 hover:bg-emerald-50 rounded-xl transition-all"
                      title="Copy Invite ID"
                    >
                      <UserPlus size={14} />
                    </button>
                  )}
                  <button
                    onClick={(e) => handleAction(e, "leave", home.id)}
                    className="p-2 text-stone-400 hover:text-orange-500 hover:bg-orange-50 rounded-xl transition-all"
                    title="Leave Home"
                  >
                    <LogOut size={14} />
                  </button>

                  {home.role === "owner" && (
                    <button
                      onClick={(e) => handleAction(e, "delete", home.id)}
                      className="p-2 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                      title="Delete Home"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}

            <button
              onClick={() => {
                onAddNewHome();
                setIsOpen(false);
              }}
              className="w-full text-left px-4 py-3 text-sm text-emerald-600 font-bold flex items-center gap-2 hover:bg-emerald-50 border-t border-stone-50 mt-2"
            >
              <Plus size={16} /> New Home
            </button>
          </div>
        </>
      )}
    </div>
  );
};
