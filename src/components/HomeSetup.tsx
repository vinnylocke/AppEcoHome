import React, { useState } from "react";
import { supabase } from "../lib/supabase";
import { Home, Plus, ArrowLeft, X, Key, Loader2 } from "lucide-react";
import { Logger } from "../lib/errorHandler";

type SetupStep = "selection" | "create" | "join";

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
  const [step, setStep] = useState<SetupStep>("selection");
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Create Home State
  const [homeName, setHomeName] = useState("");
  const [postcode, setPostcode] = useState("");

  // Join Home State
  const [homeId, setHomeId] = useState("");

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!homeName.trim() || !postcode.trim()) return;

    setFormError(null);
    setLoading(true);
    try {
      Logger.log("Starting home creation process...");

      // 1. Create the home AND set the address in one single, bulletproof step
      const { data: newHomeId, error } = await supabase.rpc("create_new_home", {
        home_name: homeName.trim(),
        postcode: postcode.trim().toUpperCase(),
      });
      if (error) throw error;

      // 2. Fetch the initial weather for THIS specific home
      const { error: funcError } = await supabase.functions.invoke(
        "sync-weather",
        {
          body: { home_id: newHomeId },
        },
      );

      if (funcError) {
        Logger.warn("Edge Function failed during home creation", funcError);
      }

      // ✨ NEW: Show a beautiful success toast!
      Logger.success("Home created successfully!");

      // 3. Send them to the dashboard
      onHomeCreated(newHomeId);
    } catch (err: any) {
      const message = "We couldn't create your home right now. Please try again.";
      setFormError(message);
      Logger.error(
        "Failed to create new home",
        err,
        { attemptedName: homeName, attemptedPostcode: postcode },
        message,
      );
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!homeId.trim()) return;

    setFormError(null);
    setLoading(true);
    try {
      Logger.log("Starting home join process...");

      // 1. Join the membership table
      const { error: joinError } = await supabase.from("home_members").insert([
        {
          home_id: homeId.trim(),
          user_id: user.id,
          role: "member",
        },
      ]);

      if (joinError) {
        throw new Error("Invalid Home ID or you are already a member.");
      }

      // 2. Set as the active home in the profile
      const { error: profileError } = await supabase
        .from("user_profiles")
        .update({ home_id: homeId.trim() })
        .eq("uid", user.id);

      if (profileError) throw profileError;

      // ✨ NEW: Show a beautiful success toast!
      Logger.success("Successfully joined the home!");

      onHomeCreated(homeId.trim());
    } catch (err: any) {
      const message = err.message || "Could not join this home. Please check the ID.";
      setFormError(message);
      Logger.error(
        "Failed to join home",
        err,
        { attemptedHomeId: homeId },
        message,
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-rhozly-bg flex items-center justify-center p-4">
      <div className="max-w-2xl mx-auto w-full space-y-8 animate-in fade-in duration-500">
        <div className="bg-rhozly-surface-lowest rounded-3xl p-8 shadow-sm border border-rhozly-outline/20">
          {/* Selection Step */}
          {step === "selection" && (
            <div className="space-y-8">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-3xl font-black font-display text-rhozly-on-surface tracking-tight">
                    Add a Home
                  </h2>
                  <p className="text-sm font-bold text-rhozly-on-surface/50 mt-1">
                    Create a new home or join an existing one.
                  </p>
                </div>
                {hasExistingHome && onCancel && (
                  <button
                    onClick={onCancel}
                    className="p-3 text-rhozly-on-surface/40 hover:text-rhozly-on-surface hover:bg-rhozly-surface-low rounded-xl transition-colors"
                  >
                    <X className="w-6 h-6" />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <button
                  onClick={() => setStep("create")}
                  className="flex flex-col items-center justify-center p-8 text-center bg-rhozly-surface-low hover:bg-rhozly-primary/5 border-2 border-transparent hover:border-rhozly-primary/20 rounded-3xl transition-all group focus-visible:ring-2 focus-visible:ring-rhozly-primary focus-visible:ring-offset-2"
                  aria-describedby="create-home-desc"
                >
                  <div className="w-16 h-16 bg-rhozly-primary/10 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <Plus className="w-8 h-8 text-rhozly-primary" />
                  </div>
                  <h3 className="text-xl font-black font-display text-rhozly-on-surface mb-2">
                    Create New Home
                  </h3>
                  <p id="create-home-desc" className="text-sm font-bold text-rhozly-on-surface/50">
                    Start fresh and set up a brand new home for your gardens.
                  </p>
                </button>

                <button
                  onClick={() => setStep("join")}
                  className="flex flex-col items-center justify-center p-8 text-center bg-rhozly-surface-low hover:bg-rhozly-primary/5 border-2 border-transparent hover:border-rhozly-primary/20 rounded-3xl transition-all group focus-visible:ring-2 focus-visible:ring-rhozly-primary focus-visible:ring-offset-2"
                  aria-describedby="join-home-desc"
                >
                  <div className="w-16 h-16 bg-rhozly-primary/10 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <Key className="w-8 h-8 text-rhozly-primary" />
                  </div>
                  <h3 className="text-xl font-black font-display text-rhozly-on-surface mb-2">
                    Join Existing Home
                  </h3>
                  <p id="join-home-desc" className="text-sm font-bold text-rhozly-on-surface/50">
                    Enter a Home ID to join a home someone else has set up.
                  </p>
                </button>
              </div>
            </div>
          )}

          {/* Create Home Step */}
          {step === "create" && (
            <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setStep("selection")}
                  className="p-3 text-rhozly-on-surface/40 hover:text-rhozly-on-surface hover:bg-rhozly-surface-low rounded-xl transition-colors"
                >
                  <ArrowLeft className="w-6 h-6" />
                </button>
                <div>
                  <h2 className="text-3xl font-black font-display text-rhozly-on-surface tracking-tight">
                    Create New Home
                  </h2>
                  <p className="text-sm font-bold text-rhozly-on-surface/50 mt-1">
                    Enter details for your new home.
                  </p>
                </div>
              </div>

              <form onSubmit={handleCreate} className="space-y-6 max-w-md">
                {formError && (
                  <div role="alert" className="flex items-start gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm font-bold text-red-700">
                    <span className="shrink-0 mt-0.5">!</span>
                    <span>{formError}</span>
                  </div>
                )}

                <div className="bg-rhozly-surface-low rounded-2xl p-5 space-y-5">
                  <div className="space-y-2">
                    <label
                      htmlFor="homeName"
                      className="block text-sm font-bold text-rhozly-on-surface"
                    >
                      Home Name
                    </label>
                    <input
                      id="homeName"
                      type="text"
                      required
                      autoFocus
                      value={homeName}
                      onChange={(e) => setHomeName(e.target.value)}
                      className="w-full px-4 py-3 bg-rhozly-surface-lowest border border-rhozly-outline/20 rounded-xl focus:outline-none focus:border-rhozly-primary focus:ring-1 focus:ring-rhozly-primary transition-all font-bold text-rhozly-on-surface"
                      placeholder="e.g. My Summer House"
                    />
                  </div>

                  <div className="space-y-2">
                    <label
                      htmlFor="postcode"
                      className="block text-sm font-bold text-rhozly-on-surface"
                    >
                      Postcode / Zip Code
                    </label>
                    <input
                      id="postcode"
                      type="text"
                      required
                      value={postcode}
                      onChange={(e) => setPostcode(e.target.value)}
                      className="w-full px-4 py-3 bg-rhozly-surface-lowest border border-rhozly-outline/20 rounded-xl focus:outline-none focus:border-rhozly-primary focus:ring-1 focus:ring-rhozly-primary transition-all font-bold text-rhozly-on-surface uppercase"
                      placeholder="e.g. CR3 5ED"
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-rhozly-primary text-white font-bold rounded-xl hover:bg-rhozly-primary/90 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      "Create Home"
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Join Home Step */}
          {step === "join" && (
            <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setStep("selection")}
                  className="p-3 text-rhozly-on-surface/40 hover:text-rhozly-on-surface hover:bg-rhozly-surface-low rounded-xl transition-colors"
                >
                  <ArrowLeft className="w-6 h-6" />
                </button>
                <div>
                  <h2 className="text-3xl font-black font-display text-rhozly-on-surface tracking-tight">
                    Join Existing Home
                  </h2>
                  <p className="text-sm font-bold text-rhozly-on-surface/50 mt-1">
                    Enter the Home ID provided by the owner.
                  </p>
                </div>
              </div>

              <form onSubmit={handleJoin} className="space-y-6 max-w-md">
                {formError && (
                  <div role="alert" className="flex items-start gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm font-bold text-red-700">
                    <span className="shrink-0 mt-0.5">!</span>
                    <span>{formError}</span>
                  </div>
                )}

                <div className="bg-rhozly-surface-low rounded-2xl p-5">
                  <div className="space-y-2">
                    <label
                      htmlFor="homeId"
                      className="block text-sm font-bold text-rhozly-on-surface"
                    >
                      Home ID
                    </label>
                    <input
                      id="homeId"
                      type="text"
                      required
                      autoFocus
                      value={homeId}
                      onChange={(e) => setHomeId(e.target.value)}
                      className="w-full px-4 py-3 bg-rhozly-surface-lowest border border-rhozly-outline/20 rounded-xl focus:outline-none focus:border-rhozly-primary focus:ring-1 focus:ring-rhozly-primary transition-all font-bold text-rhozly-on-surface font-mono uppercase tracking-wider"
                      placeholder="e.g. HOME-1234-ABCD"
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-rhozly-primary text-white font-bold rounded-xl hover:bg-rhozly-primary/90 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      "Join Home"
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
