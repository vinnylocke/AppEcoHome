import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { Plus, Loader2, Zap } from "lucide-react";
import AutomationCard from "./AutomationCard";
import AutomationBuilderModal from "./AutomationBuilderModal";
import type { ConditionNode } from "../../lib/conditionTree";

export interface AutomationFull {
  id: string;
  home_id: string;
  name: string;
  is_active: boolean;
  /** Unified condition tree — the canonical trigger definition. */
  trigger_logic: ConditionNode | null;
  created_at: string;
  devices: Array<{ device_id: string; device_name: string }>;
  blueprints: Array<{ blueprint_id: string; blueprint_title: string; role: "controlling" | "driven" }>;
  lastRun: { id: string; status: string; triggered_at: string; triggered_by: string } | null;
}

interface Props {
  homeId: string;
  canManage: boolean;
  canRun: boolean;
}

export default function AutomationsSection({ homeId, canManage, canRun }: Props) {
  const [automations, setAutomations] = useState<AutomationFull[]>([]);
  const [loading, setLoading] = useState(true);
  // Unified builder (Phase 2): undefined = closed, null = new, string = edit id.
  const [builderId, setBuilderId] = useState<string | null | undefined>(undefined);

  const load = useCallback(async () => {
    setLoading(true);

    const { data: raw } = await supabase
      .from("automations")
      .select(`
        id, home_id, name, is_active, trigger_logic, created_at,
        automation_devices(device_id, devices(id, name)),
        automation_blueprints(blueprint_id, role, task_blueprints(title))
      `)
      .eq("home_id", homeId)
      .order("created_at");

    const rows = (raw ?? []) as any[];

    if (rows.length === 0) {
      setAutomations([]);
      setLoading(false);
      return;
    }

    const ids = rows.map((r) => r.id);
    const { data: runData } = await supabase
      .from("automation_runs")
      .select("id, automation_id, status, triggered_at, triggered_by")
      .in("automation_id", ids)
      .order("triggered_at", { ascending: false });

    const latestRunByAutomation = new Map<string, typeof runData extends (infer U)[] | null ? U : never>();
    for (const run of runData ?? []) {
      if (!latestRunByAutomation.has(run.automation_id)) {
        latestRunByAutomation.set(run.automation_id, run);
      }
    }

    const parsed: AutomationFull[] = rows.map((r) => ({
      id: r.id,
      home_id: r.home_id,
      name: r.name,
      is_active: r.is_active,
      trigger_logic: r.trigger_logic ?? null,
      created_at: r.created_at,
      devices: (r.automation_devices ?? []).map((d: any) => ({
        device_id: d.device_id,
        device_name: d.devices?.name ?? "Unknown device",
      })),
      blueprints: (r.automation_blueprints ?? []).map((b: any) => ({
        blueprint_id: b.blueprint_id,
        blueprint_title: b.task_blueprints?.title ?? "Unknown task",
        role: b.role as "controlling" | "driven",
      })),
      lastRun: latestRunByAutomation.get(r.id) ?? null,
    }));

    setAutomations(parsed);
    setLoading(false);
  }, [homeId]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => setBuilderId(null);
  const openEdit = (automation: AutomationFull) => setBuilderId(automation.id);

  const handleSaved = () => { setBuilderId(undefined); load(); };
  const handleDeleted = (id: string) => setAutomations((prev) => prev.filter((a) => a.id !== id));

  return (
    <div className="mt-10">
      {/* Section header */}
      <div className="flex items-center justify-between mb-4 gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-rhozly-primary/10 flex items-center justify-center shrink-0">
            <Zap size={16} className="text-rhozly-primary" />
          </div>
          <div>
            <h2 className="font-black text-rhozly-on-surface text-base leading-tight">Automations</h2>
            <p className="text-xs text-rhozly-on-surface-variant">Schedule valves to run automatically</p>
          </div>
        </div>
        {canManage && (
          <button
            onClick={openNew}
            data-testid="automation-new"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rhozly-primary text-white text-xs font-bold hover:bg-rhozly-primary/90 transition-colors shrink-0"
          >
            <Plus size={14} />
            New automation
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={20} className="animate-spin text-rhozly-on-surface-variant" />
        </div>
      ) : automations.length === 0 ? (
        <AutomationsEmptyState onNew={canManage ? openNew : undefined} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {automations.map((a) => (
            <AutomationCard
              key={a.id}
              automation={a}
              onEdit={() => openEdit(a)}
              onDeleted={() => handleDeleted(a.id)}
              canManage={canManage}
              canRun={canRun}
            />
          ))}
        </div>
      )}

      {builderId !== undefined && (
        <AutomationBuilderModal
          homeId={homeId}
          automationId={builderId}
          onSaved={handleSaved}
          onClose={() => setBuilderId(undefined)}
        />
      )}
    </div>
  );
}

function AutomationsEmptyState({ onNew }: { onNew?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6 rounded-3xl border border-dashed border-rhozly-outline/30 bg-rhozly-surface-lowest">
      <div className="w-12 h-12 rounded-2xl bg-rhozly-primary/10 flex items-center justify-center mb-3">
        <Zap size={22} className="text-rhozly-primary/60" />
      </div>
      <h3 className="font-bold text-rhozly-on-surface text-sm mb-1">No automations yet</h3>
      <p className="text-xs text-rhozly-on-surface-variant max-w-xs mb-4">
        Set up a schedule to automatically water your garden when tasks are due.
      </p>
      {onNew && (
        <button
          onClick={onNew}
          data-testid="automation-empty-new"
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rhozly-primary text-white text-xs font-bold hover:bg-rhozly-primary/90 transition-colors"
        >
          <Plus size={14} />
          Create your first automation
        </button>
      )}
    </div>
  );
}
