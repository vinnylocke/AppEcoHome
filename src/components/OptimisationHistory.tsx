import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { History, Loader2, RotateCcw } from "lucide-react";
import toast from "react-hot-toast";
import { canUndoSession } from "../lib/taskOptimiser";

interface Session {
  id: string;
  applied_at: string;
  archived_blueprint_ids: string[];
  created_blueprint_ids: string[];
  is_reversed: boolean;
  reversed_at: string | null;
  areas: { name: string } | null;
}

interface Props {
  homeId: string;
  onUndone: () => void;
}

export default function OptimisationHistory({ homeId, onUndone }: Props) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [undoing, setUndoing] = useState<string | null>(null);
  const [eligibility, setEligibility] = useState<Record<string, { eligible: boolean; reason?: string }>>({});

  useEffect(() => {
    fetchSessions();
  }, [homeId]);

  async function fetchSessions() {
    setLoading(true);
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from("optimisation_sessions")
      .select("*, areas(name)")
      .eq("home_id", homeId)
      .gte("applied_at", cutoff)
      .order("applied_at", { ascending: false })
      .limit(20);

    const rows = (data ?? []) as Session[];
    setSessions(rows);

    // Check undo eligibility for non-reversed sessions
    const eligMap: Record<string, { eligible: boolean; reason?: string }> = {};
    for (const s of rows) {
      if (s.is_reversed || s.created_blueprint_ids.length === 0) {
        eligMap[s.id] = { eligible: false, reason: s.is_reversed ? "Already reversed" : undefined };
        continue;
      }
      const { data: bpData } = await supabase
        .from("task_blueprints")
        .select("id, updated_at, created_at")
        .in("id", s.created_blueprint_ids);
      eligMap[s.id] = canUndoSession(s, bpData ?? []);
    }
    setEligibility(eligMap);
    setLoading(false);
  }

  async function handleUndo(session: Session) {
    setUndoing(session.id);
    try {
      // Un-archive the archived blueprints
      if (session.archived_blueprint_ids.length > 0) {
        const { error: unarchiveErr } = await supabase
          .from("task_blueprints")
          .update({ is_archived: false })
          .in("id", session.archived_blueprint_ids);
        if (unarchiveErr) throw unarchiveErr;
      }

      // Delete the created blueprints (and their junction rows via CASCADE)
      if (session.created_blueprint_ids.length > 0) {
        const { error: deleteErr } = await supabase
          .from("task_blueprints")
          .delete()
          .in("id", session.created_blueprint_ids);
        if (deleteErr) throw deleteErr;
      }

      // Mark session as reversed
      const { error: reverseErr } = await supabase
        .from("optimisation_sessions")
        .update({ is_reversed: true, reversed_at: new Date().toISOString() })
        .eq("id", session.id);
      if (reverseErr) throw reverseErr;

      toast.success("Optimisation reversed — blueprints restored.");
      onUndone();
      fetchSessions();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ((err as any)?.message ?? String(err));
      toast.error(`Undo failed: ${msg}`);
    } finally {
      setUndoing(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6 text-rhozly-on-surface-variant">
        <Loader2 size={18} className="animate-spin" />
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <p className="text-xs text-rhozly-on-surface-variant text-center py-4">
        No optimisations applied in the last 90 days.
      </p>
    );
  }

  return (
    <div className="space-y-2" data-testid="optimisation-history">
      {sessions.map((s) => {
        const elig = eligibility[s.id] ?? { eligible: false };
        const areaName = s.areas?.name ?? "Unknown area";
        const date = new Date(s.applied_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

        return (
          <div
            key={s.id}
            data-testid={`session-row-${s.id}`}
            className="flex items-start gap-3 rounded-xl bg-rhozly-surface px-4 py-3"
          >
            <History size={14} className="text-rhozly-on-surface-variant mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-rhozly-on-surface">
                {areaName} · {date}
              </p>
              <p className="text-[10px] text-rhozly-on-surface-variant">
                {s.archived_blueprint_ids.length} archived · {s.created_blueprint_ids.length} created
                {s.is_reversed && " · Reversed"}
              </p>
            </div>
            {!s.is_reversed && (
              <button
                data-testid={`undo-session-${s.id}`}
                disabled={!elig.eligible || undoing === s.id}
                onClick={() => handleUndo(s)}
                title={elig.eligible ? "Undo this optimisation" : elig.reason}
                className="flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-rhozly-primary bg-rhozly-primary/10 hover:bg-rhozly-primary/20"
              >
                {undoing === s.id
                  ? <Loader2 size={12} className="animate-spin" />
                  : <RotateCcw size={12} />
                }
                Undo
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
