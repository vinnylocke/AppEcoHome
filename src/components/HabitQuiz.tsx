import React, { useState } from "react";
import { supabase } from "../lib/supabase";
import { CheckCircle2, ChevronRight, Leaf } from "lucide-react";
import { toast } from "react-hot-toast";

interface QuizOption {
  label: string;
  emoji: string;
  prefs: Array<{
    entity_type: string;
    entity_name: string;
    sentiment: "positive" | "negative";
  }>;
}

interface QuizQuestion {
  id: string;
  title: string;
  subtitle: string;
  multi: boolean;
  options: QuizOption[];
}

const QUESTIONS: QuizQuestion[] = [
  {
    id: "goal",
    title: "What are your garden goals?",
    subtitle: "Pick as many as apply — this helps us personalise your recommendations.",
    multi: true,
    options: [
      {
        label: "Grow my own food",
        emoji: "🥦",
        prefs: [{ entity_type: "aesthetic", entity_name: "Kitchen Garden", sentiment: "positive" }],
      },
      {
        label: "Beautiful blooms",
        emoji: "🌸",
        prefs: [{ entity_type: "aesthetic", entity_name: "Ornamental Garden", sentiment: "positive" }],
      },
      {
        label: "Attract wildlife",
        emoji: "🦋",
        prefs: [{ entity_type: "wildlife", entity_name: "wildlife-friendly", sentiment: "positive" }],
      },
      {
        label: "A calm retreat",
        emoji: "🧘",
        prefs: [{ entity_type: "aesthetic", entity_name: "Relaxation Space", sentiment: "positive" }],
      },
    ],
  },
  {
    id: "time",
    title: "How much time do you spend gardening each week?",
    subtitle: "We'll match you with plants that suit your schedule.",
    multi: false,
    options: [
      {
        label: "Under 1 hour",
        emoji: "⚡",
        prefs: [{ entity_type: "maintenance", entity_name: "low-maintenance", sentiment: "positive" }],
      },
      {
        label: "1–3 hours",
        emoji: "🕐",
        prefs: [{ entity_type: "maintenance", entity_name: "moderate-maintenance", sentiment: "positive" }],
      },
      {
        label: "3–7 hours",
        emoji: "🌱",
        prefs: [{ entity_type: "maintenance", entity_name: "high-maintenance", sentiment: "positive" }],
      },
      {
        label: "7+ hours — I love it!",
        emoji: "🌿",
        prefs: [{ entity_type: "maintenance", entity_name: "intensive-maintenance", sentiment: "positive" }],
      },
    ],
  },
  {
    id: "experience",
    title: "How would you describe your experience?",
    subtitle: "Honest answers get you the best suggestions.",
    multi: false,
    options: [
      {
        label: "Complete beginner",
        emoji: "🌱",
        prefs: [{ entity_type: "difficulty", entity_name: "beginner-friendly", sentiment: "positive" }],
      },
      {
        label: "Getting the hang of it",
        emoji: "🙂",
        prefs: [{ entity_type: "difficulty", entity_name: "intermediate", sentiment: "positive" }],
      },
      {
        label: "Confident gardener",
        emoji: "💪",
        prefs: [{ entity_type: "difficulty", entity_name: "advanced", sentiment: "positive" }],
      },
      {
        label: "I could write the book",
        emoji: "🏆",
        prefs: [{ entity_type: "difficulty", entity_name: "expert", sentiment: "positive" }],
      },
    ],
  },
  {
    id: "wildlife",
    title: "How do you feel about wildlife in your garden?",
    subtitle: "Helps us decide what to avoid or encourage.",
    multi: false,
    options: [
      {
        label: "Bring the bees & butterflies!",
        emoji: "🐝",
        prefs: [{ entity_type: "wildlife", entity_name: "pollinator-friendly", sentiment: "positive" }],
      },
      {
        label: "Some wildlife is fine",
        emoji: "🐛",
        prefs: [],
      },
      {
        label: "I prefer a neat, tidy garden",
        emoji: "✂️",
        prefs: [{ entity_type: "wildlife", entity_name: "wildlife-friendly", sentiment: "negative" }],
      },
    ],
  },
  {
    id: "watering",
    title: "How do you feel about watering?",
    subtitle: "This shapes which plants we highlight for you.",
    multi: false,
    options: [
      {
        label: "Happy to water daily",
        emoji: "💧",
        prefs: [{ entity_type: "water_usage", entity_name: "water-hungry", sentiment: "positive" }],
      },
      {
        label: "Once or twice a week",
        emoji: "🚿",
        prefs: [{ entity_type: "water_usage", entity_name: "moderate-watering", sentiment: "positive" }],
      },
      {
        label: "Minimal watering please",
        emoji: "🏜️",
        prefs: [{ entity_type: "water_usage", entity_name: "drought-tolerant", sentiment: "positive" }],
      },
    ],
  },
  {
    id: "style",
    title: "Which garden style appeals to you most?",
    subtitle: "Pick as many as you like.",
    multi: true,
    options: [
      {
        label: "Cottage Garden",
        emoji: "🌼",
        prefs: [{ entity_type: "aesthetic", entity_name: "Cottage Garden", sentiment: "positive" }],
      },
      {
        label: "Modern & Minimal",
        emoji: "⬜",
        prefs: [{ entity_type: "aesthetic", entity_name: "Modern", sentiment: "positive" }],
      },
      {
        label: "Tropical & Lush",
        emoji: "🌴",
        prefs: [{ entity_type: "aesthetic", entity_name: "Tropical", sentiment: "positive" }],
      },
      {
        label: "Mediterranean",
        emoji: "☀️",
        prefs: [{ entity_type: "aesthetic", entity_name: "Mediterranean", sentiment: "positive" }],
      },
      {
        label: "Wild & Natural",
        emoji: "🌾",
        prefs: [{ entity_type: "aesthetic", entity_name: "Wildlife Garden", sentiment: "positive" }],
      },
      {
        label: "Kitchen / Veg patch",
        emoji: "🍅",
        prefs: [{ entity_type: "aesthetic", entity_name: "Kitchen Garden", sentiment: "positive" }],
      },
    ],
  },
];

