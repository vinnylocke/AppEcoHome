// Garden Brain — adaptive-care proposals on the dashboard (Phase 1).
//
// Renders the home's OPEN care_adjustments (max 2 + "N more") plus recently
// verified ones ("✓ Since the change…"). Apply is one tap:
//   tighten/stretch          → update the blueprint's frequency_days
//   create_watering_routine  → create blueprint + first task + generate-tasks
//                              (mirrors AddTaskModal's recurring flow)
// Progressive disclosure: plain-language headline/detail for everyone; the
// evidence numbers expand for gardeners who want the data.

import { useCallback, useEffect, useState } from "react";
import { Brain, Check, ChevronDown, ChevronUp, Droplets, Loader2, Sun, X } from "lucide-react";
import toast from "react-hot-toast";
import { supabase } from "../../lib/supabase";
import { Logger } from "../../lib/errorHandler";
import { applyCareAdjustment, dismissCareAdjustment } from "../../lib/careAdjustments";
import { readSnapshot, writeSnapshot } from "../../lib/snapshotCache";

interface CareAdjustment {
  id: string;
  area_id: string | null;
  blueprint_id: string | null;
  kind: "tighten_watering" | "stretch_watering" | "stress_risk" | "in_range" | "create_watering_routine";
  current_frequency_days: number | null;
  suggested_frequency_days: number | null;
  evidence: Record<string, unknown> & { headline?: string; detail?: string };
  status: string;
  verification: Record<string, unknown> | null;
  verified_at: string | null;
}

const KIND_ICON: Record<string, React.ReactNode> = {
  tighten_watering: <Droplets size={14} className="text-sky-600" />,
  stretch_watering: <Droplets size={14} className="text-emerald-600" />,
  stress_risk: <Sun size={14} className="text-amber-600" />,
  create_watering_routine: <Droplets size={14} className="text-sky-600" />,
};

/** Actionable = renders with Apply/Dismiss. in_range stays for the briefing phase. */
const VISIBLE_KINDS = new Set(["tighten_watering", "stretch_watering", "stress_risk", "create_watering_routine"]);

