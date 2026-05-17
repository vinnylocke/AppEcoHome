import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, Circle, ChevronDown, ChevronUp, ChevronRight, X, Sprout } from "lucide-react";
import { supabase } from "../lib/supabase";
import type { OnboardingState } from "../onboarding/types";

interface Props {
  homeId: string;
  userId: string;
  quizCompleted: boolean | null;
  hasLocations: boolean;
  onboardingState: OnboardingState;
  onStateChange: (state: OnboardingState) => void;
}

const DISMISS_KEY = "getting_started_checklist";

export default function GettingStartedChecklist({
  homeId,
  userId,
  quizCompleted,
  hasLocations,
  onboardingState,
  onStateChange,
}: Props) {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [hasPlants, setHasPlants] = useState(false);
  const [hasAssignments, setHasAssignments] = useState(false);
  const [hasBlueprints, setHasBlueprints] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!homeId) return;
    Promise.all([
      supabase
        .from("inventory_items")
        .select("id, area_id")
        .eq("home_id", homeId)
        .limit(50),
      supabase
        .from("task_blueprints")
        .select("id")
        .eq("home_id", homeId)
        .limit(1),
    ]).then(([itemsRes, bpRes]) => {
      const items = itemsRes.data ?? [];
      setHasPlants(items.length > 0);
      setHasAssignments(items.some((i) => i.area_id != null));
      setHasBlueprints((bpRes.data ?? []).length > 0);
      setLoaded(true);
    });
  }, [homeId]);

  if (onboardingState[DISMISS_KEY] === "dismissed") return null;

  const steps = [
    {
      label: "Complete the Garden Quiz",
      done: !!quizCompleted,
      path: "/profile",
      description: "Personalise your plant recommendations and watering schedules",
    },
    {
      label: "Add your first Location",
      done: hasLocations,
      path: "/management",
      description: "e.g. Back Garden, Greenhouse, Balcony",
    },
    {
      label: "Add a plant to your Shed",
      done: hasPlants,
      path: "/shed",
      description: "Search the plant database or add one manually",
    },
    {
      label: "Assign a plant to an area",
      done: hasAssignments,
      path: "/shed",
      description: "Open a plant card and assign it to a location area",
    },
    {
      label: "Create a Task Schedule",
      done: hasBlueprints,
      path: "/schedule",
      description: "Set up recurring reminders — watering, pruning, harvesting",
    },
  ];

  const completedCount = steps.filter((s) => s.done).length;

  // Auto-hide once all steps are done and data is loaded
  if (loaded && completedCount === steps.length) return null;

  const dismiss = async () => {
    const next: OnboardingState = { ...onboardingState, [DISMISS_KEY]: "dismissed" };
    onStateChange(next);
    await supabase
      .from("user_profiles")
      .update({ onboarding_state: next })
      .eq("uid", userId);
  };

  return (
    <div
      data-testid="getting-started-checklist"
      className="bg-gradient-to-br from-rhozly-primary/10 to-rhozly-primary/5 border border-rhozly-primary/15 rounded-3xl overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 pb-3">
        <div className="flex items-center gap-3">
          <div className="bg-rhozly-primary/15 p-2 rounded-xl">
            <Sprout size={16} className="text-rhozly-primary" />
          </div>
          <div>
            <p className="font-black text-sm text-rhozly-on-surface leading-none">
              Getting Started
            </p>
            <p className="text-[11px] text-rhozly-on-surface/50 mt-0.5">
              {completedCount} of {steps.length} steps done
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            data-testid="checklist-collapse-toggle"
            onClick={() => setCollapsed((v) => !v)}
            className="text-rhozly-on-surface/40 hover:text-rhozly-primary transition-colors p-1.5"
            aria-label={collapsed ? "Expand checklist" : "Collapse checklist"}
          >
            {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </button>
          <button
            data-testid="checklist-dismiss"
            onClick={dismiss}
            className="text-rhozly-on-surface/30 hover:text-rhozly-on-surface/60 transition-colors p-1.5"
            aria-label="Skip for now"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-4 pb-3">
        <div className="h-1.5 bg-rhozly-primary/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-rhozly-primary rounded-full transition-all duration-700"
            style={{ width: `${(completedCount / steps.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Steps */}
      {!collapsed && (
        <div className="px-3 pb-3 space-y-0.5">
          {steps.map((step, i) => (
            <button
              key={i}
              data-testid={`checklist-step-${i}`}
              onClick={() => !step.done && navigate(step.path)}
              disabled={step.done}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-left transition-all ${
                step.done
                  ? "opacity-50 cursor-default"
                  : "hover:bg-rhozly-primary/10 cursor-pointer"
              }`}
            >
              {step.done ? (
                <CheckCircle2 size={18} className="text-rhozly-primary shrink-0" />
              ) : (
                <Circle size={18} className="text-rhozly-on-surface/25 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p
                  className={`text-sm font-bold leading-tight ${
                    step.done
                      ? "line-through text-rhozly-on-surface/40"
                      : "text-rhozly-on-surface"
                  }`}
                >
                  {step.label}
                </p>
                {!step.done && (
                  <p className="text-[11px] text-rhozly-on-surface/45 mt-0.5 leading-snug">
                    {step.description}
                  </p>
                )}
              </div>
              {!step.done && (
                <ChevronRight size={14} className="text-rhozly-primary/40 shrink-0" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
