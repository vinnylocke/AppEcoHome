import React, { useState, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { Sparkles, Loader2, ChevronDown, AlertCircle, Brain, RefreshCw, X, CheckCircle2 } from "lucide-react";
import InfoTooltip from "./InfoTooltip";
import toast from "react-hot-toast";
import { requireOnline } from "../lib/requireOnline";
import {
  analyseArea,
  type OptimisationProposal,
  type OptimiserBlueprint,
  type OptimiserPlantInstance,
} from "../lib/taskOptimiser";
import { analyseAreaAi, fetchNegativeFeedback, type NegativeFeedbackItem } from "../lib/taskOptimiserAi";
import OptimisationProposalCard, { type FeedbackState } from "./OptimisationProposalCard";
import OptimisationHistory from "./OptimisationHistory";
import { ConfirmModal } from "./ConfirmModal";
import { logEvent, EVENT } from "../events/registry";
import { useBetaFeedbackContext } from "../context/BetaFeedbackContext";
import { getLocalDateString } from "../lib/taskEngine";

interface Location {
  id: string;
  name: string;
}

interface Area {
  id: string;
  name: string;
  location_id: string;
}

interface Props {
  homeId: string;
  aiEnabled: boolean;
}

export default function OptimiseTab({ homeId, aiEnabled }: Props) {
  const { requestFeedback } = useBetaFeedbackContext();
  const [userId, setUserId] = React.useState<string | null>(null);

  React.useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  const [locations, setLocations] = useState<Location[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [analyseScope, setAnalyseScope] = useState<"single" | "whole">("single");
  const [selectedLocationId, setSelectedLocationId] = useState<string>("");
  const [selectedAreaId, setSelectedAreaId] = useState<string>("");
  const [analysing, setAnalysing] = useState(false);
  const [aiAnalysing, setAiAnalysing] = useState(false);
  const [proposals, setProposals] = useState<OptimisationProposal[] | null>(null);
  const [aiProposals, setAiProposals] = useState<OptimisationProposal[] | null>(null);
  const [included, setIncluded] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);
  const [lastApplyCount, setLastApplyCount] = useState<number | null>(null);

  // Feedback state per AI proposal id
  const [feedbackMap, setFeedbackMap] = useState<Record<string, FeedbackState>>({});

  // Regenerate modal
  const [regenerateOpen, setRegenerateOpen] = useState(false);
  const [regenerateReason, setRegenerateReason] = useState("");
  const [regenerating, setRegenerating] = useState(false);

  // Load locations + areas once on mount
  React.useEffect(() => {
    if (dataLoaded) return;
    Promise.all([
      supabase
        .from("locations")
        .select("id, name")
        .eq("home_id", homeId)
        .order("name"),
      supabase
        .from("areas")
        .select("id, name, location_id, locations!inner(home_id)")
        .eq("locations.home_id", homeId)
        .order("name"),
    ]).then(([locRes, areaRes]) => {
      setLocations((locRes.data ?? []) as Location[]);
      setAreas((areaRes.data ?? []) as Area[]);
      setDataLoaded(true);
    });
  }, [homeId, dataLoaded]);

  const filteredAreas = selectedLocationId
    ? areas.filter((a) => a.location_id === selectedLocationId)
    : areas;

  const selectedArea = areas.find((a) => a.id === selectedAreaId);
  const selectedLocation = locations.find((l) => l.id === selectedLocationId);

  const handleLocationChange = (locationId: string) => {
    setSelectedLocationId(locationId);
    setSelectedAreaId("");
    setProposals(null);
    setAiProposals(null);
    setFeedbackMap({});
  };

  const handleAreaChange = (areaId: string) => {
    setSelectedAreaId(areaId);
    setProposals(null);
    setAiProposals(null);
    setFeedbackMap({});
  };

  // Fetch blueprint + inventory data shared by both analysers
  const fetchAnalysisData = useCallback(async () => {
    const { data: bpData, error: bpErr } = await supabase
      .from("task_blueprints")
      .select("id, title, task_type, frequency_days, start_date, area_id, location_id, inventory_item_ids, description, is_recurring")
      .eq("home_id", homeId)
      .eq("is_recurring", true)
      .eq("is_archived", false);
    if (bpErr) throw bpErr;

    const { data: invData, error: invErr } = await supabase
      .from("inventory_items")
      .select("id, plant_name, area_id")
      .eq("home_id", homeId)
      .not("area_id", "is", null);
    if (invErr) throw invErr;

    const instanceMap = new Map<string, OptimiserPlantInstance>(
      (invData ?? []).map((item) => [item.id, { id: item.id, plant_name: item.plant_name, area_id: item.area_id }]),
    );

    return { bpData: (bpData ?? []) as OptimiserBlueprint[], instanceMap };
  }, [homeId]);

  const handleAnalyse = useCallback(async () => {
    if (analyseScope === "single" && !selectedAreaId) return;
    if (!requireOnline("Schedule optimisation")) return;
    setAnalysing(true);
    setProposals(null);

    try {
      const { bpData, instanceMap } = await fetchAnalysisData();
      let found: OptimisationProposal[] = [];
      if (analyseScope === "whole") {
        // Iterate every area in the home and merge results, de-duped by id.
        const seen = new Set<string>();
        for (const area of areas) {
          const areaResults = analyseArea(area.id, area.name, bpData, instanceMap);
          for (const proposal of areaResults) {
            if (seen.has(proposal.id)) continue;
            seen.add(proposal.id);
            found.push(proposal);
          }
        }
      } else {
        const areaName = selectedArea?.name ?? "Area";
        found = analyseArea(selectedAreaId, areaName, bpData, instanceMap);
      }
      setProposals(found);
      setIncluded((prev) => {
        const next = new Set(prev);
        found.forEach((p) => next.add(p.id));
        return next;
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ((err as any)?.message ?? String(err));
      toast.error(`Analysis failed: ${msg}`);
    } finally {
      setAnalysing(false);
    }
  }, [analyseScope, selectedAreaId, selectedArea, areas, fetchAnalysisData]);

  const runAiAnalysis = useCallback(async (negFeedback: NegativeFeedbackItem[], reason?: string) => {
    const newProposals = await analyseAreaAi({
      homeId,
      areaId: selectedAreaId,
      regenerateReason: reason,
      previousNegativeFeedback: negFeedback.length > 0 ? negFeedback : undefined,
    });
    setAiProposals(newProposals);
    setFeedbackMap({});
    setIncluded((prev) => {
      const next = new Set(prev);
      newProposals.forEach((p) => next.add(p.id));
      return next;
    });
  }, [homeId, selectedAreaId]);

  const handleAiAnalyse = useCallback(async () => {
    if (!selectedAreaId || !userId) return;
    if (!requireOnline("AI schedule analysis")) return;
    setAiAnalysing(true);
    setAiProposals(null);

    try {
      const negFeedback = await fetchNegativeFeedback(userId, selectedAreaId);
      await runAiAnalysis(negFeedback);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ((err as any)?.message ?? String(err));
      toast.error(`AI analysis failed: ${msg}`);
    } finally {
      setAiAnalysing(false);
    }
  }, [selectedAreaId, userId, runAiAnalysis]);

  const handleRegenerate = useCallback(async () => {
    if (!selectedAreaId || !userId) return;
    setRegenerating(true);
    try {
      const negFeedback = await fetchNegativeFeedback(userId, selectedAreaId);
      await runAiAnalysis(negFeedback, regenerateReason.trim() || undefined);
      setRegenerateOpen(false);
      setRegenerateReason("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ((err as any)?.message ?? String(err));
      toast.error(`Regeneration failed: ${msg}`);
    } finally {
      setRegenerating(false);
    }
  }, [selectedAreaId, userId, regenerateReason, runAiAnalysis]);

  const handleFeedback = useCallback(async (proposal: OptimisationProposal, rating: "positive" | "negative") => {
    if (!userId || !selectedAreaId) return;

    setFeedbackMap((prev) => ({
      ...prev,
      [proposal.id]: { rating, submitting: true },
    }));

    const { error } = await supabase.from("optimiser_proposal_feedback").upsert(
      {
        home_id: homeId,
        area_id: selectedAreaId,
        user_id: userId,
        proposal_id: proposal.id,
        proposal_snapshot: {
          scenario: proposal.scenario,
          category: proposal.category,
          displayText: proposal.displayText,
          reasoning: proposal.reasoning ?? null,
        },
        rating,
      },
      { onConflict: "user_id,area_id,proposal_id" },
    );

    setFeedbackMap((prev) => ({
      ...prev,
      [proposal.id]: { rating: error ? null : rating, submitting: false },
    }));

    if (error) toast.error("Failed to save feedback");
  }, [userId, homeId, selectedAreaId]);

  // All proposals merged: rule first, then AI
  const allProposals = [
    ...(proposals ?? []),
    ...(aiProposals ?? []),
  ];

  const includedProposals = allProposals.filter((p) => included.has(p.id));

  async function applyProposals() {
    if (includedProposals.length === 0) return;
    setApplying(true);

    const allArchivedIds: string[] = [];
    const allCreatedIds: string[] = [];

    try {
      for (const proposal of includedProposals) {
        // frequency-change: just update frequency_days on existing blueprints
        if (proposal.scenario === "frequency-change" && proposal.frequencyChanges?.length) {
          for (const change of proposal.frequencyChanges) {
            const { error } = await supabase
              .from("task_blueprints")
              .update({ frequency_days: change.newFrequencyDays })
              .eq("id", change.blueprintId);
            if (error) throw error;
          }
          continue;
        }

        // retire: archive only, no new blueprint
        // redundant: archive only if no new blueprint needed
        const needsNewBlueprint = proposal.scenario !== "redundant" && proposal.scenario !== "retire";

        let newBlueprintId: string | null = null;
        if (needsNewBlueprint) {
          const today = getLocalDateString(new Date());

          const { data: newBp, error: insertErr } = await supabase
            .from("task_blueprints")
            .insert({
              home_id: homeId,
              area_id: proposal.areaId,
              title: proposal.newBlueprintTitle,
              task_type: proposal.category,
              is_recurring: true,
              frequency_days: proposal.newBlueprintFrequencyDays,
              start_date: today,
              description: proposal.newBlueprintDescription,
              inventory_item_ids: [],
            })
            .select("id")
            .single();
          if (insertErr) throw insertErr;
          newBlueprintId = newBp.id;
          allCreatedIds.push(newBp.id);

          if (proposal.plantInstanceIdsForNewBlueprint.length > 0) {
            const junctionRows = proposal.plantInstanceIdsForNewBlueprint.map((instanceId) => ({
              blueprint_id: newBlueprintId!,
              instance_id: instanceId,
            }));
            const { error: jErr } = await supabase
              .from("blueprint_plant_instances")
              .insert(junctionRows);
            if (jErr) throw jErr;
          }
        } else if (proposal.scenario === "redundant") {
          const existingBpId = proposal.after.find((a) => !a.isNew)?.retainedBlueprintId;
          if (existingBpId && proposal.plantInstanceIdsForNewBlueprint.length > 0) {
            const junctionRows = proposal.plantInstanceIdsForNewBlueprint.map((instanceId) => ({
              blueprint_id: existingBpId,
              instance_id: instanceId,
            }));
            await supabase
              .from("blueprint_plant_instances")
              .upsert(junctionRows, { onConflict: "blueprint_id,instance_id", ignoreDuplicates: true });
          }
        }

        if (proposal.blueprintsToArchive.length > 0) {
          const { error: archiveErr } = await supabase
            .from("task_blueprints")
            .update({ is_archived: true })
            .in("id", proposal.blueprintsToArchive);
          if (archiveErr) throw archiveErr;
          allArchivedIds.push(...proposal.blueprintsToArchive);
        }
      }

      if (userId) {
        await supabase.from("optimisation_sessions").insert({
          home_id: homeId,
          area_id: selectedAreaId,
          applied_by: userId,
          archived_blueprint_ids: allArchivedIds,
          created_blueprint_ids: allCreatedIds,
        });
      }

      logEvent(EVENT.TASK_OPTIMISED, { homeId, areaId: selectedAreaId, archived: allArchivedIds.length, created: allCreatedIds.length });

      const appliedCount = includedProposals.length;
      toast.success(`Applied ${appliedCount} optimisation${appliedCount > 1 ? "s" : ""}.`);
      requestFeedback("optimise_apply", { count: appliedCount });
      setLastApplyCount(appliedCount);
      setProposals(null);
      setAiProposals(null);
      setIncluded(new Set());
      setFeedbackMap({});
      setHistoryKey((k) => k + 1);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ((err as any)?.message ?? String(err));
      toast.error(`Apply failed: ${msg}`);
    } finally {
      setApplying(false);
      setConfirmOpen(false);
    }
  }

  const hasAnyResults = proposals !== null || aiProposals !== null;
  const totalCount = allProposals.length;

  return (
    <div className="space-y-6 pb-8">
      {/* Permanent explainer */}
      <div className="bg-rhozly-primary/5 border border-rhozly-primary/10 rounded-2xl px-4 py-3">
        <p className="text-xs font-bold text-rhozly-on-surface/60 leading-snug">
          <span className="font-black text-rhozly-on-surface/80">The Optimiser</span> reviews your Task Schedules and finds ways to save time — like merging duplicate watering reminders or adjusting how often you do things.
        </p>
      </div>

      {/* Post-apply success banner */}
      {lastApplyCount !== null && (
        <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3">
          <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-black text-emerald-700">Changes saved</p>
            <p className="text-xs text-emerald-600 mt-0.5">You can undo this for up to 90 days — see history below.</p>
          </div>
          <button onClick={() => setLastApplyCount(null)} className="text-emerald-400 hover:text-emerald-600 transition-colors">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Selectors + Analyse buttons */}
      <div className="bg-white rounded-2xl border border-rhozly-outline/20 p-5 space-y-4">
        <div>
          <h2 className="text-sm font-bold text-rhozly-on-surface mb-1">
            {analyseScope === "whole" ? "Analyse the whole garden" : "Select an area to analyse"}
          </h2>
          <p className="text-xs text-rhozly-on-surface-variant">
            {analyseScope === "whole"
              ? "Find consolidation opportunities across every area at once."
              : "Choose a location and area, then click Find Improvements to see what can be consolidated."}
          </p>
        </div>

        {/* Scope toggle */}
        <div className="flex bg-rhozly-surface-low rounded-xl p-1" data-testid="optimise-scope-toggle">
          <button
            type="button"
            onClick={() => {
              setAnalyseScope("single");
              setProposals(null);
              setAiProposals(null);
              setFeedbackMap({});
            }}
            aria-pressed={analyseScope === "single"}
            className={`flex-1 px-3 py-2 rounded-lg text-[11px] font-black uppercase tracking-widest transition-colors min-h-[36px] ${analyseScope === "single" ? "bg-white text-rhozly-primary shadow-sm" : "text-rhozly-on-surface/50 hover:text-rhozly-on-surface"}`}
            data-testid="optimise-scope-single"
          >
            Single area
          </button>
          <button
            type="button"
            onClick={() => {
              setAnalyseScope("whole");
              setProposals(null);
              setAiProposals(null);
              setFeedbackMap({});
            }}
            aria-pressed={analyseScope === "whole"}
            className={`flex-1 px-3 py-2 rounded-lg text-[11px] font-black uppercase tracking-widest transition-colors min-h-[36px] ${analyseScope === "whole" ? "bg-white text-rhozly-primary shadow-sm" : "text-rhozly-on-surface/50 hover:text-rhozly-on-surface"}`}
            data-testid="optimise-scope-whole"
          >
            Whole garden
          </button>
        </div>

        {/* Location + area dropdowns — only in single-area mode */}
        {analyseScope === "single" && (
          <>
            <div className="relative">
              <select
                data-testid="optimise-location-select"
                value={selectedLocationId}
                onChange={(e) => handleLocationChange(e.target.value)}
                className="w-full appearance-none rounded-xl border border-rhozly-outline/30 bg-rhozly-surface px-4 py-3 pr-10 text-sm text-rhozly-on-surface focus:outline-none focus:ring-2 focus:ring-rhozly-primary/40"
              >
                <option value="">— Choose a location —</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>
              <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-rhozly-on-surface-variant" />
            </div>

            {selectedLocationId && (
              <div className="relative">
                <select
                  data-testid="optimise-area-select"
                  value={selectedAreaId}
                  onChange={(e) => handleAreaChange(e.target.value)}
                  className="w-full appearance-none rounded-xl border border-rhozly-outline/30 bg-rhozly-surface px-4 py-3 pr-10 text-sm text-rhozly-on-surface focus:outline-none focus:ring-2 focus:ring-rhozly-primary/40"
                >
                  <option value="">— Choose an area —</option>
                  {filteredAreas.map((area) => (
                    <option key={area.id} value={area.id}>{area.name}</option>
                  ))}
                </select>
                <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-rhozly-on-surface-variant" />
              </div>
            )}
          </>
        )}

        <button
          data-testid="optimise-analyse-btn"
          disabled={analysing || aiAnalysing || (analyseScope === "single" && !selectedAreaId) || (analyseScope === "whole" && areas.length === 0)}
          onClick={handleAnalyse}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-rhozly-primary text-white font-semibold text-sm py-3 transition-opacity disabled:opacity-40"
        >
          {analysing ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
          {analysing ? "Finding Improvements…" : analyseScope === "whole" ? `Scan ${areas.length} areas` : "Find Improvements"}
        </button>

        {aiEnabled && analyseScope === "single" && (
          <div className="flex items-center gap-2">
            <button
              data-testid="optimise-ai-analyse-btn"
              disabled={!selectedAreaId || aiAnalysing || analysing}
              onClick={handleAiAnalyse}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-violet-300 bg-violet-50 text-violet-700 font-semibold text-sm py-3 transition-opacity disabled:opacity-40 hover:bg-violet-100"
            >
              {aiAnalysing ? <Loader2 size={16} className="animate-spin" /> : <Brain size={16} />}
              {aiAnalysing ? "AI Analysing…" : "Get AI Ideas"}
            </button>
            <InfoTooltip content="Uses Rhozly AI to find subtler improvements, like adjusting watering frequency for the season. Uses your AI quota." />
          </div>
        )}
        {aiEnabled && analyseScope === "whole" && (
          <p className="text-[11px] font-medium text-rhozly-on-surface/50 leading-snug bg-rhozly-surface-low/40 rounded-xl px-3 py-2">
            AI suggestions stay area-by-area to keep quality high — switch back to <span className="font-black">Single area</span> mode to use AI Ideas.
          </p>
        )}
      </div>

      {/* Results */}
      {hasAnyResults && (
        <div className="space-y-3">
          {totalCount === 0 ? (
            <div
              data-testid="optimise-all-good"
              className="rounded-2xl border border-rhozly-outline/20 bg-white p-6 text-center"
            >
              <Sparkles size={28} className="mx-auto text-emerald-500 mb-2" />
              <p className="text-sm font-semibold text-rhozly-on-surface">All good!</p>
              <p className="text-xs text-rhozly-on-surface-variant mt-1">
                No optimisation opportunities found for {selectedArea?.name}
                {selectedLocation ? ` in ${selectedLocation.name}` : ""}.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p
                  data-testid="optimise-suggestions-found"
                  className="text-sm font-bold text-rhozly-on-surface"
                >
                  {totalCount} suggestion{totalCount > 1 ? "s" : ""} found
                </p>
                <p
                  data-testid="optimise-selected-count"
                  className="text-xs text-rhozly-on-surface-variant"
                >
                  {includedProposals.length} selected
                </p>
              </div>

              {allProposals.map((p) => (
                <OptimisationProposalCard
                  key={p.id}
                  proposal={p}
                  included={included.has(p.id)}
                  onToggle={() =>
                    setIncluded((prev) => {
                      const next = new Set(prev);
                      next.has(p.id) ? next.delete(p.id) : next.add(p.id);
                      return next;
                    })
                  }
                  feedbackState={p.source === "ai" ? (feedbackMap[p.id] ?? { rating: null, submitting: false }) : undefined}
                  onFeedback={p.source === "ai" ? (rating) => handleFeedback(p, rating) : undefined}
                />
              ))}

              {/* Regenerate button — shown when AI results are present */}
              {aiProposals !== null && aiProposals.length > 0 && (
                <button
                  data-testid="optimise-regenerate-btn"
                  onClick={() => setRegenerateOpen(true)}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 text-violet-700 text-sm font-semibold py-2.5 hover:bg-violet-100 transition-colors"
                >
                  <RefreshCw size={14} />
                  Regenerate AI results
                </button>
              )}

              {includedProposals.length > 0 && (
                <button
                  data-testid="optimise-apply-btn"
                  disabled={applying}
                  onClick={() => setConfirmOpen(true)}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-rhozly-primary text-white font-bold text-sm py-3 mt-2 transition-opacity disabled:opacity-40"
                >
                  {applying
                    ? <Loader2 size={16} className="animate-spin" />
                    : <Sparkles size={16} />
                  }
                  Apply {includedProposals.length} change{includedProposals.length > 1 ? "s" : ""}
                </button>
              )}

              <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-100 px-3 py-2.5 text-xs text-amber-700">
                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                <span>Old blueprints are archived, not deleted — you can undo below within 90 days.</span>
              </div>
            </>
          )}
        </div>
      )}

      {/* History */}
      <div>
        <h3 className="text-xs font-bold text-rhozly-on-surface-variant uppercase tracking-wide mb-3">
          Past Changes
        </h3>
        <OptimisationHistory key={historyKey} homeId={homeId} onUndone={() => setHistoryKey((k) => k + 1)} />
      </div>

      <ConfirmModal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={`Apply ${includedProposals.length} optimisation${includedProposals.length > 1 ? "s" : ""}?`}
        description={`This will archive ${includedProposals.reduce((n, p) => n + p.blueprintsToArchive.length, 0)} blueprint${includedProposals.reduce((n, p) => n + p.blueprintsToArchive.length, 0) === 1 ? "" : "s"} and create new consolidated ones. You can undo within 90 days.`}
        confirmText="Apply"
        onConfirm={applyProposals}
        isLoading={applying}
        isDestructive={false}
      />

      {/* Regenerate modal */}
      {regenerateOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4 pb-safe">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-rhozly-on-surface">What would you like to be different?</h3>
              <button
                onClick={() => { setRegenerateOpen(false); setRegenerateReason(""); }}
                className="p-1 text-rhozly-on-surface-variant hover:text-rhozly-on-surface"
              >
                <X size={16} />
              </button>
            </div>
            <textarea
              data-testid="regenerate-reason-input"
              value={regenerateReason}
              onChange={(e) => setRegenerateReason(e.target.value)}
              placeholder="e.g. The suggestions weren't relevant, please focus more on watering gaps…"
              rows={4}
              className="w-full rounded-xl border border-rhozly-outline/30 bg-rhozly-surface px-3 py-2.5 text-sm text-rhozly-on-surface resize-none focus:outline-none focus:ring-2 focus:ring-violet-400/40"
            />
            <div className="flex gap-3">
              <button
                onClick={() => { setRegenerateOpen(false); setRegenerateReason(""); }}
                className="flex-1 rounded-xl border border-rhozly-outline/30 py-2.5 text-sm font-semibold text-rhozly-on-surface-variant hover:bg-rhozly-surface transition-colors"
              >
                Cancel
              </button>
              <button
                data-testid="regenerate-confirm-btn"
                disabled={regenerating}
                onClick={handleRegenerate}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-violet-600 text-white py-2.5 text-sm font-semibold hover:bg-violet-700 transition-colors disabled:opacity-40"
              >
                {regenerating ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                Regenerate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