interface Props {
  homeId: string;
  userId: string;
  onComplete: () => void;
}

export default function HabitQuiz({ homeId, userId, onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number[]>>({});
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const question = QUESTIONS[step];
  const selected = answers[question.id] ?? [];
  const isLast = step === QUESTIONS.length - 1;

  function toggleOption(idx: number) {
    setAnswers((prev) => {
      const current = prev[question.id] ?? [];
      if (question.multi) {
        return {
          ...prev,
          [question.id]: current.includes(idx)
            ? current.filter((i) => i !== idx)
            : [...current, idx],
        };
      }
      return { ...prev, [question.id]: [idx] };
    });
  }

  function canAdvance() {
    return (answers[question.id] ?? []).length > 0;
  }

  async function handleFinish() {
    setSaving(true);
    try {
      const prefRows: any[] = [];

      for (const q of QUESTIONS) {
        const chosen = answers[q.id] ?? [];
        for (const idx of chosen) {
          const option = q.options[idx];
          for (const pref of option.prefs) {
            prefRows.push({
              home_id: homeId,
              user_id: userId,
              entity_type: pref.entity_type,
              entity_name: pref.entity_name,
              sentiment: pref.sentiment,
              reason: `Quiz: ${q.id} — ${option.label}`,
              source: "quiz",
            });
          }
        }
      }

      const uniquePrefs = prefRows.filter(
        (row, i, arr) =>
          arr.findIndex(
            (r) =>
              r.entity_type === row.entity_type &&
              r.entity_name === row.entity_name &&
              r.sentiment === row.sentiment,
          ) === i,
      );

      // Delete previous quiz answers for this user/home so retaking replaces them cleanly
      await supabase
        .from("planner_preferences")
        .delete()
        .eq("home_id", homeId)
        .eq("user_id", userId)
        .eq("source", "quiz");

      if (uniquePrefs.length > 0) {
        const { error: prefErr } = await supabase
          .from("planner_preferences")
          .insert(uniquePrefs);
        if (prefErr) throw prefErr;
      }

      const { error: compErr } = await supabase
        .from("home_quiz_completions")
        .upsert({ home_id: homeId, user_id: userId }, { onConflict: "home_id,user_id" });
      if (compErr) throw compErr;

      setDone(true);
    } catch (err: any) {
      toast.error("Something went wrong saving your answers. Please try again.");
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-16 text-center">
        <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center">
          <CheckCircle2 size={40} className="text-emerald-600" />
        </div>
        <div>
          <h2 className="text-2xl font-black text-rhozly-on-surface mb-2">
            Your garden profile is set!
          </h2>
          <p className="text-rhozly-on-surface/60 max-w-xs mx-auto">
            We'll use these insights to personalise your recommendations, tasks, and plant suggestions.
          </p>
        </div>
        <button
          onClick={onComplete}
          className="bg-rhozly-primary text-white font-bold px-8 py-3 rounded-full shadow-md hover:opacity-90 transition"
        >
          Let's go
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-lg mx-auto">
      {/* Progress */}
      <div
        className="flex items-center gap-2"
        role="progressbar"
        aria-valuenow={step + 1}
        aria-valuemin={1}
        aria-valuemax={QUESTIONS.length}
        aria-label={`Question ${step + 1} of ${QUESTIONS.length}`}
      >
        {QUESTIONS.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-all ${
              i < step
                ? "bg-rhozly-primary"
                : i === step
                ? "bg-rhozly-primary/50"
                : "bg-rhozly-outline/20"
            }`}
          />
        ))}
      </div>

      {/* Question */}
      <div aria-live="polite">
        <p className="text-xs font-semibold text-rhozly-primary/70 uppercase tracking-widest mb-1">
          Question {step + 1} of {QUESTIONS.length}
        </p>
        <h2 className="text-xl font-black text-rhozly-on-surface leading-snug">
          {question.title}
        </h2>
        <p className="text-sm text-rhozly-on-surface/60 mt-1">{question.subtitle}</p>
      </div>

      {/* Options */}
      <div className={`grid gap-3 ${question.options.length > 4 ? "grid-cols-2" : "grid-cols-1"}`}>
        {question.options.map((opt, idx) => {
          const isSelected = selected.includes(idx);
          return (
            <button
              key={idx}
              onClick={() => toggleOption(idx)}
              className={`flex items-center gap-3 p-4 rounded-2xl border-2 text-left transition-all font-medium focus-visible:ring-2 focus-visible:ring-rhozly-primary focus-visible:ring-offset-2 ${
                isSelected
                  ? "border-rhozly-primary bg-rhozly-primary/8 text-rhozly-primary"
                  : "border-rhozly-outline/20 bg-white text-rhozly-on-surface hover:border-rhozly-primary/40 hover:bg-rhozly-primary/4"
              }`}
            >
              <span className="text-2xl leading-none">{opt.emoji}</span>
              <span className="text-sm font-semibold leading-tight">{opt.label}</span>
              {isSelected && (
                <CheckCircle2 size={16} className="ml-auto text-rhozly-primary flex-shrink-0" />
              )}
            </button>
          );
        })}
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        {step > 0 && (
          <button
            onClick={() => setStep((s) => s - 1)}
            className="px-6 py-3 rounded-full border border-rhozly-outline/30 text-rhozly-on-surface/70 font-semibold hover:bg-rhozly-outline/10 transition"
          >
            Back
          </button>
        )}
        {isLast ? (
          <button
            disabled={!canAdvance() || saving}
            onClick={handleFinish}
            className="flex-1 flex items-center justify-center gap-2 bg-rhozly-primary text-white font-bold px-6 py-3 rounded-full shadow-md hover:opacity-90 transition disabled:opacity-40"
          >
            {saving ? (
              <Leaf size={16} className="animate-spin" />
            ) : (
              <>
                <span>Finish</span>
                <CheckCircle2 size={16} />
              </>
            )}
          </button>
        ) : (
          <button
            disabled={!canAdvance()}
            onClick={() => setStep((s) => s + 1)}
            className="flex-1 flex items-center justify-center gap-2 bg-rhozly-primary text-white font-bold px-6 py-3 rounded-full shadow-md hover:opacity-90 transition disabled:opacity-40"
          >
            <span>Next</span>
            <ChevronRight size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
