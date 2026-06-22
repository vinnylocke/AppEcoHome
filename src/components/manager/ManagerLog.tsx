import React, { useCallback, useEffect, useState } from "react";
import { Loader2, CheckCircle2, Check, X, History } from "lucide-react";
import { supabase } from "../../lib/supabase";

interface LogEntry {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  goal: string | null;
  status: "open" | "acted" | "dismissed" | "expired";
  created_at: string;
  resolved_at: string | null;
  outcome_note: string | null;
}

export default function ManagerLog({ homeId }: { homeId: string }) {
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<LogEntry[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("garden_manager_log")
      .select("id, kind, title, body, goal, status, created_at, resolved_at, outcome_note")
      .eq("home_id", homeId)
      .in("status", ["open", "acted"])
      .order("created_at", { ascending: false })
      .limit(12);
    setEntries((data as LogEntry[]) ?? []);
    setLoading(false);
  }, [homeId]);

  useEffect(() => { load(); }, [load]);

  const patch = async (id: string, status: "acted" | "dismissed", note?: string) => {
    // Optimistic: drop dismissed entries, flip acted entries.
    setEntries((xs) =>
      status === "dismissed"
        ? xs.filter((x) => x.id !== id)
        : xs.map((x) => (x.id === id ? { ...x, status, resolved_at: new Date().toISOString(), outcome_note: note ?? x.outcome_note } : x)),
    );
    await supabase
      .from("garden_manager_log")
      .update({ status, resolved_at: new Date().toISOString(), ...(note ? { outcome_note: note } : {}) })
      .eq("id", id);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-rhozly-on-surface/40">
        <Loader2 size={16} className="animate-spin" /> Loading your manager's notes…
      </div>
    );
  }

  if (entries.length === 0) return null;

  return (
    <div className="space-y-2.5" data-testid="manager-log">
      <p className="text-[11px] font-black uppercase tracking-widest text-rhozly-on-surface/40 px-1 flex items-center gap-1.5">
        <History size={12} /> Your manager's notes
      </p>
      {entries.map((e) => {
        const done = e.status === "acted";
        return (
          <div
            key={e.id}
            data-testid={`log-entry-${e.id}`}
            className={`rounded-2xl border p-3.5 ${done ? "border-emerald-200/60 bg-emerald-50/40" : "border-rhozly-outline/10 bg-white"}`}
          >
            <div className="flex items-start gap-2.5">
              {done && <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />}
              <div className="flex-1 min-w-0">
                <p className={`text-[14px] font-black ${done ? "text-rhozly-on-surface/70" : "text-rhozly-on-surface"}`}>{e.title}</p>
                {e.body && !done && (
                  <p className="text-[13px] font-medium text-rhozly-on-surface/65 mt-0.5 leading-snug">{e.body}</p>
                )}
                {done && e.outcome_note && (
                  <p className="text-[12px] font-bold text-emerald-700/80 mt-0.5">{e.outcome_note}</p>
                )}
              </div>
              {!done && (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => patch(e.id, "acted", "Marked done")}
                    data-testid={`log-done-${e.id}`}
                    className="p-1.5 rounded-xl text-emerald-600 hover:bg-emerald-50 transition-colors"
                    title="Mark done"
                  >
                    <Check size={15} />
                  </button>
                  <button
                    onClick={() => patch(e.id, "dismissed")}
                    data-testid={`log-dismiss-${e.id}`}
                    className="p-1.5 rounded-xl text-rhozly-on-surface/30 hover:text-rhozly-on-surface/60 hover:bg-rhozly-surface transition-colors"
                    title="Dismiss"
                  >
                    <X size={15} />
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
