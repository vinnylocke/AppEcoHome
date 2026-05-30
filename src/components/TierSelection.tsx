import React, { useState } from "react";
import { supabase } from "../lib/supabase";
import { CheckCircle2, Loader2, Sprout, ChevronDown, ChevronUp } from "lucide-react";
import { TIERS, type TierId, type TierDef } from "../constants/tiers";

interface Props {
  userId: string;
  onComplete: (tier: TierId, aiEnabled: boolean, perenualEnabled: boolean) => void;
}

function TierCard({
  tier,
  selected,
  onSelect,
}: {
  tier: TierDef;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      data-testid={`tier-card-${tier.id}`}
      onClick={onSelect}
      className={`w-full text-left rounded-2xl border-2 p-4 transition-all duration-150 ${
        selected
          ? `${tier.accentBg} ${tier.accentBorder} shadow-sm`
          : "bg-white border-rhozly-outline/15 hover:border-rhozly-outline/40"
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl leading-none mt-0.5">{tier.icon}</span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span className={`text-sm font-black ${selected ? tier.accentText : "text-rhozly-on-surface"}`}>
              {tier.name}
            </span>
            {tier.badge && (
              <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full ${tier.accentBg} ${tier.accentText}`}>
                {tier.badge}
              </span>
            )}
            {tier.id === "sprout" && (
              <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                Free
              </span>
            )}
          </div>
          <p className="text-[11px] font-medium text-rhozly-on-surface/60 leading-snug mb-1">
            {tier.vibe}
          </p>
          <p className={`text-[10px] font-bold leading-snug mb-2 ${selected ? tier.accentText : "text-rhozly-on-surface/40"}`}>
            <span className="uppercase tracking-widest opacity-70">Good for: </span>
            {tier.goodFor}
          </p>
          <ul className="space-y-0.5">
            {tier.features.map((f) => (
              <li key={f} className="flex items-center gap-1.5 text-[11px] font-medium text-rhozly-on-surface/70">
                <span className={`shrink-0 text-[10px] ${selected ? tier.accentText : "text-rhozly-on-surface/30"}`}>✓</span>
                {f}
              </li>
            ))}
          </ul>
        </div>

        <div className={`shrink-0 transition-all ${selected ? "opacity-100" : "opacity-0"}`}>
          <CheckCircle2 size={18} className={tier.accentText} />
        </div>
      </div>
    </button>
  );
}

// Comparison table — feature → tier matrix surfaced at the bottom for the
// "show me everything side by side" persona.
const COMPARISON_FEATURES: Array<{ label: string; sprout: boolean; botanist: boolean; sage: boolean; evergreen: boolean }> = [
  { label: "Plant + task tracking",       sprout: true,  botanist: true,  sage: true,  evergreen: true  },
  { label: "Locations & areas",           sprout: true,  botanist: true,  sage: true,  evergreen: true  },
  { label: "Recurring schedules",         sprout: true,  botanist: true,  sage: true,  evergreen: true  },
  { label: "Garden Layout (2D/3D)",       sprout: true,  botanist: true,  sage: true,  evergreen: true  },
  { label: "Sun Tracker (AR + Year View)",sprout: true,  botanist: true,  sage: true,  evergreen: true  },
  { label: "Community guides",            sprout: true,  botanist: true,  sage: true,  evergreen: true  },
  { label: "10,000+ species database",    sprout: false, botanist: true,  sage: false, evergreen: true  },
  { label: "Plant search (Perenual)",     sprout: false, botanist: true,  sage: false, evergreen: true  },
  { label: "Per-species care schedules",  sprout: false, botanist: true,  sage: false, evergreen: true  },
  { label: "AI plant identification",     sprout: false, botanist: false, sage: true,  evergreen: true  },
  { label: "AI Plant Lens (diagnosis)",   sprout: false, botanist: false, sage: true,  evergreen: true  },
  { label: "AI area scanning",            sprout: false, botanist: false, sage: true,  evergreen: true  },
  { label: "AI optimisation (schedules)", sprout: false, botanist: false, sage: true,  evergreen: true  },
];