export default function AdaptiveCareCard({
  homeId,
  currentUserId,
  embedded = false,
  onVisibilityChange,
}: {
  homeId: string;
  currentUserId: string | null;
  /** The Brief (redesign Stage 3) mounts this as a row inside its own card —
   *  embedded drops the outer card chrome and renders the inner content only. */
  embedded?: boolean;
  /** Reports whether the card is rendering content (true) or self-hiding
   *  (false) — the GettingStartedChecklist house pattern. */
  onVisibilityChange?: (visible: boolean) => void;
}) {
  const [items, setItems] = useState<CareAdjustment[]>([]);
  const [verifiedItems, setVerifiedItems] = useState<CareAdjustment[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    if (!homeId) return;
    // Offline-first: paint from snapshot, then revalidate.
    const cached = readSnapshot<{ open: CareAdjustment[]; verified: CareAdjustment[] }>("adaptive-care", homeId);
    if (cached) {
      setItems(cached.data.open);
      setVerifiedItems(cached.data.verified);
    }
    try {
      const [openRes, verifiedRes] = await Promise.all([
        supabase
          .from("care_adjustments")
          .select("id, area_id, blueprint_id, kind, current_frequency_days, suggested_frequency_days, evidence, status, verification, verified_at")
          .eq("home_id", homeId)
          .eq("status", "proposed")
          .order("created_at", { ascending: false }),
        supabase
          .from("care_adjustments")
          .select("id, area_id, blueprint_id, kind, current_frequency_days, suggested_frequency_days, evidence, status, verification, verified_at")
          .eq("home_id", homeId)
          .in("status", ["verified_good", "verified_mixed"])
          .gte("verified_at", new Date(Date.now() - 7 * 86_400_000).toISOString())
          .order("verified_at", { ascending: false })
          .limit(2),
      ]);
      // supabase-js doesn't throw on failure — a network blip returns
      // { data: null, error }. Without checking, a failed offline revalidate
      // would setItems([]) (blanking the card) AND writeSnapshot([]) (poisoning
      // the good cache). Keep the snapshot-painted state on error (bug-audit
      // 2026-07-10 #15).
      if (openRes.error || verifiedRes.error) {
        Logger.error("Adaptive care revalidate failed — keeping cached", openRes.error ?? verifiedRes.error, { homeId });
        return;
      }
      const openVisible = (openRes.data ?? []).filter((a) => VISIBLE_KINDS.has(a.kind)) as CareAdjustment[];
      const recentVerified = verifiedRes.data ?? [];
      setItems(openVisible);
      setVerifiedItems(recentVerified as CareAdjustment[]);
      writeSnapshot("adaptive-care", homeId, { open: openVisible, verified: recentVerified });
    } catch (err) {
      Logger.error("Adaptive care load failed", err, { homeId });
    }
  }, [homeId]);

  useEffect(() => { void load(); }, [load]);

  // Report visibility in an effect (never during render) — The Brief hides
  // its whole card when every merged row is empty.
  const visible = items.length > 0 || verifiedItems.length > 0;
  useEffect(() => {
    onVisibilityChange?.(visible);
  }, [visible, onVisibilityChange]);

  const dismiss = async (adj: CareAdjustment) => {
    setBusyId(adj.id);
    const res = await dismissCareAdjustment(adj);
    if (res.ok) {
      setItems((prev) => prev.filter((i) => i.id !== adj.id));
      toast(res.message);
    } else {
      toast.error(res.message);
    }
    setBusyId(null);
  };

  const apply = async (adj: CareAdjustment) => {
    setBusyId(adj.id);
    // Shared with the Daily Brief's inline Apply — src/lib/careAdjustments.ts.
    const res = await applyCareAdjustment(adj, { homeId, currentUserId });
    if (res.ok) {
      setItems((prev) => prev.filter((i) => i.id !== adj.id));
      toast.success(res.message);
    } else {
      toast.error(res.message);
    }
    setBusyId(null);
  };

  if (items.length === 0 && verifiedItems.length === 0) return null;

  const shown = showAll ? items : items.slice(0, 2);

  return (
    <div
      data-testid="adaptive-care-card"
      className={embedded ? "space-y-3" : "bg-white rounded-3xl border border-rhozly-outline/10 shadow-sm p-4 sm:p-5 space-y-3"}
    >
      <div className="flex items-center gap-2">
        <div className="bg-rhozly-primary/10 p-1.5 rounded-xl"><Brain size={16} className="text-rhozly-primary" /></div>
        <h3 className="text-sm font-black text-rhozly-on-surface">Garden Brain</h3>
        <span className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/35 ml-auto">from your soil sensors</span>
      </div>

      {verifiedItems.map((v) => (
        <div key={v.id} data-testid="adaptive-care-verified" className={`text-[11px] font-bold rounded-xl px-3 py-2 flex items-start gap-1.5 ${v.status === "verified_good" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
          <Check size={12} className="mt-0.5 shrink-0" />
          <span>
            {v.status === "verified_good" ? "Since the change" : "Mixed result since the change"}
            {typeof v.verification?.inRangePct === "number" && ` — soil in range ${Math.round(v.verification.inRangePct as number)}% of the time over ${v.verification?.windowDays ?? 7} days`}
            .
          </span>
        </div>
      ))}

      {shown.map((adj) => {
        const headline = (adj.evidence?.headline as string) ?? "Suggestion";
        const detail = (adj.evidence?.detail as string) ?? "";
        const isOpen = expanded === adj.id;
        return (
          <div key={adj.id} data-testid={`adaptive-care-item-${adj.kind}`} className="rounded-2xl border border-rhozly-outline/10 p-3 space-y-2">
            <div className="flex items-start gap-2">
              <div className="bg-rhozly-surface-low p-1.5 rounded-lg shrink-0 mt-0.5">{KIND_ICON[adj.kind]}</div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black text-rhozly-on-surface leading-snug">{headline}</p>
                <p className="text-[11px] font-medium text-rhozly-on-surface/60 leading-snug mt-0.5">{detail}</p>
                <button
                  onClick={() => setExpanded(isOpen ? null : adj.id)}
                  className="text-[10px] font-black uppercase tracking-widest text-rhozly-primary/70 hover:text-rhozly-primary mt-1 flex items-center gap-0.5"
                >
                  {isOpen ? <ChevronUp size={10} /> : <ChevronDown size={10} />} {isOpen ? "Hide the numbers" : "See the numbers"}
                </button>
                {isOpen && (
                  <div data-testid="adaptive-care-evidence" className="mt-1.5 text-[10px] font-mono text-rhozly-on-surface/55 bg-rhozly-surface-low rounded-lg p-2 leading-relaxed">
                    {JSON.stringify({
                      band: adj.evidence?.band,
                      stats: adj.evidence?.stats,
                      drydown: adj.evidence?.drydown,
                      daysToFloor: adj.evidence?.daysToFloor,
                      confidence: adj.evidence?.confidence,
                    }, null, 1).replace(/[{}"]/g, "")}
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                data-testid="adaptive-care-apply"
                onClick={() => void apply(adj)}
                disabled={busyId === adj.id}
                className="flex-1 h-9 rounded-xl bg-rhozly-primary text-white text-[11px] font-black flex items-center justify-center gap-1.5 hover:opacity-90 disabled:opacity-50"
              >
                {busyId === adj.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                {adj.kind === "create_watering_routine" ? `Create routine (every ${adj.suggested_frequency_days}d)` :
                  adj.kind === "stress_risk" ? "Got it" :
                  `Change to every ${adj.suggested_frequency_days}d`}
              </button>
              <button
                data-testid="adaptive-care-dismiss"
                onClick={() => void dismiss(adj)}
                disabled={busyId === adj.id}
                className="h-9 px-3 rounded-xl bg-rhozly-surface text-rhozly-on-surface/60 text-[11px] font-black flex items-center justify-center gap-1 hover:bg-rhozly-surface-mid disabled:opacity-50"
              >
                <X size={12} /> Dismiss
              </button>
            </div>
          </div>
        );
      })}

      {items.length > 2 && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="text-[11px] font-black text-rhozly-primary/80 hover:text-rhozly-primary"
        >
          {showAll ? "Show less" : `${items.length - 2} more suggestion${items.length - 2 === 1 ? "" : "s"}`}
        </button>
      )}
    </div>
  );
}
