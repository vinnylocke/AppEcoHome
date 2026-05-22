import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ClipboardList, ArrowRight, X } from "lucide-react";
import { writePlannerPrefill } from "../../lib/plannerPrefill";
import { logEvent, EVENT } from "../../events/registry";

export interface PlanSuggestion {
  headline: string;
  plan_name: string;
  description: string;
  plants_of_interest?: string[];
}

interface Props {
  suggestion: PlanSuggestion;
  /** Closes the chat overlay so the user lands on /planner. */
  onAccept: () => void;
}

/**
 * Inline CTA card the chat AI emits when it detects the user is
 * planning a multi-plant project. Tapping "Create this Plan" stashes
 * the name + description into sessionStorage and routes to the
 * Planner Dashboard, which picks them up to pre-fill the New Plan
 * form. "Not now" dismisses the card locally — the conversation
 * carries on uninterrupted.
 */
export default function PlanSuggestionCard({ suggestion, onAccept }: Props) {
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const handleAccept = () => {
    writePlannerPrefill({
      name: suggestion.plan_name,
      description: suggestion.description,
    });
    logEvent(EVENT.PLANT_DOCTOR_CHAT_PLAN_SUGGESTION_ACCEPTED, {
      plan_name: suggestion.plan_name,
      plants_of_interest_count: suggestion.plants_of_interest?.length ?? 0,
    });
    onAccept();
    navigate("/planner?open=new-plan");
  };

  const handleDismiss = () => {
    setDismissed(true);
    logEvent(EVENT.PLANT_DOCTOR_CHAT_PLAN_SUGGESTION_DISMISSED, {
      plan_name: suggestion.plan_name,
    });
  };

  return (
    <div
      data-testid="chat-plan-suggestion"
      className="mt-2 rounded-2xl border border-rhozly-primary/25 bg-rhozly-primary/[0.06] p-3"
    >
      <div className="flex items-start gap-2.5">
        <div className="shrink-0 w-9 h-9 rounded-xl bg-rhozly-primary/15 text-rhozly-primary flex items-center justify-center">
          <ClipboardList size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-primary mb-0.5">
            Plan suggestion
          </p>
          <p className="text-sm font-black text-rhozly-on-surface leading-snug">
            {suggestion.headline}
          </p>
          <p className="text-[11px] font-bold text-rhozly-on-surface/70 mt-1.5 leading-snug">
            We'll create a Plan called{" "}
            <span className="text-rhozly-on-surface">"{suggestion.plan_name}"</span>
            {suggestion.plants_of_interest && suggestion.plants_of_interest.length > 0 ? (
              <>
                {" "}with{" "}
                <span className="text-rhozly-on-surface">
                  {suggestion.plants_of_interest.slice(0, 3).join(", ")}
                </span>
                {suggestion.plants_of_interest.length > 3 ? " and others" : ""}
                {" "}lined up. You can edit everything before saving.
              </>
            ) : (
              <>. You can edit everything before saving.</>
            )}
          </p>
        </div>
        <button
          type="button"
          data-testid="chat-plan-suggestion-dismiss"
          onClick={handleDismiss}
          aria-label="Dismiss plan suggestion"
          className="shrink-0 w-7 h-7 rounded-lg text-rhozly-on-surface/40 hover:text-rhozly-on-surface/70 hover:bg-rhozly-on-surface/5 flex items-center justify-center"
        >
          <X size={14} />
        </button>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          data-testid="chat-plan-suggestion-accept"
          onClick={handleAccept}
          className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl bg-rhozly-primary text-white text-[11px] font-black uppercase tracking-widest hover:opacity-95 transition"
        >
          Create this Plan
          <ArrowRight size={12} />
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          className="px-3 py-2 min-h-[40px] rounded-xl bg-white border border-rhozly-outline/20 text-rhozly-on-surface/70 text-[11px] font-black uppercase tracking-widest hover:text-rhozly-on-surface"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