export default function TierSelection({ userId, onComplete }: Props) {
  const [selected, setSelected] = useState<TierId | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCompare, setShowCompare] = useState(false);

  async function confirm() {
    if (!selected) return;
    setSaving(true);
    setError(null);

    const tier = TIERS.find((t) => t.id === selected)!;
    const { error: dbError } = await supabase
      .from("user_profiles")
      .update({
        subscription_tier: tier.id,
        ai_enabled: tier.ai_enabled,
        enable_perenual: tier.enable_perenual,
      })
      .eq("uid", userId);

    if (dbError) {
      setError("Failed to save your plan — please try again.");
      setSaving(false);
      return;
    }

    onComplete(tier.id, tier.ai_enabled, tier.enable_perenual);
  }

  return (
    <div className="min-h-screen flex flex-col bg-rhozly-bg">
      {/* Header */}
      <div
        className="px-6 pt-12 pb-8 text-white flex flex-col items-center text-center"
        style={{ background: "linear-gradient(135deg, #2d6a4f 0%, #52b788 100%)" }}
      >
        <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center mb-4">
          <Sprout size={24} className="text-white" />
        </div>
        <h1 className="text-2xl font-black tracking-tight mb-1">Choose your plan</h1>
        <p className="text-sm text-white/70 font-medium max-w-xs">
          Pick the tier that fits your gardening style. You can switch at any time from your account settings.
        </p>
      </div>

      {/* Onboarding step indicator */}
      <div className="flex items-center justify-center gap-2 px-1 pt-4 pb-2">
        <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40">
          <span className="w-1.5 h-1.5 rounded-full bg-rhozly-primary/50 inline-block" />
          Account
        </span>
        <span className="w-6 h-px bg-rhozly-primary/30" />
        <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40">
          <span className="w-1.5 h-1.5 rounded-full bg-rhozly-primary/50 inline-block" />
          Home
        </span>
        <span className="w-6 h-px bg-rhozly-primary/30" />
        <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-rhozly-primary">
          <span className="w-2 h-2 rounded-full bg-rhozly-primary inline-block" />
          Plan
        </span>
      </div>

      {/* Tier cards */}
      <div className="flex-1 px-4 py-4 space-y-3 max-w-lg mx-auto w-full">
        {TIERS.map((tier) => (
          <TierCard
            key={tier.id}
            tier={tier}
            selected={selected === tier.id}
            onSelect={() => setSelected(tier.id)}
          />
        ))}

        {/* Comparison table — collapsed by default */}
        <div className="pt-2">
          <button
            data-testid="tier-compare-toggle"
            onClick={() => setShowCompare((v) => !v)}
            className="w-full flex items-center justify-between gap-2 text-xs font-black text-rhozly-on-surface/55 hover:text-rhozly-on-surface px-3 py-2 rounded-xl border border-rhozly-outline/15 bg-white transition-colors"
          >
            <span className="uppercase tracking-widest">Compare features side-by-side</span>
            {showCompare ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {showCompare && (
            <div className="mt-2 bg-white border border-rhozly-outline/15 rounded-2xl overflow-x-auto">
              <table className="w-full text-[11px]" data-testid="tier-compare-table">
                <thead className="bg-rhozly-surface-low">
                  <tr>
                    <th className="text-left px-3 py-2 font-black text-rhozly-on-surface/55 uppercase tracking-widest">Feature</th>
                    {TIERS.map((t) => (
                      <th key={t.id} className="px-2 py-2 font-black text-center uppercase tracking-widest text-[10px]">
                        {t.icon} {t.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON_FEATURES.map((row, i) => (
                    <tr key={row.label} className={i % 2 === 0 ? "" : "bg-rhozly-surface-low/40"}>
                      <td className="px-3 py-1.5 font-bold text-rhozly-on-surface/75">{row.label}</td>
                      <td className="px-2 py-1.5 text-center">{row.sprout    ? <span className="text-emerald-600">✓</span> : <span className="text-rhozly-on-surface/20">—</span>}</td>
                      <td className="px-2 py-1.5 text-center">{row.botanist  ? <span className="text-blue-600">✓</span>    : <span className="text-rhozly-on-surface/20">—</span>}</td>
                      <td className="px-2 py-1.5 text-center">{row.sage      ? <span className="text-violet-600">✓</span>  : <span className="text-rhozly-on-surface/20">—</span>}</td>
                      <td className="px-2 py-1.5 text-center">{row.evergreen ? <span className="text-rhozly-primary">✓</span> : <span className="text-rhozly-on-surface/20">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 pb-8 max-w-lg mx-auto w-full space-y-3">
        {error && (
          <p className="text-xs text-red-500 font-bold text-center">{error}</p>
        )}
        <button
          data-testid="tier-selection-confirm"
          onClick={confirm}
          disabled={!selected || saving}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-rhozly-primary text-white text-sm font-black disabled:opacity-40 transition-opacity shadow-sm"
        >
          {saving ? (
            <><Loader2 size={16} className="animate-spin" /> Saving…</>
          ) : (
            "Get Started"
          )}
        </button>
        <p className="text-[10px] text-rhozly-on-surface/40 font-bold text-center uppercase tracking-widest">
          No payment required — tiers unlock features only
        </p>
      </div>
    </div>
  );
}
