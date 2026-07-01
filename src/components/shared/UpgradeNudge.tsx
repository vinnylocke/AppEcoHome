import React from "react";
import { Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { FEATURE_LABELS, tiersWithFeature, type Feature } from "../../constants/tierFeatures";
import { getTier } from "../../constants/tiers";

/**
 * Standard locked-state UI shown when a tier lacks a feature. Two forms:
 *  - default: a centred card (route / panel level)
 *  - compact: a slim inline button (in-context, e.g. a toolbar action)
 * Both route to /gardener (account tab houses the plan picker).
 */
export default function UpgradeNudge({ feature, compact = false }: { feature: Feature; compact?: boolean }) {
  const navigate = useNavigate();
  const label = FEATURE_LABELS[feature];
  const paidNames = tiersWithFeature(feature).filter((t) => t !== "sprout").map((t) => getTier(t).name);
  const tierText = paidNames.length ? paidNames[0] : "a paid plan";

  if (compact) {
    return (
      <button
        type="button"
        data-testid={`upgrade-nudge-${feature}`}
        onClick={() => navigate("/gardener?section=plans")}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl border border-dashed border-rhozly-outline/30 text-[11px] font-bold text-rhozly-on-surface/50 hover:bg-rhozly-surface transition-colors"
      >
        <Lock size={12} /> Upgrade to {tierText} to use {label}
      </button>
    );
  }

  return (
    <div
      data-testid={`upgrade-nudge-${feature}`}
      className="max-w-sm mx-auto my-10 text-center bg-white rounded-3xl border border-rhozly-outline/10 p-8 space-y-3"
    >
      <div className="w-12 h-12 mx-auto rounded-2xl bg-rhozly-surface flex items-center justify-center">
        <Lock size={20} className="text-rhozly-on-surface/40" />
      </div>
      <h2 className="text-lg font-black text-rhozly-on-surface">{label} is a {tierText} feature</h2>
      <p className="text-sm font-medium text-rhozly-on-surface/55">
        Upgrade your plan to unlock {label} and more.
      </p>
      <button
        type="button"
        data-testid={`upgrade-nudge-cta-${feature}`}
        onClick={() => navigate("/gardener?section=plans")}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-rhozly-primary text-white text-sm font-black hover:opacity-90 transition-opacity"
      >
        See plans
      </button>
    </div>
  );
}
