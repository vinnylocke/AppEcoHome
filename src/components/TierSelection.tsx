import React, { useState } from "react";
import { supabase } from "../lib/supabase";
import { CheckCircle2, Loader2, Sprout } from "lucide-react";
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
          <div className="flex items-center gap-2 mb-0.5">
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
          <p className="text-[11px] font-medium text-rhozly-on-surface/60 leading-snug mb-2">
            {tier.vibe}
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

export default function TierSelection({ userId, onComplete }: Props) {
  const [selected, setSelected] = useState<TierId | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

      {/* Tier cards */}
      <div className="flex-1 px-4 py-6 space-y-3 max-w-lg mx-auto w-full">
        {TIERS.map((tier) => (
          <TierCard
            key={tier.id}
            tier={tier}
            selected={selected === tier.id}
            onSelect={() => setSelected(tier.id)}
          />
        ))}
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
