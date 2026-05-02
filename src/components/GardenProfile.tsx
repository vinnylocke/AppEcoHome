import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import HabitQuiz from "./HabitQuiz";
import PlantSwipeDeck from "./PlantSwipeDeck";
import {
  Sparkles,
  ClipboardList,
  Heart,
  Trash2,
  RefreshCw,
  Loader2,
  ChevronDown,
} from "lucide-react";
import { toast } from "react-hot-toast";

interface Pref {
  id: string;
  entity_type: string;
  entity_name: string;
  sentiment: "positive" | "negative";
  source: string;
  recorded_at: string;
}

interface Props {
  homeId: string;
  userId: string;
  aiEnabled: boolean;
  perenualEnabled: boolean;
}

const SOURCE_LABELS: Record<string, string> = {
  chat: "Chat",
  quiz: "Quiz",
  swipe: "Swipe",
};

const SOURCE_COLOURS: Record<string, string> = {
  chat: "bg-rhozly-primary/10 text-rhozly-primary",
  quiz: "bg-rhozly-secondary/10 text-rhozly-secondary",
  swipe: "bg-rhozly-outline/20 text-rhozly-on-surface/70",
};

type Tab = "quiz" | "swipe";

export default function GardenProfile({
  homeId,
  userId,
  aiEnabled,
  perenualEnabled,
}: Props) {
  const [tab, setTab] = useState<Tab>("quiz");
  const [quizDone, setQuizDone] = useState<boolean | null>(null);
  const [prefs, setPrefs] = useState<Pref[]>([]);
  const [prefsLoading, setPrefsLoading] = useState(true);
  const [showPrefs, setShowPrefs] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    if (!homeId || !userId) return;

    supabase
      .from("home_quiz_completions")
      .select("id")
      .eq("home_id", homeId)
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          toast.error("Failed to load quiz status.");
          setQuizDone(false);
        } else {
          setQuizDone(!!data);
        }
      });
  }, [homeId, userId]);

  useEffect(() => {
    if (!homeId) return;
    setPrefsLoading(true);
    supabase
      .from("planner_preferences")
      .select("id, entity_type, entity_name, sentiment, source, recorded_at")
      .eq("home_id", homeId)
      .eq("user_id", userId)
      .order("recorded_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          toast.error("Failed to load preferences.");
        }
        setPrefs(data || []);
        setPrefsLoading(false);
      });
  }, [homeId, userId]);

  async function handleDeletePref(id: string) {
    const { error } = await supabase
      .from("planner_preferences")
      .delete()
      .eq("id", id);
    if (error) {
      toast.error("Failed to remove preference.");
    } else {
      setPrefs((prev) => prev.filter((p) => p.id !== id));
      toast.success("Preference removed.");
    }
  }

  async function handleReset() {
    if (
      !window.confirm(
        "This will delete all your garden preferences and allow you to retake the quiz. Are you sure?",
      )
    )
      return;

    setResetting(true);
    try {
      await supabase
        .from("planner_preferences")
        .delete()
        .eq("home_id", homeId)
        .eq("user_id", userId);

      await supabase
        .from("home_quiz_completions")
        .delete()
        .eq("home_id", homeId)
        .eq("user_id", userId);

      setPrefs([]);
      setQuizDone(false);
      setTab("quiz");
      toast.success("Garden profile reset.");
    } catch {
      toast.error("Something went wrong.");
    } finally {
      setResetting(false);
    }
  }

  const positives = prefs.filter((p) => p.sentiment === "positive");
  const negatives = prefs.filter((p) => p.sentiment === "negative");

  return (
    <div className="max-w-lg mx-auto flex flex-col gap-6 pb-16">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-rhozly-on-surface leading-tight">
            Garden Profile
          </h1>
          <p className="text-sm text-rhozly-on-surface/60 mt-0.5">
            Train the AI to understand your taste
          </p>
        </div>
        {(quizDone || prefs.length > 0) && (
          <button
            onClick={handleReset}
            disabled={resetting}
            className="flex items-center gap-1.5 text-xs text-rhozly-on-surface/50 hover:text-red-500 font-medium transition"
          >
            {resetting ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <RefreshCw size={12} />
            )}
            Reset all
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex rounded-2xl border border-rhozly-outline/20 bg-white overflow-hidden">
        {(
          [
            { id: "quiz", icon: <ClipboardList size={15} />, label: "Garden Quiz" },
            { id: "swipe", icon: <Heart size={15} />, label: "Discover Plants" },
          ] as const
        ).map(({ id, icon, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold transition ${
              tab === id
                ? "bg-rhozly-primary text-white"
                : "text-rhozly-on-surface/60 hover:text-rhozly-on-surface"
            }`}
          >
            {icon}
            {label}
            {id === "quiz" && quizDone && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 ml-0.5" />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "quiz" && (
        quizDone === null ? (
          <div className="flex justify-center py-12">
            <Loader2 size={24} className="animate-spin text-rhozly-primary" />
          </div>
        ) : quizDone ? (
          <div className="bg-emerald-50 border border-emerald-200 rounded-3xl p-6 text-center flex flex-col items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center">
              <Sparkles size={26} className="text-emerald-600" />
            </div>
            <div>
              <p className="font-black text-rhozly-on-surface text-lg">
                Quiz complete!
              </p>
              <p className="text-sm text-rhozly-on-surface/60 mt-1">
                Your answers are shaping your recommendations. Retake it anytime by pressing "Reset all".
              </p>
            </div>
            <button
              onClick={() => setTab("swipe")}
              className="bg-rhozly-primary text-white font-bold px-6 py-3 rounded-full hover:opacity-90 transition"
            >
              Discover more plants →
            </button>
          </div>
        ) : (
          <HabitQuiz
            homeId={homeId}
            userId={userId}
            onComplete={() => {
              setQuizDone(true);
              // Refresh prefs after quiz
              supabase
                .from("planner_preferences")
                .select("id, entity_type, entity_name, sentiment, source, recorded_at")
                .eq("home_id", homeId)
                .eq("user_id", userId)
                .order("recorded_at", { ascending: false })
                .then(({ data, error }) => {
                  if (!error) setPrefs(data || []);
                });
            }}
          />
        )
      )}

      {tab === "swipe" && (
        <PlantSwipeDeck
          homeId={homeId}
          userId={userId}
          aiEnabled={aiEnabled}
          perenualEnabled={perenualEnabled}
        />
      )}

      {/* Preference summary — collapsible (always rendered once profile is loaded) */}
      {!prefsLoading && (
        <div className="border border-rhozly-outline/20 rounded-3xl bg-white overflow-hidden">
          <button
            onClick={() => setShowPrefs((v) => !v)}
            className="w-full flex items-center justify-between px-5 py-4 text-sm font-bold text-rhozly-on-surface hover:bg-rhozly-outline/5 transition"
          >
            <span className="flex items-center gap-2">
              <Sparkles size={14} className="text-amber-500" />
              Your garden preferences
              <span className="text-xs font-normal text-rhozly-on-surface/50 ml-1">
                ({prefs.length})
              </span>
            </span>
            <ChevronDown
              size={16}
              className={`text-rhozly-on-surface/40 transition-transform ${showPrefs ? "rotate-180" : ""}`}
            />
          </button>

          {showPrefs && (
            <div className="px-5 pb-5 flex flex-col gap-4">
              {positives.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-emerald-600 uppercase tracking-widest mb-2">
                    Likes
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {positives.map((p) => (
                      <PrefRow
                        key={p.id}
                        pref={p}
                        onDelete={() => handleDeletePref(p.id)}
                      />
                    ))}
                  </div>
                </div>
              )}
              {negatives.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-red-500 uppercase tracking-widest mb-2">
                    Dislikes
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {negatives.map((p) => (
                      <PrefRow
                        key={p.id}
                        pref={p}
                        onDelete={() => handleDeletePref(p.id)}
                      />
                    ))}
                  </div>
                </div>
              )}
              {positives.length === 0 && negatives.length === 0 && (
                <p className="text-sm text-rhozly-on-surface/50 text-center py-4">
                  No preferences yet
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PrefRow({
  pref,
  onDelete,
}: {
  pref: Pref;
  onDelete: () => void;
}) {
  const sourceLabel = SOURCE_LABELS[pref.source] ?? pref.source;
  const sourceColour =
    SOURCE_COLOURS[pref.source] ?? "bg-gray-100 text-gray-600";

  return (
    <div className="flex items-center gap-2 py-1">
      <span
        className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${sourceColour}`}
      >
        {sourceLabel}
      </span>
      <span className="text-xs text-rhozly-on-surface/50 capitalize">
        {pref.entity_type.replace(/_/g, " ")}
      </span>
      <span className="text-sm font-semibold text-rhozly-on-surface flex-1 truncate">
        {pref.entity_name}
      </span>
      <button
        onClick={onDelete}
        className="p-3 -m-3 text-rhozly-on-surface/30 hover:text-red-400 transition flex-shrink-0"
        aria-label="Remove preference"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}
