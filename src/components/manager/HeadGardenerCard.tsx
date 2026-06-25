import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Leaf, ArrowRight } from "lucide-react";
import { supabase } from "../../lib/supabase";
import FeatureGate from "../shared/FeatureGate";
import UpgradeNudge from "../shared/UpgradeNudge";
import type { ManagerReport } from "../../lib/managerReport";

/**
 * Compact dashboard entry-point for the Head Gardener. Reads the cached Estate
 * Report row directly (no AI cost) and surfaces its headline with a deep link to
 * /manager. Renders nothing until a report exists. Evergreen-gated.
 */
function HeadGardenerCardInner() {
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

  if (!headline) return null;

  return (
    <button
      onClick={() => navigate("/manager")}
      data-testid="head-gardener-card"
      className="w-full text-left rounded-3xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white p-4 shadow-sm hover:shadow-md transition-shadow"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-white/70">
          <Leaf size={12} /> Your head gardener
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

export default function HeadGardenerCard() {
  return (
    <FeatureGate feature="head_gardener" fallback={<UpgradeNudge feature="head_gardener" compact />}>
      <HeadGardenerCardInner />
    </FeatureGate>
  );
}
