import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Library, Play, RefreshCw, Loader2, CheckCircle2, AlertCircle, Database,
  Sparkles, ArrowLeft, X, Search, ChevronDown, ChevronRight, CalendarClock,
  Layers, Activity, RotateCcw,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  cancelPlantLibraryBatch,
  cancelPlantLibrarySchedule,
  createPlantLibrarySchedule,
  estimatePlantLibrarySeedCost,
  fetchActivePlantLibraryBatches,
  fetchActivePlantLibrarySchedules,
  fetchFailedSeedInserts,
  fetchPlantLibraryStats,
  fetchPlantLibraryUsageTotals,
  fetchRecentPlantLibraryRuns,
  fetchStuckVerifications,
  inspectPlantLibraryBatch,
  reprocessPlantLibraryBatch,
  sweepStalePlantLibraryRuns,
  markRunAsFailed,
  submitPlantLibraryBatch,
  triggerSeedRun,
  triggerVerifyRun,
  type FailedSeedInsert,
  type PlantLibraryBatch,
  type PlantLibraryRun,
  type PlantLibraryRunModelUsage,
  type PlantLibraryRunSchedule,
  type PlantLibraryStats,
  type PlantLibraryUsageTotals,
  type StuckPlantRow,
} from "../../services/plantLibraryAdminService";
import {
  GEMINI_PRICES,
  breakdownModelCost,
  formatUsd as formatUsdDetailed,
} from "../../lib/geminiPricing";
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
  const [failedInserts, setFailedInserts] = useState<FailedSeedInsert[]>([]);
  const [usageTotals, setUsageTotals] = useState<PlantLibraryUsageTotals | null>(null);
  const [schedules, setSchedules] = useState<PlantLibraryRunSchedule[]>([]);
  const [batches, setBatches] = useState<PlantLibraryBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [seedCount, setSeedCount] = useState(100);
  const [verifyCount, setVerifyCount] = useState(500);
  const [batchCount, setBatchCount] = useState(1000);
  const [batchTotalRuns, setBatchTotalRuns] = useState(1);
  const [batchIntervalMinutes, setBatchIntervalMinutes] = useState(30);
  const [batchScheduleOpen, setBatchScheduleOpen] = useState(false);
  const [batchEstimate, setBatchEstimate] = useState<number | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [submittingBatch, setSubmittingBatch] = useState(false);
  // Per-batch inspect state — keyed by batch id. Truthy while the
  // round-trip to Gemini is in flight so we can spin the icon.
  const [inspectingBatchIds, setInspectingBatchIds] = useState<Record<string, boolean>>({});
  const [reprocessingBatchIds, setReprocessingBatchIds] = useState<Record<string, boolean>>({});
  // Repeat-with-interval state — one row of inputs per kind. When
  // `totalRuns === 1` we fire immediately as before; otherwise we
  // insert a `plant_library_run_schedules` row and the minute cron
  // dispatches it.
  const [seedTotalRuns, setSeedTotalRuns] = useState(1);
  const [seedIntervalMinutes, setSeedIntervalMinutes] = useState(10);
  const [verifyTotalRuns, setVerifyTotalRuns] = useState(1);
  const [verifyIntervalMinutes, setVerifyIntervalMinutes] = useState(10);

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

      // allSettled — one transient network blip (TypeError: Failed
      // to fetch) shouldn't void all 7 results. Each fetch fails
      // independently; we update whatever came back and keep the
      // previous value for the rest (no UI flicker), logging any
      // failures so we can spot a consistent regression.
      const [statsR, runsR, stuckR, totalsR, failedR, schedulesR, batchesR] =
        await Promise.allSettled([
          fetchPlantLibraryStats(),
          fetchRecentPlantLibraryRuns(MAX_RUNS),
          fetchStuckVerifications(25),
          fetchPlantLibraryUsageTotals(),
          fetchFailedSeedInserts(50),
          fetchActivePlantLibrarySchedules(),
          fetchActivePlantLibraryBatches(),
        ]);
      if (statsR.status === "fulfilled") setStats(statsR.value);
      else Logger.error("PlantLibraryAdmin: stats fetch failed", statsR.reason);
      if (runsR.status === "fulfilled") setRuns(runsR.value);
      else Logger.error("PlantLibraryAdmin: runs fetch failed", runsR.reason);
      if (stuckR.status === "fulfilled") setStuck(stuckR.value);
      else Logger.error("PlantLibraryAdmin: stuck verifications fetch failed", stuckR.reason);
      if (totalsR.status === "fulfilled") setUsageTotals(totalsR.value);
      else Logger.error("PlantLibraryAdmin: usage totals fetch failed", totalsR.reason);
      if (failedR.status === "fulfilled") setFailedInserts(failedR.value);
      else Logger.error("PlantLibraryAdmin: failed inserts fetch failed", failedR.reason);
      if (schedulesR.status === "fulfilled") setSchedules(schedulesR.value);
      else Logger.error("PlantLibraryAdmin: schedules fetch failed", schedulesR.reason);
      if (batchesR.status === "fulfilled") setBatches(batchesR.value);
      else Logger.error("PlantLibraryAdmin: batches fetch failed", batchesR.reason);
    } catch (err) {
      Logger.error("PlantLibraryAdmin refresh failed", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Poll while any run is still going OR any schedule is queued (so
  // the next-fire countdown stays fresh and dispatched continuations
  // show up promptly).
  const anyRunning = useMemo(
    () => runs.some((r) => r.status === "running"),
    [runs],
  );
  const anySchedulesActive = schedules.length > 0;
  // Only NON-terminal batches drive polling. Terminal ones (failed /
  // processed / cancelled) are surfaced in the panel for context
  // but shouldn't keep the polling loop alive.
  const anyBatchesPending = batches.some(
    (b) => b.status === "submitting" || b.status === "pending" || b.status === "running" || b.status === "succeeded",
  );
  const shouldPoll = anyRunning || anySchedulesActive || anyBatchesPending;
  useEffect(() => {
    if (!shouldPoll) {
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
  }, [shouldPoll, refresh]);

  const handleSeed = async () => {
    if (seeding) return;
    setSeeding(true);
    try {
      if (seedTotalRuns > 1) {
        await createPlantLibrarySchedule({
          kind: "seed",
          countPerRun: seedCount,
          totalRuns: seedTotalRuns,
          intervalMinutes: seedIntervalMinutes,
        });
        toast.success(
          `Scheduled ${seedTotalRuns} seed runs (${seedCount} plants each, every ${seedIntervalMinutes} min).`,
        );
      } else {
        await triggerSeedRun(seedCount, userId);
        toast.success(`Seeding ${seedCount} plants in the background.`);
      }
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
      if (verifyTotalRuns > 1) {
        await createPlantLibrarySchedule({
          kind: "verify",
          countPerRun: verifyCount,
          totalRuns: verifyTotalRuns,
          intervalMinutes: verifyIntervalMinutes,
        });
        toast.success(
          `Scheduled ${verifyTotalRuns} verify runs (${verifyCount} plants each, every ${verifyIntervalMinutes} min).`,
        );
      } else {
        await triggerVerifyRun(verifyCount, userId);
        toast.success(`Verifying up to ${verifyCount} plants in the background.`);
      }
      refresh();
    } catch (err) {
      Logger.error("Verify trigger failed", err);
      toast.error("Couldn't start the verify run — check the function logs.");
    } finally {
      setVerifying(false);
    }
  };

  // Refresh the batch cost estimate whenever the count changes.
  // Pulls median $/plant from recent successful seed runs ×
  // batchCount × 0.5 (batch discount).
  useEffect(() => {
    let cancelled = false;
    estimatePlantLibrarySeedCost(batchCount, { batch: true })
      .then((est) => {
        if (!cancelled) setBatchEstimate(est);
      })
      .catch((err) => {
        Logger.error("Batch cost estimate failed", err);
        if (!cancelled) setBatchEstimate(null);
      });
    return () => {
      cancelled = true;
    };
  }, [batchCount]);

  const handleSubmitBatch = async () => {
    if (submittingBatch) return;
    const scheduling = batchTotalRuns > 1;
    const confirmMsg = scheduling
      ? `Schedule ${batchTotalRuns} batches of ${batchCount} plants every ${batchIntervalMinutes} min? The minute cron dispatches each automatically.`
      : `Submit a batch of ${batchCount} plants to Gemini? Results land in 1-24 hours; the 5-min poll cron processes them automatically.`;
    if (!window.confirm(confirmMsg)) return;
    setSubmittingBatch(true);
    try {
      if (scheduling) {
        await createPlantLibrarySchedule({
          kind: "batch",
          countPerRun: batchCount,
          totalRuns: batchTotalRuns,
          intervalMinutes: batchIntervalMinutes,
        });
        toast.success(
          `Scheduled ${batchTotalRuns} batches of ${batchCount} plants every ${batchIntervalMinutes} min.`,
        );
      } else {
        const result = await submitPlantLibraryBatch(batchCount, userId);
        toast.success(
          `Batch ${result.batch_id.slice(0, 8)}… queued — gathering candidates from sources (30-90s). Estimated cost: $${result.estimated_cost_usd.toFixed(4)}`,
        );
      }
      refresh();
    } catch (err) {
      Logger.error("Batch submit failed", err);
      // Postgres errors come back as plain objects with .message /
      // .details / .hint / .code rather than Error instances, so
      // `err instanceof Error` would fall through to "Unknown error".
      // This covers Postgres errors, edge function errors, and real
      // JS Error instances.
      const msg = formatBatchError(err);
      toast.error(`Couldn't ${scheduling ? "schedule" : "submit"} batch — ${msg}`);
    } finally {
      setSubmittingBatch(false);
    }
  };

  const handleInspectBatch = async (id: string) => {
    if (inspectingBatchIds[id]) return;
    setInspectingBatchIds((prev) => ({ ...prev, [id]: true }));
    try {
      const result = await inspectPlantLibraryBatch(id);
      // Show Gemini's raw state verbatim — that's the whole point of
      // this button (admin sees JOB_STATE_PENDING / BATCH_STATE_*
      // exactly as the docs describe). Defensive: only enter the
      // success branch when raw_state is a non-empty string,
      // otherwise fall through to error / mapped status so we never
      // render a misleading "Gemini reports:" with nothing after it.
      const rawState = typeof result.raw_state === "string" ? result.raw_state.trim() : "";
      if (rawState) {
        const extras: string[] = [];
        // Compare normalised suffix so both JOB_STATE_* and
        // BATCH_STATE_* read as identical to our mapped status.
        const normalisedSuffix = rawState.replace(/^(JOB|BATCH)_STATE_/, "").toLowerCase();
        const equivalentMappings: Record<string, string> = {
          succeeded: "processed", // Gemini SUCCEEDED → we may have already processed
          expired: "failed",
        };
        if (
          result.mapped_status &&
          result.mapped_status !== normalisedSuffix &&
          equivalentMappings[normalisedSuffix] !== result.mapped_status
        ) {
          extras.push(`our status: ${result.mapped_status}`);
        }
        if (result.error) extras.push(`note: ${result.error}`);
        const suffix = extras.length ? ` (${extras.join(" · ")})` : "";
        toast.success(`Gemini reports: ${rawState}${suffix}`, { duration: 6000 });
      } else if (result.error) {
        toast.error(`Status check failed: ${result.error}`, { duration: 6000 });
      } else {
        toast(`No live state from Gemini — our status: ${result.mapped_status}`, { duration: 6000 });
      }
      refresh();
    } catch (err) {
      Logger.error("inspect batch failed", err);
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Status check failed — ${msg}`);
    } finally {
      setInspectingBatchIds((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  const handleReprocessBatch = async (id: string) => {
    if (reprocessingBatchIds[id]) return;
    if (!window.confirm(
      "Re-fetch results from Gemini and re-insert plants? Gemini retains batch results for 48 hours after completion; this works as long as the batch finished within that window.",
    )) {
      return;
    }
    setReprocessingBatchIds((prev) => ({ ...prev, [id]: true }));
    try {
      const result = await reprocessPlantLibraryBatch(id);
      toast.success(
        `Re-processed — Gemini state: ${result.raw_state ?? "(unknown)"} · our status: ${result.mapped_status}`,
        { duration: 6000 },
      );
      refresh();
    } catch (err) {
      Logger.error("reprocess batch failed", err);
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Reprocess failed — ${msg}`);
    } finally {
      setReprocessingBatchIds((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  const handleCancelBatch = async (id: string) => {
    if (!window.confirm("Cancel this batch? In-flight work at Gemini may still be billed even after cancel.")) {
      return;
    }
    try {
      await cancelPlantLibraryBatch(id);
      toast.success("Batch cancelled.");
      refresh();
    } catch (err) {
      Logger.error("Cancel batch failed", err);
      toast.error("Couldn't cancel the batch.");
    }
  };

  const handleCancelSchedule = async (id: string) => {
    try {
      await cancelPlantLibrarySchedule(id);
      toast.success("Schedule cancelled.");
      refresh();
    } catch (err) {
      Logger.error("Cancel schedule failed", err);
      toast.error("Couldn't cancel the schedule.");
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
            totalRuns={seedTotalRuns}
            setTotalRuns={setSeedTotalRuns}
            intervalMinutes={seedIntervalMinutes}
            setIntervalMinutes={setSeedIntervalMinutes}
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
            totalRuns={verifyTotalRuns}
            setTotalRuns={setVerifyTotalRuns}
            intervalMinutes={verifyIntervalMinutes}
            setIntervalMinutes={setVerifyIntervalMinutes}
          />
        </div>
      </section>

      {/* Batch seed — Gemini Batch API submission. 50% cheaper than
          synchronous runs; results land in 1-24h via the 5-min poll
          cron. Sits in its own card so it's visually distinct from
          the synchronous Run controls. */}
      <section
        data-testid="plant-library-admin-batch"
        className="rounded-3xl bg-white border border-rhozly-primary/25 p-5 shadow-[0_2px_12px_-4px_rgba(7,87,55,0.08)] space-y-4"
      >
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-rhozly-primary/10 p-2 text-rhozly-primary">
            <Layers size={18} />
          </div>
          <div className="flex-1">
            <h2 className="font-display font-black text-rhozly-on-surface text-sm">
              Batch seed (50% off)
            </h2>
            <p className="text-xs text-rhozly-on-surface/65 leading-snug">
              Submit one big batch to Gemini's Batch API. Pays half the rate of synchronous runs but takes 1-24 hours to complete (usually much sooner). The 5-min poll cron processes results as they land and creates a normal Recent Run row with the full per-model breakdown.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-start">
          <div className="space-y-2">
            <label className="block">
              <span className="block text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/55 mb-1">
                Plants per batch
              </span>
              <input
                type="number"
                min={1}
                max={10000}
                value={batchCount}
                onChange={(e) => {
                  const next = parseInt(e.target.value, 10);
                  if (Number.isFinite(next)) setBatchCount(Math.max(1, Math.min(10000, next)));
                }}
                className="w-full px-3 py-2 min-h-[40px] rounded-xl bg-white border border-rhozly-outline/20 text-sm font-bold text-rhozly-on-surface focus:outline-none focus:border-rhozly-primary/40 focus:ring-2 focus:ring-rhozly-primary/15"
              />
            </label>
            <div className="text-[11px] text-rhozly-on-surface/65 leading-snug">
              {batchEstimate != null && batchEstimate > 0 ? (
                <>
                  Estimated cost:{" "}
                  <span className="font-black text-emerald-700">
                    {formatUsdDetailed(batchEstimate)}
                  </span>
                  <span className="text-rhozly-on-surface/45"> (median $/plant from your last 5 seed runs × 0.5 batch discount). Final cost in the resulting Recent Run row.</span>
                </>
              ) : (
                <>Estimated cost will appear once at least one synchronous seed run has completed (no historical baseline yet).</>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={handleSubmitBatch}
            disabled={submittingBatch}
            data-testid="plant-library-admin-submit-batch"
            className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] rounded-xl bg-rhozly-primary text-white text-[11px] font-black uppercase tracking-widest hover:opacity-95 disabled:opacity-50 whitespace-nowrap"
          >
            {submittingBatch
              ? <Loader2 size={13} className="animate-spin" />
              : <Layers size={13} />}
            {batchTotalRuns > 1 ? `Schedule ${batchTotalRuns}×` : "Submit batch"}
          </button>
        </div>

        {/* Repeat & schedule disclosure — same pattern as the
            sync seed/verify blocks. When totalRuns > 1, the submit
            button schedules N batches via the minute-tick cron
            instead of firing one immediately. Set it up and walk
            away — best ROI for high-volume ingestion. */}
        <div>
          <button
            type="button"
            onClick={() => setBatchScheduleOpen((v) => !v)}
            className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/55 hover:text-rhozly-primary"
          >
            {batchScheduleOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            Repeat &amp; schedule
          </button>
          {batchScheduleOpen && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="block">
                <span className="block text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/55 mb-1">
                  Number of batches
                </span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={batchTotalRuns}
                  onChange={(e) => {
                    const next = parseInt(e.target.value, 10);
                    if (Number.isFinite(next)) setBatchTotalRuns(Math.max(1, Math.min(100, next)));
                  }}
                  className="w-full px-3 py-2 min-h-[36px] rounded-xl bg-white border border-rhozly-outline/20 text-sm font-bold text-rhozly-on-surface focus:outline-none focus:border-rhozly-primary/40 focus:ring-2 focus:ring-rhozly-primary/15"
                />
              </label>
              <label className="block">
                <span className="block text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/55 mb-1">
                  Minutes between
                </span>
                <input
                  type="number"
                  min={5}
                  max={1440}
                  value={batchIntervalMinutes}
                  onChange={(e) => {
                    const next = parseInt(e.target.value, 10);
                    if (Number.isFinite(next)) setBatchIntervalMinutes(Math.max(5, Math.min(1440, next)));
                  }}
                  className="w-full px-3 py-2 min-h-[36px] rounded-xl bg-white border border-rhozly-outline/20 text-sm font-bold text-rhozly-on-surface focus:outline-none focus:border-rhozly-primary/40 focus:ring-2 focus:ring-rhozly-primary/15"
                />
              </label>
              {batchTotalRuns > 1 && (
                <p className="col-span-2 text-[11px] text-rhozly-on-surface/65 leading-snug">
                  Will dispatch <strong>{batchTotalRuns}</strong> batches of <strong>{batchCount}</strong> plants, every <strong>{batchIntervalMinutes} min</strong>. Total target: ~<strong>{(batchTotalRuns * batchCount).toLocaleString()}</strong> plants. First batch fires on the next minute tick.
                </p>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Batches panel — in-flight + recently completed (last 24h).
          Failed/cancelled rows show their reason inline so you
          notice them on next visit without hunting the DB; processed
          rows link out to the resulting Recent Runs entry. */}
      {batches.length > 0 && (
        <section
          data-testid="plant-library-admin-pending-batches"
          className="rounded-3xl bg-white border border-rhozly-primary/25 shadow-[0_2px_12px_-4px_rgba(7,87,55,0.08)] overflow-hidden"
        >
          <div className="px-5 py-3 border-b border-rhozly-primary/15 bg-rhozly-primary/5 flex items-center justify-between">
            <div>
              <h2 className="font-display font-black text-rhozly-on-surface text-sm flex items-center gap-1.5">
                <Layers size={14} className="text-rhozly-primary" />
                Batches
              </h2>
              <p className="text-[11px] text-rhozly-on-surface/70 leading-snug">
                Gemini Batch API submissions in flight + anything that finished in the last 24 hours. Failed batches keep their error message inline so you can see what went wrong without browsing the DB.
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-rhozly-surface-low/40 text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/50">
                <tr>
                  <th className="text-left px-3 py-2">Submitted</th>
                  <th className="text-right px-3 py-2">Plants</th>
                  <th className="text-left px-3 py-2">Model</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-left px-3 py-2">Last polled</th>
                  <th className="text-right px-3 py-2">Est. cost</th>
                  <th className="text-right px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => {
                  const isTerminal =
                    b.status === "failed" || b.status === "processed" || b.status === "cancelled";
                  return (
                    <React.Fragment key={b.id}>
                      <tr className="border-t border-rhozly-outline/10">
                        <td className="px-3 py-2 text-rhozly-on-surface/70 whitespace-nowrap">
                          {new Date(b.submitted_at).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}
                        </td>
                        <td className="px-3 py-2 text-right font-bold text-rhozly-on-surface">
                          {b.count_requested.toLocaleString()}
                        </td>
                        <td className="px-3 py-2">
                          <code className="font-mono text-[10px] text-rhozly-on-surface/70">{b.model}</code>
                        </td>
                        <td className="px-3 py-2">
                          <span className={
                            `inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${
                              b.status === "succeeded" || b.status === "processed"
                                ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                                : b.status === "failed" || b.status === "cancelled"
                                ? "bg-rose-50 text-rose-800 border-rose-100"
                                : "bg-rhozly-primary/10 text-rhozly-primary border-rhozly-primary/20"
                            }`
                          }>
                            {(b.status === "pending" || b.status === "running") && (
                              <Loader2 size={9} className="animate-spin" />
                            )}
                            {b.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-rhozly-on-surface/70 whitespace-nowrap">
                          {b.last_polled_at
                            ? new Date(b.last_polled_at).toLocaleString(undefined, { timeStyle: "short" })
                            : "—"}
                        </td>
                        <td className="px-3 py-2 text-right text-emerald-700 whitespace-nowrap">
                          {b.estimated_cost_usd != null
                            ? formatUsdDetailed(Number(b.estimated_cost_usd))
                            : "—"}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="inline-flex items-center gap-1 justify-end flex-wrap">
                            {b.gemini_batch_name && (
                              <button
                                type="button"
                                data-testid={`plant-library-batch-inspect-${b.id}`}
                                onClick={() => handleInspectBatch(b.id)}
                                disabled={!!inspectingBatchIds[b.id]}
                                title="Check Gemini for the live JOB_STATE_* and update last_polled_at"
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-rhozly-primary/30 text-rhozly-primary hover:bg-rhozly-primary/10 text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                              >
                                {inspectingBatchIds[b.id]
                                  ? <Loader2 size={11} className="animate-spin" />
                                  : <Activity size={11} />}
                                Check
                              </button>
                            )}
                            {!isTerminal && (
                              <button
                                type="button"
                                data-testid={`plant-library-batch-cancel-${b.id}`}
                                onClick={() => handleCancelBatch(b.id)}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 text-[10px] font-black uppercase tracking-widest"
                              >
                                <X size={11} />
                                Cancel
                              </button>
                            )}
                            {b.status === "processed" && b.gemini_batch_name && (
                              <button
                                type="button"
                                data-testid={`plant-library-batch-reprocess-${b.id}`}
                                onClick={() => handleReprocessBatch(b.id)}
                                disabled={!!reprocessingBatchIds[b.id]}
                                title="Re-fetch results from Gemini and re-insert plants (works within Gemini's 48h retention window)"
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-amber-300 text-amber-800 hover:bg-amber-50 text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                              >
                                {reprocessingBatchIds[b.id]
                                  ? <Loader2 size={11} className="animate-spin" />
                                  : <RotateCcw size={11} />}
                                Reprocess
                              </button>
                            )}
                            {b.status === "processed" && b.processed_at && (
                              <span className="text-[10px] text-rhozly-on-surface/55 whitespace-nowrap">
                                ✓ {new Date(b.processed_at).toLocaleString(undefined, { timeStyle: "short" })}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                      {/* Sub-row for failure / cancellation context — only
                          renders when we have something useful to say. */}
                      {(b.status === "failed" || b.status === "cancelled") && b.error_message && (
                        <tr className="bg-rose-50/30 border-t border-rose-100/40">
                          <td colSpan={7} className="px-5 py-2 text-[11px] text-rose-800">
                            <span className="font-black mr-1">Reason:</span>
                            <code className="text-[10px] whitespace-pre-wrap break-words leading-snug">
                              {b.error_message}
                            </code>
                          </td>
                        </tr>
                      )}
                      {/* Processed → point at the resulting run for the
                          per-model + per-token-type breakdown. */}
                      {b.status === "processed" && b.result_run_id && (
                        <tr className="bg-emerald-50/30 border-t border-emerald-100/40">
                          <td colSpan={7} className="px-5 py-2 text-[11px] text-emerald-800">
                            <span className="font-black mr-1">Processed →</span>
                            See the matching row in Recent runs below for the full per-model cost breakdown (run id: <code className="text-[10px]">{b.result_run_id.slice(0, 8)}…</code>).
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Active schedules — repeat-with-interval runs queued by the
          minute cron. Only renders when at least one is active so the
          page stays clean for the single-run flow. */}
      {schedules.length > 0 && (
        <section
          data-testid="plant-library-admin-schedules"
          className="rounded-3xl bg-white border border-rhozly-primary/25 shadow-[0_2px_12px_-4px_rgba(7,87,55,0.08)] overflow-hidden"
        >
          <div className="px-5 py-3 border-b border-rhozly-primary/15 bg-rhozly-primary/5 flex items-center justify-between">
            <div>
              <h2 className="font-display font-black text-rhozly-on-surface text-sm flex items-center gap-1.5">
                <CalendarClock size={14} className="text-rhozly-primary" />
                Active schedules
              </h2>
              <p className="text-[11px] text-rhozly-on-surface/70 leading-snug">
                Repeat-with-interval runs. The minute cron fires the next invocation when its time slot comes up — survives browser close and deploys. Cancel skips any remaining fires.
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-rhozly-surface-low/40 text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/50">
                <tr>
                  <th className="text-left px-3 py-2">Kind</th>
                  <th className="text-right px-3 py-2">Per run</th>
                  <th className="text-right px-3 py-2">Progress</th>
                  <th className="text-left px-3 py-2">Next fire</th>
                  <th className="text-left px-3 py-2">Last error</th>
                  <th className="text-right px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {schedules.map((s) => (
                  <tr key={s.id} className="border-t border-rhozly-outline/10">
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border bg-white text-rhozly-primary border-rhozly-primary/20">
                        {s.kind}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-bold text-rhozly-on-surface">
                      {s.count_per_run}
                    </td>
                    <td className="px-3 py-2 text-right text-rhozly-on-surface/80">
                      {s.runs_completed} of {s.total_runs}
                    </td>
                    <td className="px-3 py-2 text-rhozly-on-surface/70 whitespace-nowrap">
                      {formatNextFire(s.next_run_at, s.interval_minutes)}
                    </td>
                    <td className="px-3 py-2 text-rhozly-on-surface/70 max-w-md">
                      {s.last_error ? (
                        <code className="text-[10px] text-rose-700 whitespace-pre-wrap break-words leading-snug">
                          {s.last_error}
                        </code>
                      ) : (
                        <span className="text-rhozly-on-surface/40">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        data-testid={`plant-library-schedule-cancel-${s.id}`}
                        onClick={() => handleCancelSchedule(s.id)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 text-[10px] font-black uppercase tracking-widest"
                      >
                        <X size={11} />
                        Cancel
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

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

      {/* Failed seed entries — covers BOTH per-row insert failures
          (type mismatch, NOT NULL violation, etc) AND batch-level
          failures (Gemini cascade exhausted, parse failures,
          Wikipedia returned no candidates, all candidates already in
          DB, etc). Batch failures appear as a single row with
          common_name "(batch of N plants)". Mirrors the "Stuck
          verifications" panel above. */}
      {failedInserts.length > 0 && (
        <section
          data-testid="plant-library-admin-failed-inserts"
          className="rounded-3xl bg-white border border-rose-200 shadow-[0_2px_12px_-4px_rgba(7,87,55,0.08)] overflow-hidden"
        >
          <div className="px-5 py-3 border-b border-rose-100 bg-rose-50 flex items-center justify-between">
            <div>
              <h2 className="font-display font-black text-rose-900 text-sm">
                Failed seed entries
              </h2>
              <p className="text-[11px] text-rose-800/80 leading-snug">
                Plants and batches the seeder couldn't add. Includes per-row insert errors (type mismatch, constraint violation) AND batch-level failures (Gemini cascade exhausted, no usable candidates from Wikipedia, etc). The unique-index "already exists" silent-skip case is not shown.
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-rhozly-surface-low/40 text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/50">
                <tr>
                  <th className="text-left px-3 py-2">Plant</th>
                  <th className="text-left px-3 py-2">Error</th>
                  <th className="text-left px-3 py-2">When</th>
                </tr>
              </thead>
              <tbody>
                {failedInserts.map((f, i) => (
                  <tr key={`${f.run_id}-${i}`} className="border-t border-rhozly-outline/10">
                    <td className="px-3 py-2">
                      <div className="font-bold text-rhozly-on-surface">{f.common_name}</div>
                      {f.scientific_name && (
                        <div className="text-[10px] italic text-rhozly-on-surface/55">
                          {f.scientific_name}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-rhozly-on-surface/70 max-w-md">
                      <code className="text-[10px] whitespace-pre-wrap break-words leading-snug">
                        {f.error}
                      </code>
                    </td>
                    <td className="px-3 py-2 text-rhozly-on-surface/55 whitespace-nowrap">
                      {f.at
                        ? new Date(f.at).toLocaleString(undefined, {
                            dateStyle: "short",
                            timeStyle: "short",
                          })
                        : "—"}
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

      {/* Reference — Gemini model pricing. Source of truth for the
          cost math used everywhere on this page. Update both this and
          supabase/functions/_shared/geminiCost.ts when Google
          publishes new rates. */}
      <section
        data-testid="plant-library-admin-pricing"
        className="rounded-3xl bg-white border border-rhozly-outline/15 shadow-[0_2px_12px_-4px_rgba(7,87,55,0.08)] overflow-hidden"
      >
        <div className="px-5 py-3 border-b border-rhozly-outline/10">
          <h2 className="font-display font-black text-rhozly-on-surface text-sm">
            Gemini model pricing (per 1M tokens)
          </h2>
          <p className="text-[11px] text-rhozly-on-surface/60 leading-snug">
            Confirmed against{" "}
            <a
              href="https://ai.google.dev/gemini-api/docs/pricing"
              target="_blank"
              rel="noreferrer"
              className="underline text-rhozly-primary"
            >
              ai.google.dev/gemini-api/docs/pricing
            </a>
            . Cascade reads top-to-bottom — falling all the way to gemini-3.5-flash is ~15× the cost of the top rung.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-rhozly-surface-low/40 text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/50">
              <tr>
                <th className="text-left px-3 py-2">Model</th>
                <th className="text-right px-3 py-2">Input</th>
                <th className="text-right px-3 py-2">Cached input</th>
                <th className="text-right px-3 py-2">Output</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(GEMINI_PRICES).map(([model, rate]) => (
                <tr key={model} className="border-t border-rhozly-outline/10">
                  <td className="px-3 py-2">
                    <code className="font-mono text-[11px] text-rhozly-on-surface">{model}</code>
                  </td>
                  <td className="px-3 py-2 text-right text-rhozly-on-surface/80">
                    ${rate.input.toFixed(3).replace(/\.?0+$/, "")}
                  </td>
                  <td className="px-3 py-2 text-right text-rhozly-on-surface/60">
                    ${rate.cache.toFixed(3).replace(/\.?0+$/, "")}
                  </td>
                  <td className="px-3 py-2 text-right text-rhozly-on-surface/80">
                    ${rate.output.toFixed(2).replace(/\.?0+$/, "")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
        </>
      )}
    </div>
  );
}

/**
 * Extract a human-readable message from any error shape we might
 * get back from the batch submit flow:
 *   - JS Error instance: `err.message`
 *   - Postgres error object (from supabase-js): `err.message`
 *     plus optional `.details` / `.hint` / `.code`
 *   - Edge function FunctionsHttpError: nested error structure
 *   - Anything else: stringify defensively
 */
function formatBatchError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    if (typeof e.message === "string" && e.message) {
      const code = typeof e.code === "string" || typeof e.code === "number" ? ` (${e.code})` : "";
      const hint = typeof e.hint === "string" && e.hint ? ` · hint: ${e.hint}` : "";
      return `${e.message}${code}${hint}`;
    }
    if (typeof e.error === "string") return e.error;
    if (e.error && typeof e.error === "object") {
      const inner = e.error as Record<string, unknown>;
      if (typeof inner.message === "string") return inner.message;
    }
  }
  return typeof err === "string" ? err : "Unknown error";
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
  totalRuns,
  setTotalRuns,
  intervalMinutes,
  setIntervalMinutes,
}: {
  title: string;
  description: string;
  count: number;
  setCount: (n: number) => void;
  max: number;
  running: boolean;
  onRun: () => void;
  buttonLabel: string;
  totalRuns: number;
  setTotalRuns: (n: number) => void;
  intervalMinutes: number;
  setIntervalMinutes: (n: number) => void;
}) {
  // Disclosure opens automatically when totalRuns is already > 1
  // (e.g. when an admin returns to the page mid-flow).
  const [scheduleOpen, setScheduleOpen] = useState(totalRuns > 1);
  const scheduling = totalRuns > 1;
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
          {scheduling ? `Schedule ${totalRuns}×` : buttonLabel}
        </button>
      </div>

      {/* Collapsible "Repeat & schedule" disclosure — invisible noise
          on the single-run path but right there when you want to set
          up a queue and walk away. */}
      <div>
        <button
          type="button"
          onClick={() => setScheduleOpen((v) => !v)}
          className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/55 hover:text-rhozly-primary"
        >
          {scheduleOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          Repeat &amp; schedule
        </button>
        {scheduleOpen && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="block">
              <span className="block text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/55 mb-1">
                Number of runs
              </span>
              <input
                type="number"
                min={1}
                max={100}
                value={totalRuns}
                onChange={(e) => {
                  const next = parseInt(e.target.value, 10);
                  if (Number.isFinite(next)) setTotalRuns(Math.max(1, Math.min(100, next)));
                }}
                className="w-full px-3 py-2 min-h-[36px] rounded-xl bg-white border border-rhozly-outline/20 text-sm font-bold text-rhozly-on-surface focus:outline-none focus:border-rhozly-primary/40 focus:ring-2 focus:ring-rhozly-primary/15"
              />
            </label>
            <label className="block">
              <span className="block text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/55 mb-1">
                Minutes between
              </span>
              <input
                type="number"
                min={1}
                max={1440}
                value={intervalMinutes}
                onChange={(e) => {
                  const next = parseInt(e.target.value, 10);
                  if (Number.isFinite(next)) setIntervalMinutes(Math.max(1, Math.min(1440, next)));
                }}
                className="w-full px-3 py-2 min-h-[36px] rounded-xl bg-white border border-rhozly-outline/20 text-sm font-bold text-rhozly-on-surface focus:outline-none focus:border-rhozly-primary/40 focus:ring-2 focus:ring-rhozly-primary/15"
              />
            </label>
            {scheduling && (
              <p className="col-span-2 text-[11px] text-rhozly-on-surface/65 leading-snug">
                Will dispatch <strong>{totalRuns}</strong> runs of <strong>{count}</strong> plants, every <strong>{intervalMinutes} min</strong>. First fire within 60s. Survives browser close.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Human-friendly "next fire" label. Past timestamps show "any second
 * now" (a tick is imminent); future ones show "in N min" / "in N s".
 */
function formatNextFire(iso: string, intervalMinutes: number): string {
  const now = Date.now();
  const target = new Date(iso).getTime();
  const diffMs = target - now;
  if (diffMs <= 0) return "any second now";
  const diffSec = Math.round(diffMs / 1000);
  if (diffSec < 60) return `in ${diffSec}s`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 90) return `in ${diffMin} min`;
  // Interval is small relative to absolute time → just show wall clock.
  void intervalMinutes;
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function RunRow({ run, onStop }: { run: PlantLibraryRun; onStop: () => void }) {
  const [stopping, setStopping] = useState(false);
  const [expanded, setExpanded] = useState(false);
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

  // The expand chevron only makes sense when there's something to
  // show — i.e. the run did at least one AI call. Pre-12.0058 rows
  // and zero-cost runs collapse cleanly.
  const hasBreakdown = run.total_tokens > 0 || Object.keys(run.model_usage ?? {}).length > 0;

  return (
    <>
      <tr className="border-t border-rhozly-outline/10">
        <td className="px-3 py-2 text-rhozly-on-surface/70 whitespace-nowrap">
          <button
            type="button"
            onClick={() => hasBreakdown && setExpanded((v) => !v)}
            disabled={!hasBreakdown}
            data-testid={`plant-library-run-${run.id}-expand`}
            className="inline-flex items-center gap-1.5 hover:text-rhozly-primary disabled:cursor-default disabled:hover:text-rhozly-on-surface/70 text-left"
            aria-expanded={expanded}
            title={hasBreakdown ? "Show cost breakdown" : "No AI calls in this run"}
          >
            {hasBreakdown ? (
              expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />
            ) : (
              <span className="inline-block w-3" />
            )}
            {started.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}
          </button>
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
      {expanded && hasBreakdown && (
        <tr className="border-t border-rhozly-outline/5 bg-rhozly-surface-low/30">
          <td colSpan={12} className="px-5 py-4">
            <RunCostBreakdown run={run} />
          </td>
        </tr>
      )}
    </>
  );
}

/**
 * Per-row expanded view: aggregate token-type breakdown on the left,
 * per-model mini-cards on the right. Sums the per-model buckets to
 * derive the aggregate breakdown (so a single price formula is the
 * source of truth — totals_cost_usd is for the headline; we recompute
 * here so the line items add up).
 */
function RunCostBreakdown({ run }: { run: PlantLibraryRun }) {
  const modelEntries = Object.entries(run.model_usage ?? {}).filter(
    ([, u]) => (u.prompt_tokens ?? 0) > 0 || (u.candidates_tokens ?? 0) > 0,
  );

  if (modelEntries.length === 0) {
    return (
      <div className="text-[11px] text-rhozly-on-surface/55 italic">
        No per-model breakdown — this run pre-dates per-model cost tracking (12.0058).
        The aggregate totals shown above are still accurate.
      </div>
    );
  }

  // Aggregate breakdown across all models — derived from per-model
  // buckets so the line items always add up to the displayed total.
  const aggregateBreakdown = modelEntries.reduce(
    (acc, [model, usage]) => {
      const b = breakdownModelCost(model, usage);
      acc.fresh_input_tokens  += b.fresh_input_tokens;
      acc.fresh_input_cost    += b.fresh_input_cost;
      acc.cached_input_tokens += b.cached_input_tokens;
      acc.cached_input_cost   += b.cached_input_cost;
      acc.output_tokens       += b.output_tokens;
      acc.output_cost         += b.output_cost;
      acc.thinking_tokens     += b.thinking_tokens;
      acc.thinking_cost       += b.thinking_cost;
      acc.total_cost          += b.total_cost;
      return acc;
    },
    {
      fresh_input_tokens: 0, fresh_input_cost: 0,
      cached_input_tokens: 0, cached_input_cost: 0,
      output_tokens: 0, output_cost: 0,
      thinking_tokens: 0, thinking_cost: 0,
      total_cost: 0,
    },
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Aggregate breakdown */}
      <div className="rounded-2xl bg-white border border-rhozly-outline/15 p-3">
        <h3 className="font-display font-black text-rhozly-on-surface text-xs mb-2">
          Token-type breakdown (all models)
        </h3>
        <table className="w-full text-[11px]">
          <thead className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/50">
            <tr>
              <th className="text-left py-1">Type</th>
              <th className="text-right py-1">Tokens</th>
              <th className="text-right py-1">Cost</th>
            </tr>
          </thead>
          <tbody>
            <BreakdownRow label="Fresh input" tokens={aggregateBreakdown.fresh_input_tokens} cost={aggregateBreakdown.fresh_input_cost} />
            <BreakdownRow label="Cached input" tokens={aggregateBreakdown.cached_input_tokens} cost={aggregateBreakdown.cached_input_cost} />
            <BreakdownRow label="Output" tokens={aggregateBreakdown.output_tokens} cost={aggregateBreakdown.output_cost} />
            <BreakdownRow label="Thinking" tokens={aggregateBreakdown.thinking_tokens} cost={aggregateBreakdown.thinking_cost} />
            <tr className="border-t border-rhozly-outline/15 font-bold">
              <td className="py-1">Total</td>
              <td className="text-right py-1 text-rhozly-on-surface">
                {formatTokens(
                  aggregateBreakdown.fresh_input_tokens +
                  aggregateBreakdown.cached_input_tokens +
                  aggregateBreakdown.output_tokens +
                  aggregateBreakdown.thinking_tokens,
                )}
              </td>
              <td className="text-right py-1 text-emerald-700">
                {formatUsdDetailed(aggregateBreakdown.total_cost)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Per-model cards */}
      <div className="space-y-3">
        <h3 className="font-display font-black text-rhozly-on-surface text-xs">
          Per-model breakdown
        </h3>
        {modelEntries.map(([model, usage]) => (
          <ModelUsageCard key={model} model={model} usage={usage} />
        ))}
      </div>
    </div>
  );
}

function BreakdownRow({ label, tokens, cost }: { label: string; tokens: number; cost: number }) {
  return (
    <tr className="border-t border-rhozly-outline/5">
      <td className="py-1 text-rhozly-on-surface/70">{label}</td>
      <td className="text-right py-1 text-rhozly-on-surface/70">
        {tokens > 0 ? formatTokens(tokens) : "—"}
      </td>
      <td className="text-right py-1 text-rhozly-on-surface/70">
        {cost > 0 ? formatUsdDetailed(cost) : "—"}
      </td>
    </tr>
  );
}

function ModelUsageCard({
  model,
  usage,
}: {
  model: string;
  usage: PlantLibraryRunModelUsage;
}) {
  const b = breakdownModelCost(model, usage);
  const rate = GEMINI_PRICES[model];
  const known = !!rate;
  return (
    <div className="rounded-2xl bg-white border border-rhozly-outline/15 p-3">
      <div className="flex items-baseline justify-between gap-2 flex-wrap mb-2">
        <div>
          <p className="font-mono text-[11px] font-black text-rhozly-on-surface">
            {model}
          </p>
          <p className="text-[10px] text-rhozly-on-surface/55">
            {usage.call_count.toLocaleString()} call{usage.call_count === 1 ? "" : "s"}
          </p>
        </div>
        <p className="text-[11px] font-bold text-emerald-700">
          {formatUsdDetailed(b.total_cost)}
        </p>
      </div>
      <table className="w-full text-[11px]">
        <tbody>
          <ModelLine
            label="Fresh input"
            tokens={b.fresh_input_tokens}
            rate={rate?.input}
            cost={b.fresh_input_cost}
            knownRate={known}
          />
          <ModelLine
            label="Cached input"
            tokens={b.cached_input_tokens}
            rate={rate?.cache}
            cost={b.cached_input_cost}
            knownRate={known}
          />
          <ModelLine
            label="Output"
            tokens={b.output_tokens}
            rate={rate?.output}
            cost={b.output_cost}
            knownRate={known}
          />
          <ModelLine
            label="Thinking"
            tokens={b.thinking_tokens}
            rate={rate?.output}
            cost={b.thinking_cost}
            knownRate={known}
          />
        </tbody>
      </table>
      {!known && (
        <p className="text-[10px] text-amber-700 mt-2">
          Unknown model — price table needs updating in <code>src/lib/geminiPricing.ts</code> + <code>geminiCost.ts</code>.
        </p>
      )}
    </div>
  );
}

function ModelLine({
  label,
  tokens,
  rate,
  cost,
  knownRate,
}: {
  label: string;
  tokens: number;
  rate: number | undefined;
  cost: number;
  knownRate: boolean;
}) {
  if (tokens === 0) return null;
  return (
    <tr className="border-t border-rhozly-outline/5">
      <td className="py-1 text-rhozly-on-surface/70 whitespace-nowrap">{label}</td>
      <td className="text-right py-1 text-rhozly-on-surface/70 whitespace-nowrap">
        {formatTokens(tokens)}
      </td>
      <td className="text-right py-1 text-rhozly-on-surface/50 whitespace-nowrap">
        {knownRate && rate != null ? `× $${rate}/M` : "× ?"}
      </td>
      <td className="text-right py-1 text-rhozly-on-surface/70 whitespace-nowrap">
        = {formatUsdDetailed(cost)}
      </td>
    </tr>
  );
}
