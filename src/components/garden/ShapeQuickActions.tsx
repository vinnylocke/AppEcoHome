import React, { useEffect, useState } from "react";
import { Droplets, Scissors, Wheat, Camera, X, Loader2 } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Logger } from "../../lib/errorHandler";
import toast from "react-hot-toast";

interface Props {
  shapeId: string;
  shapeLabel: string | null;
  areaId: string | null;
  homeId: string;
  onClose: () => void;
  onActionComplete?: () => void;
}

type ActionType = "Watering" | "Pruning" | "Harvesting";

export default function ShapeQuickActions({ shapeId, shapeLabel, areaId, homeId, onClose, onActionComplete }: Props) {
  const [counts, setCounts] = useState<Record<ActionType, number>>({ Watering: 0, Pruning: 0, Harvesting: 0 });
  const [running, setRunning] = useState<ActionType | "Photo" | null>(null);

  useEffect(() => {
    if (!areaId) return;
    let cancelled = false;
    (async () => {
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);
      const { data: plants } = await supabase
        .from("inventory_items")
        .select("id")
        .eq("area_id", areaId)
        .eq("status", "Planted");
      const plantIds = (plants ?? []).map((p) => p.id);
      if (cancelled || plantIds.length === 0) return;

      const { data: tasks } = await supabase
        .from("tasks")
        .select("id, type")
        .eq("home_id", homeId)
        .overlaps("inventory_item_ids", plantIds)
        .neq("status", "Completed")
        .neq("status", "Skipped")
        .lte("due_date", todayEnd.toISOString());
      if (cancelled) return;
      const next: Record<ActionType, number> = { Watering: 0, Pruning: 0, Harvesting: 0 };
      for (const t of tasks ?? []) {
        const k = t.type as ActionType;
        if (k in next) next[k] += 1;
      }
      setCounts(next);
    })();
    return () => { cancelled = true; };
  }, [areaId, homeId, running]);

  async function complete(type: ActionType) {
    if (!areaId || running) return;
    setRunning(type);
    try {
      const { data: plants } = await supabase
        .from("inventory_items").select("id")
        .eq("area_id", areaId).eq("status", "Planted");
      const plantIds = (plants ?? []).map((p) => p.id);
      if (plantIds.length === 0) {
        toast("No planted items in this bed");
        return;
      }
      const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
      const { data: tasks } = await supabase
        .from("tasks")
        .select("id")
        .eq("home_id", homeId)
        .eq("type", type)
        .overlaps("inventory_item_ids", plantIds)
        .neq("status", "Completed")
        .neq("status", "Skipped")
        .lte("due_date", todayEnd.toISOString());
      const ids = (tasks ?? []).map((t) => t.id);
      if (ids.length === 0) {
        toast(`No ${type.toLowerCase()} tasks to mark done`);
        return;
      }
      const { error } = await supabase
        .from("tasks")
        .update({ status: "Completed", completed_at: new Date().toISOString() })
        .in("id", ids);
      if (error) throw error;
      toast.success(`${ids.length} ${type.toLowerCase()} task${ids.length > 1 ? "s" : ""} done`);
      onActionComplete?.();
    } catch (err) {
      Logger.error(`Failed quick-complete ${type}`, err);
      toast.error("Could not complete tasks");
    } finally {
      setRunning(null);
    }
  }

  const actions: { type: ActionType; Icon: any; label: string; activeColor: string }[] = [
    { type: "Watering",   Icon: Droplets, label: "Watered",   activeColor: "text-sky-600 bg-sky-50" },
    { type: "Pruning",    Icon: Scissors, label: "Pruned",    activeColor: "text-emerald-600 bg-emerald-50" },
    { type: "Harvesting", Icon: Wheat,    label: "Harvested", activeColor: "text-amber-600 bg-amber-50" },
  ];

  return (
    <div
      data-testid="shape-quick-actions"
      className="fixed inset-x-0 bottom-0 z-50 bg-white border-t border-rhozly-outline/20 shadow-2xl rounded-t-3xl p-4 pb-6 space-y-4"
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-black text-rhozly-on-surface/40 uppercase tracking-widest">Quick Actions</p>
          <p className="text-sm font-black text-rhozly-on-surface truncate">{shapeLabel ?? "This bed"}</p>
        </div>
        <button
          data-testid="quick-actions-close"
          onClick={onClose}
          aria-label="Close"
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-rhozly-on-surface/50 hover:bg-rhozly-surface"
        >
          <X size={18} />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {actions.map(({ type, Icon, label, activeColor }) => {
          const isRunning = running === type;
          const count = counts[type];
          const hasTasks = count > 0;
          return (
            <button
              key={type}
              data-testid={`quick-action-${type.toLowerCase()}`}
              onClick={() => complete(type)}
              disabled={isRunning || !hasTasks}
              className={`flex flex-col items-center gap-1 min-h-[80px] p-3 rounded-2xl border transition-colors ${
                hasTasks
                  ? `${activeColor} border-transparent hover:opacity-90`
                  : "text-rhozly-on-surface/30 border-rhozly-outline/15"
              } disabled:opacity-60`}
            >
              {isRunning ? <Loader2 size={20} className="animate-spin" /> : <Icon size={22} />}
              <span className="text-[11px] font-black uppercase tracking-widest">{label}</span>
              {hasTasks && <span className="text-[10px] font-black">{count} pending</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
