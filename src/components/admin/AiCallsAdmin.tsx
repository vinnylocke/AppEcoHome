import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { Loader2, RefreshCw, ChevronRight, ChevronDown, Activity } from "lucide-react";

interface AiCallRow {
  id: string;
  created_at: string;
  user_id: string | null;
  home_id: string | null;
  function_name: string;
  action: string | null;
  model: string;
  prompt_tokens: number;
  candidates_tokens: number;
  cached_tokens: number;
  thoughts_tokens: number;
  total_tokens: number;
  image_count: number;
  estimated_cost_usd: number;
  duration_ms: number | null;
  status: string;
  error: string | null;
}

interface Payload {
  context_block: string | null;
  prompt: string | null;
  raw_result: unknown;
}

interface Props {
  isAdmin: boolean;
}

const LIST_COLS =
  "id, created_at, user_id, home_id, function_name, action, model, prompt_tokens, candidates_tokens, cached_tokens, thoughts_tokens, total_tokens, image_count, estimated_cost_usd, duration_ms, status, error";

function fmtCost(usd: number): string {
  const n = Number(usd ?? 0);
  if (n === 0) return "$0";
  if (n < 0.000001) return "<$0.000001";
  return `$${n.toFixed(6)}`;
}

export default function AiCallsAdmin({ isAdmin }: Props) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<AiCallRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fnFilter, setFnFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "ok" | "error" | "fallback">("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [payloads, setPayloads] = useState<Record<string, Payload>>({});
  const [loadingPayload, setLoadingPayload] = useState<string | null>(null);
  const [fb, setFb] = useState<{
    up: number;
    down: number;
    recent: Array<{ id: string; function_name: string; action: string | null; comment: string | null }>;
  }>({ up: 0, down: 0, recent: [] });

  useEffect(() => {
    if (!isAdmin) navigate("/dashboard", { replace: true });
  }, [isAdmin, navigate]);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("ai_usage_log")
      .select(LIST_COLS)
      .order("created_at", { ascending: false })
      .limit(250);
    if (fnFilter.trim()) q = q.ilike("function_name", `%${fnFilter.trim()}%`);
    if (statusFilter !== "all") q = q.eq("status", statusFilter);
    const { data } = await q;
    setRows((data ?? []) as AiCallRow[]);
    setLoading(false);
  }, [fnFilter, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  // Feedback signal from the 👍/👎 controls on AI outputs (ai_feedback).
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("ai_feedback")
        .select("id, function_name, action, rating, comment, created_at")
        .order("created_at", { ascending: false })
        .limit(500);
      const rows = (data ?? []) as Array<{
        id: string; function_name: string; action: string | null; rating: number; comment: string | null;
      }>;
      setFb({
        up: rows.filter((r) => r.rating === 1).length,
        down: rows.filter((r) => r.rating === -1).length,
        recent: rows
          .filter((r) => r.rating === -1)
          .slice(0, 5)
          .map((r) => ({ id: r.id, function_name: r.function_name, action: r.action, comment: r.comment })),
      });
    })();
  }, []);

  const toggleRow = async (id: string) => {
    if (expanded === id) {
      setExpanded(null);
      return;
    }
    setExpanded(id);
    if (!payloads[id]) {
      setLoadingPayload(id);
      const { data } = await supabase
        .from("ai_usage_log")
        .select("context_block, prompt, raw_result")
        .eq("id", id)
        .maybeSingle();
      if (data) setPayloads((p) => ({ ...p, [id]: data as Payload }));
      setLoadingPayload(null);
    }
  };

  const totals = useMemo(() => {
    const cost = rows.reduce((s, r) => s + Number(r.estimated_cost_usd ?? 0), 0);
    const errors = rows.filter((r) => r.status === "error").length;
    return { count: rows.length, cost, errors };
  }, [rows]);

  if (!isAdmin) return null;

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 space-y-4" data-testid="ai-calls-admin">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-lg font-black text-rhozly-on-surface flex items-center gap-2">
          <Activity size={18} className="text-rhozly-primary" />
          AI Calls
        </h1>
        <button
          data-testid="ai-calls-refresh"
          onClick={() => void load()}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rhozly-primary text-white text-xs font-black disabled:opacity-50"
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <input
          data-testid="ai-calls-fn-filter"
          value={fnFilter}
          onChange={(e) => setFnFilter(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void load()}
          placeholder="Filter by function name…"
          className="flex-1 min-w-[180px] text-sm font-bold text-rhozly-on-surface bg-white rounded-xl px-3 py-2 border border-rhozly-outline/15 outline-none focus:ring-2 focus:ring-rhozly-primary"
        />
        <select
          data-testid="ai-calls-status-filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          className="text-sm font-bold text-rhozly-on-surface bg-white rounded-xl px-3 py-2 border border-rhozly-outline/15 outline-none"
        >
          <option value="all">All statuses</option>
          <option value="ok">ok</option>
          <option value="error">error</option>
          <option value="fallback">fallback</option>
        </select>
      </div>

      {/* Summary */}
      <div className="flex items-center gap-2 flex-wrap text-xs font-black">
        <span className="px-2.5 py-1 rounded-full bg-rhozly-surface text-rhozly-on-surface/70">
          {totals.count} calls
        </span>
        <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700">
          {fmtCost(totals.cost)} total (shown)
        </span>
        {totals.errors > 0 && (
          <span className="px-2.5 py-1 rounded-full bg-red-50 text-red-700">{totals.errors} errors</span>
        )}
        <span className="text-[10px] font-bold text-rhozly-on-surface/40">latest 250</span>
      </div>

      {/* Feedback signal (from the 👍/👎 controls on AI outputs) */}
      <div className="bg-white rounded-2xl border border-rhozly-outline/10 p-3 space-y-2" data-testid="ai-feedback-summary">
        <div className="flex items-center gap-2 text-xs font-black flex-wrap">
          <span className="text-rhozly-on-surface/40 uppercase tracking-widest text-[10px]">Feedback</span>
          <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">👍 {fb.up}</span>
          <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-700">👎 {fb.down}</span>
          {fb.up + fb.down === 0 && (
            <span className="text-[10px] font-medium text-rhozly-on-surface/30">
              No feedback yet — the 👍/👎 controls on AI outputs feed this.
            </span>
          )}
        </div>
        {fb.recent.length > 0 && (
          <div className="space-y-1 pt-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40">Recent 👎</p>
            {fb.recent.map((r) => (
              <div key={r.id} className="text-[11px] text-rhozly-on-surface/70">
                <span className="font-bold">{r.function_name}{r.action ? ` · ${r.action}` : ""}</span>
                {r.comment
                  ? <span className="text-rhozly-on-surface/60"> — "{r.comment}"</span>
                  : <span className="text-rhozly-on-surface/30"> — (no comment)</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-rhozly-outline/10 overflow-hidden">
        {loading ? (
          <div className="p-8 flex justify-center">
            <Loader2 size={20} className="animate-spin text-rhozly-on-surface/30" />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-sm font-bold text-rhozly-on-surface/40">No AI calls found.</div>
        ) : (
          <div className="divide-y divide-rhozly-outline/8">
            {rows.map((r) => {
              const isOpen = expanded === r.id;
              return (
                <div key={r.id} data-testid={`ai-call-row-${r.id}`}>
                  <button
                    onClick={() => void toggleRow(r.id)}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-rhozly-surface/40 transition-colors"
                  >
                    {isOpen ? <ChevronDown size={14} className="shrink-0 text-rhozly-on-surface/40" /> : <ChevronRight size={14} className="shrink-0 text-rhozly-on-surface/40" />}
                    <span className="text-[11px] font-mono text-rhozly-on-surface/50 w-32 shrink-0">
                      {new Date(r.created_at).toLocaleString()}
                    </span>
                    <span className="text-xs font-black text-rhozly-on-surface flex-1 min-w-0 truncate">
                      {r.function_name}
                      {r.action ? <span className="font-medium text-rhozly-on-surface/50"> · {r.action}</span> : null}
                    </span>
                    <span className="text-[10px] font-mono text-rhozly-on-surface/40 w-28 shrink-0 truncate hidden md:block">
                      {r.model}
                    </span>
                    <span className="text-[10px] font-bold text-rhozly-on-surface/50 w-20 shrink-0 text-right hidden sm:block">
                      {r.total_tokens || (r.image_count ? `${r.image_count} img` : 0)} tok
                    </span>
                    <span className="text-[11px] font-black text-emerald-700 w-24 shrink-0 text-right">
                      {fmtCost(r.estimated_cost_usd)}
                    </span>
                    <span
                      className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full shrink-0 ${
                        r.status === "error"
                          ? "bg-red-50 text-red-700"
                          : r.status === "fallback"
                          ? "bg-amber-50 text-amber-700"
                          : "bg-emerald-50 text-emerald-600"
                      }`}
                    >
                      {r.status}
                    </span>
                  </button>

                  {isOpen && (
                    <div className="px-4 pb-4 pt-1 space-y-3 bg-rhozly-surface/30" data-testid={`ai-call-detail-${r.id}`}>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px] font-bold text-rhozly-on-surface/60">
                        <div>user: <span className="font-mono">{r.user_id?.slice(0, 8) ?? "—"}</span></div>
                        <div>home: <span className="font-mono">{r.home_id?.slice(0, 8) ?? "—"}</span></div>
                        <div>prompt/out/cache/think: {r.prompt_tokens}/{r.candidates_tokens}/{r.cached_tokens}/{r.thoughts_tokens}</div>
                        <div>duration: {r.duration_ms != null ? `${r.duration_ms}ms` : "—"}</div>
                      </div>
                      {r.error && (
                        <div className="text-[11px] font-bold text-red-700 bg-red-50 rounded-lg p-2">{r.error}</div>
                      )}
                      {loadingPayload === r.id ? (
                        <div className="flex justify-center py-3"><Loader2 size={16} className="animate-spin text-rhozly-on-surface/30" /></div>
                      ) : (
                        <>
                          <Section title="Context" body={payloads[r.id]?.context_block ?? null} />
                          <Section title="Prompt" body={payloads[r.id]?.prompt ?? null} />
                          <Section
                            title="Raw result"
                            body={
                              payloads[r.id]?.raw_result != null
                                ? JSON.stringify(payloads[r.id]!.raw_result, null, 2)
                                : null
                            }
                          />
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, body }: { title: string; body: string | null }) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-1">{title}</p>
      {body ? (
        <pre className="text-[11px] font-mono text-rhozly-on-surface/80 whitespace-pre-wrap break-words bg-white rounded-lg p-2 border border-rhozly-outline/10 max-h-72 overflow-y-auto">
          {body}
        </pre>
      ) : (
        <p className="text-[11px] font-medium text-rhozly-on-surface/30 italic">
          Not captured (older call, or this function doesn't thread it yet — or pruned after 30 days).
        </p>
      )}
    </div>
  );
}
