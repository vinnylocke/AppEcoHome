import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Library, Play, RefreshCw, Loader2, CheckCircle2, AlertCircle, Database,
  Sparkles, ArrowLeft, X, Search,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  fetchPlantLibraryStats,
  fetchPlantLibraryUsageTotals,
  fetchRecentPlantLibraryRuns,
  fetchStuckVerifications,
  sweepStalePlantLibraryRuns,
  markRunAsFailed,
  triggerSeedRun,
  triggerVerifyRun,
  type PlantLibraryRun,
  type PlantLibraryStats,
  type PlantLibraryUsageTotals,
  type StuckPlantRow,
} from "../../services/plantLibraryAdminService";
import { Logger } from "../../lib/errorHandler";
import PlantLibrarySearchTab from "./PlantLibrarySearchTab";

type AdminTab = "overview" | "search";

interface Props {
  isAdmin: boolean;
  userId: string;
}

const POLL_INTERVAL_MS = 3000;
const MAX_RUNS = 20;

/**
 * Admin-only dashboard for the global plant_library knowledge base.
 * Lazy-loaded; non-admins are redirected to /dashboard on mount.
 *
 * Stats strip (top): total / verified / matched / amended / unverified.
 * Run panel: count input + manual seed/verify buttons.
 * Recent runs: last 20 rows from plant_library_runs. Polls every 3s
 * while any row is still running, then stops to save battery.
 */
