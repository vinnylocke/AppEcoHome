import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Compass, ArrowRight } from "lucide-react";
import { supabase } from "../../lib/supabase";
import FeatureGate from "../shared/FeatureGate";
import UpgradeNudge from "../shared/UpgradeNudge";
import type { ManagerReport } from "../../lib/managerReport";

/**
 * Compact dashboard entry-point for the Head Gardener. Reads the cached Estate
 * Report row directly (no AI cost) and surfaces its headline with a deep link to
 * /manager. Renders nothing until a report exists. Evergreen-gated.
 *
 * Two forms (redesign Stage 3): the standalone gradient card, and `embedded` —
 * a compact row for The Brief's estate slot. `onVisibilityChange` reports
 * whether the inner content rendered (the GettingStartedChecklist house
 * pattern); it only fires once the tier gate has passed and the inner mounts —
 * locked accounts keep the parent's optimistic default, which is correct
 * because the gate's compact UpgradeNudge fallback is real visible content.
 */
interface HeadGardenerCardProps {
  embedded?: boolean;
  onVisibilityChange?: (visible: boolean) => void;
}

function HeadGardenerCardInner({ embedded = false, onVisibilityChange }: HeadGardenerCardProps) {
  const navigate = useNavigate();
  const [headline, setHeadline] = useState<string | null>(null);
  const [openItems, setOpenItems] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return;
      const { data: profile } = await supabase.from("user_profiles").select("home_id").eq("uid", uid).maybeSingle();
      const homeId = (profile as { home_id?: string } | null)?.home_id;
      if (!homeId) return;

      const [{ data: row }, { count }] = await Promise.all([
        supabase.from("garden_manager_reports").select("report").eq("home_id", homeId).maybeSingle(),
        supabase.from("garden_manager_log").select("id", { count: "exact", head: true }).eq("home_id", homeId).eq("status", "open"),
      ]);
      if (cancelled) return;
      const report = (row as { report?: ManagerReport } | null)?.report ?? null;
      setHeadline(report?.headline ?? null);
      setOpenItems(count ?? 0);
    })();
    return () => { cancelled = true; };
  }, []);

  // Report visibility in an effect (never during render).
  const visible = headline !== null;
  useEffect(() => {
    onVisibilityChange?.(visible);
  }, [visible, onVisibilityChange]);

  if (!headline) return null;

  if (embedded) {
    // The Brief's estate row — same data, same /manager deep link, row chrome.
    return (
      <button
        onClick={() => navigate("/manager")}
        data-testid="head-gardener-card"
        className="w-full text-left group"
      >
        <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40">
          <Compass size={11} className="text-emerald-600" /> Your head gardener
          {openItems > 0 && (
            <span className="font-black px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
              {openItems} to look at
            </span>
          )}
        </div>
        <div className="mt-1 flex items-start justify-between gap-2">
          <p className="min-w-0 flex-1 text-xs font-black text-rhozly-on-surface leading-snug">{headline}</p>
          <ArrowRight size={13} className="shrink-0 mt-0.5 text-rhozly-on-surface/30 group-hover:text-rhozly-primary transition" />
        </div>
      </button>
    );
  }

  return (
    <button
      onClick={() => navigate("/manager")}
      data-testid="head-gardener-card"
      className="w-full text-left rounded-3xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white p-4 shadow-sm hover:shadow-md transition-shadow"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-white/70">
          <Compass size={12} /> Your head gardener
        </div>
        {openItems > 0 && (
          <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-white/15">
            {openItems} to look at
          </span>
        )}
      </div>
      <p className="text-[15px] font-black leading-snug mt-1.5">{headline}</p>
      <span className="inline-flex items-center gap-1 mt-2 text-[12px] font-black text-white/90">
        Open Head Gardener <ArrowRight size={13} />
      </span>
    </button>
  );
}

export default function HeadGardenerCard({ embedded, onVisibilityChange }: HeadGardenerCardProps) {
  return (
    <FeatureGate feature="head_gardener" fallback={<UpgradeNudge feature="head_gardener" compact />}>
      <HeadGardenerCardInner embedded={embedded} onVisibilityChange={onVisibilityChange} />
    </FeatureGate>
  );
}
