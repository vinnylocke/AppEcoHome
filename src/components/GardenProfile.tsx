import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import HabitQuiz from "./HabitQuiz";
import PlantSwipeDeck from "./PlantSwipeDeck";
import {
  ClipboardList,
  Trash2,
  RefreshCw,
  Loader2,
  ChevronDown,
} from "lucide-react";
import { IconAI, IconDiscover } from "../constants/icons";
import { toast } from "react-hot-toast";
import { Logger } from "../lib/errorHandler";

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
  quiz: "bg-rhozly-tertiary/10 text-rhozly-tertiary",
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
  const [quizError, setQuizError] = useState(false);
  const [quizRetryTick, setQuizRetryTick] = useState(0);
  const [prefs, setPrefs] = useState<Pref[]>([]);
  const [prefsLoading, setPrefsLoading] = useState(true);
  const [showPrefs, setShowPrefs] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [deletingPrefId, setDeletingPrefId] = useState<string | null>(null);
  const [prefsError, setPrefsError] = useState(false);
  const [prefsRetryTick, setPrefsRetryTick] = useState(0);
  const [retakingQuiz, setRetakingQuiz] = useState(false);

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
          setQuizError(true);
        } else {
          setQuizError(false);
          setQuizDone(!!data);
        }
      });
  }, [homeId, userId, quizRetryTick]);

  useEffect(() => {
    if (!homeId) return;
    setPrefsLoading(true);
    setPrefsError(false);
    supabase
      .from("planner_preferences")
      .select("id, entity_type, entity_name, sentiment, source, recorded_at")
      .eq("home_id", homeId)
      .eq("user_id", userId)
      .order("recorded_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          setPrefsError(true);
        } else {
          setPrefs(data || []);
          if (prefsRetryTick > 0) toast.success("Preferences loaded.");
        }
        setPrefsLoading(false);
      });
  }, [homeId, userId, prefsRetryTick]);

  async function handleDeletePref(id: string) {
    const removed = prefs.find((p) => p.id === id);
    setDeletingPrefId(id);
    setPrefs((prev) => prev.filter((p) => p.id !== id));
    const { error } = await supabase
      .from("planner_preferences")
      .delete()
      .eq("id", id);
    setDeletingPrefId(null);
    if (error) {
      if (removed) setPrefs((prev) => [removed, ...prev]);
      toast.error("Failed to remove preference.");
    } else {
      toast.success("Preference removed.");
    }
  }

  async function handleReset() {
    if (!confirmingReset) {
      setConfirmingReset(true);
      toast("Tap again to confirm reset.", { icon: "⚠️", duration: 3000 });
      setTimeout(() => setConfirmingReset(false), 3000);
      return;
    }

    setConfirmingReset(false);
    setResetting(true);
    try {
      const { error: prefsErr } = await supabase
        .from("planner_preferences")
        .delete()
        .eq("home_id", homeId)
        .eq("user_id", userId);
      if (prefsErr) throw prefsErr;

      const { error: quizErr } = await supabase
        .from("home_quiz_completions")
        .delete()
        .eq("home_id", homeId)
        .eq("user_id", userId);
      if (quizErr) throw quizErr;

      setPrefs([]);
      setQuizDone(false);
      setTab("quiz");
      toast.success("Garden profile reset.");
    } catch (err) {
      Logger.error("Failed to reset garden profile", err, {}, "Could not reset profile — please try again.");
    } finally {
      setResetting(false);
    }
  }

  async function handleRetakeQuiz() {
    setRetakingQuiz(true);
    const { error } = await supabase
      .from("home_quiz_completions")
      .delete()
      .eq("home_id", homeId)
      .eq("user_id", userId);
    setRetakingQuiz(false);
    if (error) {
      Logger.error("Failed to reset quiz", error, {}, "Could not reset quiz — please try again.");
    } else {
      setQuizDone(false);
    }
  }

  const positives = prefs.filter((p) => p.sentiment === "positive");
  const negatives = prefs.filter((p) => p.sentiment === "negative");

  return (
    <div className="pb-16">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 data-testid="profile-heading" className="text-3xl font-black font-display text-rhozly-on-surface leading-tight">
            Home Profile
          </h1>
          <p className="text-sm text-rhozly-on-surface/60 mt-0.5">
            Train your recommendations
          </p>
          {quizDone !== null && (
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full ${quizDone ? "bg-rhozly-primary/10 text-rhozly-primary" : "bg-rhozly-outline/15 text-rhozly-on-surface/50"}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${quizDone ? "bg-rhozly-primary" : "bg-rhozly-on-surface/30"}`} />
                Quiz {quizDone ? "done" : "pending"}
              </span>
              {prefs.length > 0 && (
                <span className="inline-flex items-center text-[10px] font-black bg-rhozly-primary/10 text-rhozly-primary px-2.5 py-1 rounded-full uppercase tracking-widest">
                  {prefs.length} {prefs.length === 1 ? "preference" : "preferences"} learned
                </span>
              )}
            </div>
          )}
        </div>
        {(quizDone || prefs.length > 0) && (
          <button
            onClick={handleReset}
            disabled={resetting}
            className="flex items-center gap-1.5 text-xs font-medium min-h-[44px] px-4 rounded-full border border-rhozly-outline/30 text-rhozly-on-surface/50 hover:border-rhozly-error hover:text-rhozly-error transition"
          >
            {resetting ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <RefreshCw size={12} />
            )}
            {confirmingReset ? "Tap again to confirm" : "Reset all"}
          </button>
        )}
      </div>

      {/* Responsive two-column layout on xl */}
      <div className="flex flex-col gap-6 xl:grid xl:grid-cols-[1fr_320px] xl:gap-8 xl:items-start">
      {/* Left column: tabs + content */}
      <div className="flex flex-col gap-6">

      {/* Tabs */}
      <div className="flex rounded-2xl border border-rhozly-outline/20 bg-white overflow-hidden">
        {(
          [
            { id: "quiz", icon: <ClipboardList size={15} />, label: "Garden Quiz" },
            { id: "swipe", icon: <IconDiscover size={15} />, label: "Discover Plants" },
          ] as const
        ).map(({ id, icon, label }) => (
          <button
            key={id}
            data-testid={`profile-tab-${id}`}
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
              <span className="w-1.5 h-1.5 rounded-full bg-rhozly-primary ml-0.5" />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "quiz" && (
        quizDone === null && !quizError ? (
          <div className="flex justify-center py-12">
            <Loader2 size={24} className="animate-spin text-rhozly-primary" />
          </div>
        ) : quizError ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-sm font-bold text-rhozly-on-surface/60">Could not load quiz status.</p>
            <button
              onClick={() => { setQuizError(false); setQuizDone(null); setQuizRetryTick(t => t + 1); }}
              className="text-xs font-black text-rhozly-primary hover:underline"
            >
              Retry
            </button>
          </div>
        ) : quizDone ? (
          <div className="bg-rhozly-primary/10 border border-rhozly-primary/20 rounded-3xl p-6 text-center flex flex-col items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-rhozly-primary/10 flex items-center justify-center">
              <IconAI size={26} className="text-rhozly-primary" />
            </div>
            <div>
              <p className="font-black text-rhozly-on-surface text-lg">
                Quiz complete!
              </p>
              <p className="text-sm text-rhozly-on-surface/60 mt-1">
                Your answers are shaping your recommendations.
              </p>
            </div>
            <div className="flex flex-col items-center gap-2 w-full">
              <button
                onClick={() => setTab("swipe")}
                className="bg-rhozly-primary text-white font-bold px-6 py-3 min-h-[44px] rounded-full hover:opacity-90 transition"
              >
                Discover more plants →
              </button>
              <button
                onClick={handleRetakeQuiz}
                disabled={retakingQuiz}
                className="flex items-center gap-1.5 text-sm font-medium text-rhozly-on-surface/50 hover:text-rhozly-primary min-h-[44px] px-4 transition disabled:opacity-50"
              >
                {retakingQuiz ? <Loader2 size={13} className="animate-spin" /> : null}
                Retake quiz
              </button>
            </div>
          </div>
        ) : (
          <HabitQuiz
            homeId={homeId}
            userId={userId}
            onComplete={() => {
              setQuizDone(true);
              toast.success("Quiz complete! Your preferences have been saved.");
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

      </div>{/* end left column */}

      {/* Right column: Preference summary */}
      <div className="xl:sticky xl:top-8 flex flex-col gap-4">
        {prefsLoading && (
          <div className="border border-rhozly-outline/20 rounded-3xl bg-white overflow-hidden animate-pulse">
            <div className="px-5 py-4 flex items-center justify-between">
              <div className="h-4 w-36 bg-rhozly-surface-low rounded-full" />
            </div>
            <div className="px-5 pb-5 space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-8 bg-rhozly-surface-low rounded-xl" />
              ))}
            </div>
          </div>
        )}
        {!prefsLoading && !prefsError && (
          <div className="border border-rhozly-outline/20 rounded-3xl bg-white overflow-hidden">
            <button
              onClick={() => setShowPrefs((v) => !v)}
              aria-expanded={showPrefs}
              aria-controls="prefs-panel"
              className="w-full flex items-center justify-between px-5 py-4 text-sm font-bold text-rhozly-on-surface hover:bg-rhozly-outline/5 xl:hover:bg-transparent transition xl:cursor-default xl:pointer-events-none"
            >
              <span className="flex items-center gap-2">
                <IconAI size={14} className="text-amber-500" />
                Your garden preferences
                <span className="text-xs font-normal text-rhozly-on-surface/50 ml-1">
                  ({prefs.length})
                </span>
              </span>
              <ChevronDown
                size={16}
                className={`text-rhozly-on-surface/40 transition-transform xl:hidden ${showPrefs ? "rotate-180" : ""}`}
              />
            </button>

            <div id="prefs-panel" className={`px-5 pb-5 flex flex-col gap-4 ${showPrefs ? "block" : "hidden"} xl:block`}>
              {positives.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-rhozly-primary uppercase tracking-widest mb-2">
                    Likes
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {positives.map((p) => (
                      <PrefRow
                        key={p.id}
                        pref={p}
                        deleting={deletingPrefId === p.id}
                        onDelete={() => handleDeletePref(p.id)}
                      />
                    ))}
                  </div>
                </div>
              )}
              {negatives.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-rhozly-error uppercase tracking-widest mb-2">
                    Dislikes
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {negatives.map((p) => (
                      <PrefRow
                        key={p.id}
                        pref={p}
                        deleting={deletingPrefId === p.id}
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
          </div>
        )}
        {prefsError && (
          <div className="border border-rhozly-outline/20 rounded-3xl bg-white p-5 flex items-center justify-between">
            <p className="text-sm font-bold text-rhozly-on-surface/60">Could not load preferences.</p>
            <button
              onClick={() => setPrefsRetryTick((t) => t + 1)}
              className="text-sm font-black text-rhozly-primary hover:underline shrink-0 ml-3"
            >
              Retry
            </button>
          </div>
        )}
      </div>{/* end right column */}

      </div>{/* end grid wrapper */}
    </div>
  );
}

function PrefRow({
  pref,
  deleting,
  onDelete,
}: {
  pref: Pref;
  deleting: boolean;
  onDelete: () => void;
}) {
  const sourceLabel = SOURCE_LABELS[pref.source] ?? pref.source;
  const sourceColour =
    SOURCE_COLOURS[pref.source] ?? "bg-rhozly-surface-low text-rhozly-on-surface/60";

  return (
    <div className="flex items-center gap-2 py-1">
      <span
        className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${sourceColour}`}
      >
        {sourceLabel}
      </span>
      <span className="text-xs text-rhozly-on-surface/70 capitalize">
        {pref.entity_type.replace(/_/g, " ")}
      </span>
      <span className="text-sm font-semibold text-rhozly-on-surface flex-1 truncate">
        {pref.entity_name}
      </span>
      <button
        onClick={onDelete}
        disabled={deleting}
        className="min-w-[44px] min-h-[44px] flex items-center justify-center text-rhozly-on-surface/30 hover:text-rhozly-error transition flex-shrink-0 disabled:opacity-50"
        aria-label="Remove preference"
      >
        {deleting ? (
          <Loader2 size={16} className="animate-spin text-rhozly-on-surface/30" />
        ) : (
          <Trash2 size={16} />
        )}
      </button>
    </div>
  );
}
