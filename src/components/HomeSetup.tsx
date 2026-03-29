import React, { useState } from "react";
import { supabase } from "../lib/supabase";
import { Home, UserPlus, ArrowRight, Loader2, Sparkles, X } from "lucide-react";

interface Props {
  user: { id: string; email?: string };
  onHomeCreated: (homeId: string) => void;
  onCancel?: () => void;
  hasExistingHome: boolean;
}

export const HomeSetup: React.FC<Props> = ({
  user,
  onHomeCreated,
  onCancel,
  hasExistingHome,
}) => {
  const [loading, setLoading] = useState(false);
  const [homeName, setHomeName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [view, setView] = useState<"selection" | "create" | "join">(
    "selection",
  );

  const handleCreateHome = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!homeName.trim()) return;

    setLoading(true);
    try {
      const { data: newHomeId, error } = await supabase.rpc("create_new_home", {
        home_name: homeName,
      });
      if (error) throw error;
      onHomeCreated(newHomeId);
    } catch (err: any) {
      alert(`Setup failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinHome = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode.trim()) return;

    setLoading(true);
    try {
      // 1. Join the membership table
      const { error: joinError } = await supabase.from("home_members").insert([
        {
          home_id: inviteCode.trim(),
          user_id: user.id,
          role: "member",
        },
      ]);

      if (joinError)
        throw new Error("Invalid Home ID or you are already a member.");

      // 2. Set as the active home in the profile
      const { error: profileError } = await supabase
        .from("user_profiles")
        .update({ home_id: inviteCode.trim() })
        .eq("uid", user.id);

      if (profileError) throw profileError;

      onHomeCreated(inviteCode.trim());
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  // --- SELECTION VIEW ---
  if (view === "selection") {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-6 relative">
        {/* Cancel Button: Only shows if user already has a home to go back to */}
        {hasExistingHome && (
          <button
            onClick={onCancel}
            className="absolute top-8 right-8 p-3 bg-white rounded-full shadow-sm text-stone-400 hover:text-stone-900 transition-all"
          >
            <X size={20} />
          </button>
        )}

        <div className="max-w-md w-full text-center">
          <div className="inline-flex p-4 bg-emerald-100 text-emerald-600 rounded-3xl mb-6">
            <Sparkles size={32} />
          </div>
          <h2 className="text-3xl font-black text-stone-900 mb-2">
            Almost there!
          </h2>
          <p className="text-stone-500 mb-8">
            Every great garden needs a home. How would you like to start?
          </p>

          <div className="grid gap-4">
            <button
              onClick={() => setView("create")}
              className="p-6 bg-white border-2 border-transparent hover:border-emerald-500 rounded-3xl shadow-sm text-left transition-all group"
            >
              <Home className="text-emerald-500 mb-2" />
              <h3 className="font-bold text-stone-900">Create a New Home</h3>
              <p className="text-xs text-stone-400">
                Start your own garden from scratch.
              </p>
            </button>

            <button
              onClick={() => setView("join")}
              className="p-6 bg-white border-2 border-transparent hover:border-emerald-500 rounded-3xl shadow-sm text-left transition-all"
            >
              <UserPlus className="text-blue-500 mb-2" />
              <h3 className="font-bold text-stone-900">
                Join an Existing Home
              </h3>
              <p className="text-xs text-stone-400">
                Enter an invite code from a friend.
              </p>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- CREATE / JOIN VIEW ---
  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center p-6 text-stone-900">
      <div className="max-w-sm w-full bg-white p-8 rounded-[40px] shadow-xl border border-stone-100">
        <button
          onClick={() => setView("selection")}
          className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-6 block hover:text-stone-700 transition-colors"
        >
          ← Back to Selection
        </button>

        <h2 className="text-2xl font-black mb-2">
          {view === "create" ? "Name your home" : "Enter invite code"}
        </h2>
        <p className="text-sm text-stone-500 mb-8">
          {view === "create"
            ? "This could be 'The Backyard' or 'Apt 4B Garden'."
            : "Paste the secret code shared with you."}
        </p>

        <form
          onSubmit={view === "create" ? handleCreateHome : handleJoinHome}
          className="space-y-4"
        >
          <input
            required
            autoFocus
            className="w-full px-6 py-4 bg-stone-50 rounded-2xl border-none focus:ring-2 focus:ring-emerald-500 outline-none font-medium placeholder:text-stone-300"
            placeholder={
              view === "create" ? "Home Name" : "Paste Home ID here..."
            }
            value={view === "create" ? homeName : inviteCode}
            onChange={(e) =>
              view === "create"
                ? setHomeName(e.target.value)
                : setInviteCode(e.target.value)
            }
          />
          <button
            disabled={loading}
            className="w-full py-4 bg-stone-900 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-stone-800 transition-all disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="animate-spin" />
            ) : (
              <>
                {view === "create" ? "Create Home" : "Join Home"}{" "}
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