export default function PlantLibraryAdmin({ isAdmin, userId }: Props) {
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [stats, setStats] = useState<PlantLibraryStats | null>(null);
  const [runs, setRuns] = useState<PlantLibraryRun[]>([]);
  const [stuck, setStuck] = useState<StuckPlantRow[]>([]);
  const [usageTotals, setUsageTotals] = useState<PlantLibraryUsageTotals | null>(null);
  const [loading, setLoading] = useState(true);
  const [seedCount, setSeedCount] = useState(100);
  const [verifyCount, setVerifyCount] = useState(500);
  const [seeding, setSeeding] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const pollTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isAdmin) navigate("/dashboard", { replace: true });
  }, [isAdmin, navigate]);

  const refresh = useCallback(async () => {
    try {
      // Sweep first so any zombie "running" rows are flipped to
      // failed BEFORE we fetch the recent-runs list. Result: the
      // admin never sees a row that's been spinning for 30+ minutes
      // pretending to still be live.
      try {
        const cleared = await sweepStalePlantLibraryRuns();
        if (cleared > 0) {
          toast.success(`Marked ${cleared} stale run${cleared === 1 ? "" : "s"} as failed.`);
        }
      } catch (sweepErr) {
        Logger.error("Stale run sweep failed", sweepErr);
      }

      const [s, r, st, ut] = await Promise.all([
        fetchPlantLibraryStats(),
        fetchRecentPlantLibraryRuns(MAX_RUNS),
        fetchStuckVerifications(25),
        fetchPlantLibraryUsageTotals(),
      ]);
      setStats(s);
      setRuns(r);
      setStuck(st);
      setUsageTotals(ut);
    } catch (err) {
      Logger.error("PlantLibraryAdmin refresh failed", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Poll while any run is still going.
  const anyRunning = useMemo(
    () => runs.some((r) => r.status === "running"),
    [runs],
  );
  useEffect(() => {
    if (!anyRunning) {
      if (pollTimerRef.current) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      return;
    }
    if (pollTimerRef.current) return;
    pollTimerRef.current = window.setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      if (pollTimerRef.current) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [anyRunning, refresh]);

  const handleSeed = async () => {
    if (seeding) return;
    setSeeding(true);
    try {
      await triggerSeedRun(seedCount, userId);
      toast.success(`Seeding ${seedCount} plants in the background.`);
      refresh();
    } catch (err) {
      Logger.error("Seed trigger failed", err);
      toast.error("Couldn't start the seed run — check the function logs.");
    } finally {
      setSeeding(false);
    }
  };

  const handleVerify = async () => {
    if (verifying) return;
    setVerifying(true);
    try {
      await triggerVerifyRun(verifyCount, userId);
      toast.success(`Verifying up to ${verifyCount} plants in the background.`);
      refresh();
    } catch (err) {
      Logger.error("Verify trigger failed", err);
      toast.error("Couldn't start the verify run — check the function logs.");
    } finally {
      setVerifying(false);
    }
  };

  if (!isAdmin) return null;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-rhozly-on-surface/55 hover:text-rhozly-primary border border-rhozly-outline/15 hover:border-rhozly-primary/30 text-[11px] font-black uppercase tracking-widest"
          >
            <ArrowLeft size={13} />
            Back
          </button>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-primary mb-0.5">
              Admin
            </p>
            <h1 className="font-display font-black text-2xl text-rhozly-on-surface tracking-tight leading-tight flex items-center gap-2">
              <Library size={22} /> Plant Library
            </h1>
          </div>
        </div>
        {activeTab === "overview" && (
          <button
            type="button"
            onClick={refresh}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-rhozly-on-surface/55 hover:text-rhozly-primary border border-rhozly-outline/15 hover:border-rhozly-primary/30 text-[11px] font-black uppercase tracking-widest"
          >
            <RefreshCw size={13} />
            Refresh
          </button>
        )}
      </div>

      {/* Tab bar */}
      <nav
        data-testid="plant-library-admin-tabs"
        role="tablist"
        aria-label="Plant Library admin sections"
        className="flex items-center gap-1 border-b border-rhozly-outline/15"
      >
        <TabButton
          active={activeTab === "overview"}
          onClick={() => setActiveTab("overview")}
          icon={<Library size={13} />}
          label="Overview"
          testId="plant-library-admin-tab-overview"
        />
        <TabButton
          active={activeTab === "search"}
          onClick={() => setActiveTab("search")}
          icon={<Search size={13} />}
          label="Search"
          testId="plant-library-admin-tab-search"
        />
      </nav>

      {/* Search tab — totally separate flow from the Overview content. */}
      {activeTab === "search" && <PlantLibrarySearchTab />}

      {/* Overview tab — stats + runs + stuck rows. */}
      {activeTab === "overview" && (
        <>

      {/* Stats strip */}
      <section
        data-testid="plant-library-admin-stats"
        className="grid grid-cols-2 sm:grid-cols-5 gap-3"
      >
        <StatCard label="Total" value={stats?.total ?? 0} icon={<Database size={14} />} loading={loading} />
        <StatCard label="Verified" value={stats?.verified ?? 0} icon={<CheckCircle2 size={14} />} loading={loading} />
        <StatCard label="Matched" value={stats?.matched ?? 0} icon={<CheckCircle2 size={14} />} tone="green" loading={loading} />
        <StatCard label="Amended" value={stats?.amended ?? 0} icon={<Sparkles size={14} />} tone="amber" loading={loading} />
        <StatCard label="Unverified" value={stats?.unverified ?? 0} icon={<AlertCircle size={14} />} tone="muted" loading={loading} />
      </section>

      {/* Run controls */}
      <section className="rounded-3xl bg-white border border-rhozly-outline/15 p-5 shadow-[0_2px_12px_-4px_rgba(7,87,55,0.08)] space-y-4">
        <h2 className="font-display font-black text-rhozly-on-surface text-sm">
          Manual runs
        </h2>
        <p className="text-xs text-rhozly-on-surface/60 leading-snug">
          Seed runs ask Gemini for N new plants, fetch a free thumbnail, and insert with <code className="text-rhozly-primary">valid = null</code>. Verify runs cross-check unverified rows against Wikipedia + GBIF and flip <code className="text-rhozly-primary">valid</code> accordingly.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <RunBlock
            title="Seed"
            description="Add new plants to the library."
            count={seedCount}
            setCount={setSeedCount}
            max={5000}
            running={seeding}
            onRun={handleSeed}
            buttonLabel="Run seed"
          />
          <RunBlock
            title="Verify"
            description="Cross-check unverified rows."
            count={verifyCount}
            setCount={setVerifyCount}
            max={5000}
            running={verifying}
            onRun={handleVerify}
            buttonLabel="Run verify"
          />
        </div>
      </section>

      {/* Stuck rows — verifier hit at least one error on these */}
      {stuck.length > 0 && (
        <section
          data-testid="plant-library-admin-stuck"
          className="rounded-3xl bg-white border border-amber-200 shadow-[0_2px_12px_-4px_rgba(7,87,55,0.08)] overflow-hidden"
        >
          <div className="px-5 py-3 border-b border-amber-100 bg-amber-50 flex items-center justify-between">
            <div>
              <h2 className="font-display font-black text-amber-900 text-sm">
                Stuck verifications
              </h2>
              <p className="text-[11px] text-amber-800/80 leading-snug">
                Rows the verifier hit an error on. After {3} attempts they default-pass to <code>valid = true</code> but the error stays visible here for diagnosis.
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-rhozly-surface-low/40 text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/50">
                <tr>
                  <th className="text-left px-3 py-2">Plant</th>
                  <th className="text-right px-3 py-2">Attempts</th>
                  <th className="text-left px-3 py-2">Last error</th>
                  <th className="text-left px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {stuck.map((row) => (
                  <tr key={row.id} className="border-t border-rhozly-outline/10">
                    <td className="px-3 py-2">
                      <div className="font-bold text-rhozly-on-surface">{row.common_name}</div>
                      {row.scientific_name?.[0] && (
                        <div className="text-[10px] italic text-rhozly-on-surface/55">
                          {row.scientific_name[0]}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-bold text-rhozly-on-surface">
                      {row.verification_attempts}
                    </td>
                    <td className="px-3 py-2 text-rhozly-on-surface/70 max-w-md">
                      <code className="text-[10px] whitespace-pre-wrap break-words leading-snug">
                        {row.verification_error ?? "—"}
                      </code>
                    </td>
                    <td className="px-3 py-2">
                      {row.valid === true ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-100">
                          Default-passed
                        </span>
                      ) : row.valid === false ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border bg-amber-50 text-amber-800 border-amber-100">
                          Amended
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border bg-rose-50 text-rose-800 border-rose-100">
                          Retrying
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Recent runs */}
      <section
        data-testid="plant-library-admin-runs"
        className="rounded-3xl bg-white border border-rhozly-outline/15 shadow-[0_2px_12px_-4px_rgba(7,87,55,0.08)] overflow-hidden"
      >
        <div className="px-5 py-3 border-b border-rhozly-outline/10 flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-display font-black text-rhozly-on-surface text-sm">
            Recent runs
          </h2>
          <div className="flex items-center gap-3">
            {usageTotals && (
              <div className="flex items-center gap-3 text-[11px] text-rhozly-on-surface/65">
                <span data-testid="plant-library-admin-total-runs">
                  <span className="font-black text-rhozly-on-surface">
                    {usageTotals.total_runs.toLocaleString()}
                  </span>{" "}
                  run{usageTotals.total_runs === 1 ? "" : "s"}
                </span>
                <span className="text-rhozly-outline/40">·</span>
                <span data-testid="plant-library-admin-total-tokens">
                  <span className="font-black text-rhozly-on-surface">
                    {formatTokens(usageTotals.total_tokens)}
                  </span>{" "}
                  tokens
                </span>
                <span className="text-rhozly-outline/40">·</span>
                <span
                  data-testid="plant-library-admin-total-cost"
                  title="Estimated from a per-model price table using Gemini's usageMetadata (incl. cached + thinking tokens). Not Google's invoice line item."
                >
                  <span className="font-black text-emerald-700">
                    {formatUsd(usageTotals.total_cost_usd)}
                  </span>{" "}
                  est. cost
                </span>
              </div>
            )}
            {anyRunning && (
              <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-rhozly-primary">
                <Loader2 size={11} className="animate-spin" />
                Live
              </span>
            )}
          </div>
        </div>
        {loading ? (
          <div className="px-5 py-8 flex items-center justify-center text-rhozly-on-surface/55">
            <Loader2 size={16} className="animate-spin" />
          </div>
        ) : runs.length === 0 ? (
          <div className="px-5 py-8 text-center text-xs text-rhozly-on-surface/55">
            No runs yet. Trigger a seed run above to populate the library.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-rhozly-surface-low/40 text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/50">
                <tr>
                  <th className="text-left px-3 py-2">Started</th>
                  <th className="text-left px-3 py-2">Kind</th>
                  <th className="text-right px-3 py-2">Requested</th>
                  <th className="text-right px-3 py-2">Inserted / Matched</th>
                  <th className="text-right px-3 py-2">Skipped</th>
                  <th className="text-right px-3 py-2">Amended</th>
                  <th className="text-right px-3 py-2">Failed</th>
                  <th className="text-right px-3 py-2">Tokens</th>
                  <th
                    className="text-right px-3 py-2"
                    title="Estimated from a per-model price table — not Google's invoice"
                  >
                    Est. cost
                  </th>
                  <th className="text-left px-3 py-2">Duration</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-left px-3 py-2 w-12"></th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <RunRow key={r.id} run={r} onStop={refresh} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
        </>
      )}
    </div>
  );
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatUsd(n: number): string {
  if (n < 0.01) return "<$0.01";
  if (n < 1) return `$${n.toFixed(3)}`;
  if (n < 100) return `$${n.toFixed(2)}`;
  return `$${Math.round(n).toLocaleString()}`;
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  testId,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  testId: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      data-testid={testId}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] text-[11px] font-black uppercase tracking-widest transition-colors -mb-px border-b-2 ${
        active
          ? "text-rhozly-primary border-rhozly-primary"
          : "text-rhozly-on-surface/55 border-transparent hover:text-rhozly-on-surface"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function StatCard({
  label,
  value,
  icon,
  tone = "default",
  loading,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone?: "default" | "green" | "amber" | "muted";
  loading?: boolean;
}) {
  const toneCx =
    tone === "green"
      ? "bg-emerald-50 border-emerald-100 text-emerald-900"
      : tone === "amber"
      ? "bg-amber-50 border-amber-100 text-amber-900"
      : tone === "muted"
      ? "bg-rhozly-surface-low border-rhozly-outline/15 text-rhozly-on-surface/65"
      : "bg-white border-rhozly-outline/15 text-rhozly-on-surface";
  return (
    <div className={`rounded-2xl border p-3 ${toneCx}`}>
      <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest opacity-60 mb-1">
        {icon}
        {label}
      </div>
      <div className="font-display font-black text-2xl leading-tight">
        {loading ? <Loader2 size={18} className="animate-spin opacity-50" /> : value.toLocaleString()}
      </div>
    </div>
  );
}

function RunBlock({
  title,
  description,
  count,
  setCount,
  max,
  running,
  onRun,
  buttonLabel,
}: {
  title: string;
  description: string;
  count: number;
  setCount: (n: number) => void;
  max: number;
  running: boolean;
  onRun: () => void;
  buttonLabel: string;
}) {
  return (
    <div className="rounded-2xl border border-rhozly-outline/15 bg-rhozly-surface-low/40 p-4 space-y-3">
      <div>
        <p className="font-display font-black text-rhozly-on-surface text-sm">
          {title}
        </p>
        <p className="text-[11px] text-rhozly-on-surface/55 leading-snug">
          {description}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={1}
          max={max}
          value={count}
          onChange={(e) => {
            const next = parseInt(e.target.value, 10);
            if (Number.isFinite(next)) setCount(Math.max(1, Math.min(max, next)));
          }}
          className="flex-1 px-3 py-2 min-h-[40px] rounded-xl bg-white border border-rhozly-outline/20 text-sm font-bold text-rhozly-on-surface focus:outline-none focus:border-rhozly-primary/40 focus:ring-2 focus:ring-rhozly-primary/15"
        />
        <button
          type="button"
          onClick={onRun}
          disabled={running}
          className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl bg-rhozly-primary text-white text-[11px] font-black uppercase tracking-widest hover:opacity-95 disabled:opacity-50"
        >
          {running ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
          {buttonLabel}
        </button>
      </div>
    </div>
  );
}

function RunRow({ run, onStop }: { run: PlantLibraryRun; onStop: () => void }) {
  const [stopping, setStopping] = useState(false);
  const started = new Date(run.started_at);
  const finished = run.finished_at ? new Date(run.finished_at) : null;
  const durationMs = finished ? finished.getTime() - started.getTime() : null;
  const durationStr =
    durationMs != null
      ? durationMs < 60_000
        ? `${Math.round(durationMs / 1000)}s`
        : `${Math.round(durationMs / 60_000)}m`
      : "—";

  const statusTone =
    run.status === "succeeded"
      ? "bg-emerald-50 text-emerald-700 border-emerald-100"
      : run.status === "running"
      ? "bg-rhozly-primary/10 text-rhozly-primary border-rhozly-primary/20"
      : run.status === "partial"
      ? "bg-amber-50 text-amber-800 border-amber-100"
      : "bg-rose-50 text-rose-800 border-rose-100";

  const handleStop = async () => {
    if (stopping) return;
    if (!window.confirm("Mark this run as failed? The background task may still be in flight for a few seconds.")) {
      return;
    }
    setStopping(true);
    try {
      await markRunAsFailed(run.id);
      toast.success("Run marked as failed.");
      onStop();
    } catch (err) {
      Logger.error("markRunAsFailed failed", err);
      toast.error("Couldn't stop the run — try refresh.");
    } finally {
      setStopping(false);
    }
  };

  return (
    <tr className="border-t border-rhozly-outline/10">
      <td className="px-3 py-2 text-rhozly-on-surface/70 whitespace-nowrap">
        {started.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}
      </td>
      <td className="px-3 py-2 font-bold capitalize">
        {run.kind}
      </td>
      <td className="px-3 py-2 text-right text-rhozly-on-surface/70">
        {run.count_requested.toLocaleString()}
      </td>
      <td className="px-3 py-2 text-right font-bold text-rhozly-on-surface">
        {(run.kind === "seed" ? run.count_inserted : run.count_matched).toLocaleString()}
      </td>
      <td className="px-3 py-2 text-right text-rhozly-on-surface/55">
        {run.count_skipped.toLocaleString()}
      </td>
      <td className="px-3 py-2 text-right text-rhozly-on-surface/70">
        {run.count_amended.toLocaleString()}
      </td>
      <td className="px-3 py-2 text-right text-rose-700">
        {run.count_failed > 0 ? run.count_failed.toLocaleString() : "—"}
      </td>
      <td className="px-3 py-2 text-right text-rhozly-on-surface/70 whitespace-nowrap">
        {run.total_tokens > 0 ? formatTokens(run.total_tokens) : "—"}
      </td>
      <td className="px-3 py-2 text-right font-bold text-emerald-700 whitespace-nowrap">
        {Number(run.total_cost_usd) > 0 ? formatUsd(Number(run.total_cost_usd)) : "—"}
      </td>
      <td className="px-3 py-2 text-rhozly-on-surface/55 whitespace-nowrap">
        {durationStr}
      </td>
      <td className="px-3 py-2">
        <span className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${statusTone}`}>
          {run.status === "running" && <Loader2 size={9} className="animate-spin" />}
          {run.status}
        </span>
      </td>
      <td className="px-3 py-2 text-right">
        {run.status === "running" && (
          <button
            type="button"
            data-testid={`plant-library-run-${run.id}-stop`}
            onClick={handleStop}
            disabled={stopping}
            title="Mark this run as failed"
            aria-label="Mark this run as failed"
            className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-rhozly-on-surface/55 hover:text-rose-700 hover:bg-rose-50 transition-colors disabled:opacity-50"
          >
            {stopping ? <Loader2 size={12} className="animate-spin" /> : <X size={13} />}
          </button>
        )}
      </td>
    </tr>
  );
}
