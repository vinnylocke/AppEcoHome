import React, { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Loader2, AlertCircle, ArrowLeft, Footprints, RotateCcw } from "lucide-react";
import { Logger } from "../../lib/errorHandler";
import {
  buildWalkRoute,
  sectionForStep,
  DEFAULT_WALK_SETTINGS,
  type WalkRoute,
  type WalkSection,
  type WalkSettings,
  type WalkStep,
  type WalkTask,
} from "../../lib/gardenWalk";
import {
  walkService,
  EMPTY_WALK_SUMMARY,
  type WalkVisitOutcome,
  type WalkSessionSummary,
} from "../../services/walkService";
import WalkPlantCard from "./WalkPlantCard";
import WalkSectionCard from "./WalkSectionCard";
import WalkSummaryCard from "./WalkSummaryCard";
import { recordSignal } from "../../onboarding/signals";
import FeatureGate from "../shared/FeatureGate";

interface Props {
  homeId: string;
  userId: string;
  aiEnabled: boolean;
}

type WalkState =
  | { kind: "loading" }
  | { kind: "resume-prompt"; openSessionId: string }
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | {
      kind: "walking";
      sessionId: string;
      route: WalkRoute;
      currentIndex: number;
      summary: WalkSessionSummary;
      skippedSectionLabels: string[];
    }
  | {
      kind: "finished";
      sessionId: string;
      durationMs: number;
      summary: WalkSessionSummary;
      skippedSectionLabels: string[];
    };

type WalkAction =
  | { type: "loaded"; sessionId: string; route: WalkRoute }
  | { type: "resume-prompt"; openSessionId: string }
  | { type: "empty" }
  | { type: "error"; message: string }
  | { type: "plant-outcome"; outcome: WalkVisitOutcome }
  | { type: "section-continue" }
  | { type: "section-skip"; section: WalkSection }
  | { type: "bump"; field: keyof WalkSessionSummary }
  | { type: "finish"; durationMs: number }
  | { type: "restart" };

function applyPlantOutcome(
  summary: WalkSessionSummary,
  outcome: WalkVisitOutcome,
): WalkSessionSummary {
  // Skipped doesn't count as visiting — the user explicitly bypassed.
  if (outcome === "skipped") return summary;
  const next = { ...summary, plantsVisited: summary.plantsVisited + 1 };
  if (outcome === "snapped") next.photosTaken += 1;
  if (outcome === "noted") next.notesAdded += 1;
  if (outcome === "task_completed") next.tasksCompleted += 1;
  if (outcome === "ailment_flagged") next.ailmentsFlagged += 1;
  return next;
}

function reducer(state: WalkState, action: WalkAction): WalkState {
  if (action.type === "loaded") {
    if (action.route.steps.length === 0) return { kind: "empty" };
    return {
      kind: "walking",
      sessionId: action.sessionId,
      route: action.route,
      currentIndex: 0,
      summary: { ...EMPTY_WALK_SUMMARY },
      skippedSectionLabels: [],
    };
  }
  if (action.type === "resume-prompt") {
    return { kind: "resume-prompt", openSessionId: action.openSessionId };
  }
  if (action.type === "empty") return { kind: "empty" };
  if (action.type === "error") return { kind: "error", message: action.message };
  if (action.type === "plant-outcome" && state.kind === "walking") {
    return {
      ...state,
      currentIndex: state.currentIndex + 1,
      summary: applyPlantOutcome(state.summary, action.outcome),
    };
  }
  if (action.type === "section-continue" && state.kind === "walking") {
    return {
      ...state,
      currentIndex: state.currentIndex + 1,
      summary: {
        ...state.summary,
        sectionsVisited: state.summary.sectionsVisited + 1,
      },
    };
  }
  if (action.type === "section-skip" && state.kind === "walking") {
    // Jump past the whole section's step range (a location section spans
    // its areas and their plants).
    return {
      ...state,
      currentIndex: action.section.stepEnd + 1,
      skippedSectionLabels: [...state.skippedSectionLabels, action.section.label],
    };
  }
  if (action.type === "bump" && state.kind === "walking") {
    return {
      ...state,
      summary: {
        ...state.summary,
        [action.field]: state.summary[action.field] + 1,
      },
    };
  }
  if (action.type === "finish" && state.kind === "walking") {
    return {
      kind: "finished",
      sessionId: state.sessionId,
      durationMs: action.durationMs,
      summary: state.summary,
      skippedSectionLabels: state.skippedSectionLabels,
    };
  }
  if (action.type === "restart") {
    // Drop to loading; the bootstrap callback will re-derive the route
    // from visit rows (never a serialized snapshot) — anything actioned
    // today naturally drops out, skipped sections reappear.
    return { kind: "loading" };
  }
  return state;
}

/**
 * The Garden Walk screen — RHO-17 hierarchical route: Home card →
 * per-Location cards → per-Area cards → per-area plant cards →
 * unassigned plants → summary.
 *
 * Routed at `/walk`. Full-bleed focus mode: no top bar, no side nav.
 * The route is composed once per bootstrap; each step outcome appends
 * to `garden_walk_visits` (plant rows or section rows), and the
 * rolled-up summary lands in `garden_walk_sessions` when the walk ends.
 * A same-day open session offers Resume (reusing the session id) vs
 * Start fresh.
 */
export default function GardenWalk(props: React.ComponentProps<typeof GardenWalkInner>) {
  return (
    <FeatureGate feature="garden_walk">
      <GardenWalkInner {...props} />
    </FeatureGate>
  );
}

function GardenWalkInner({ homeId, userId, aiEnabled }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  // RHO-7/8: return to wherever the walk was launched from. The launch
  // sites pass `state.from` (dashboard → "/dashboard", Quick Access tile →
  // "/quick"). Default to "/quick" when absent — a hard refresh mid-walk
  // drops location.state, and the mobile Quick Access menu is the safe
  // fallback (matches the pre-fix behaviour).
  const returnTo =
    (location.state as { from?: string } | null)?.from ?? "/quick";
  const [state, dispatch] = useReducer(reducer, { kind: "loading" } as WalkState);
  // `startedAtMs` is tracked per-walk-instance — re-set on Walk Again so
  // the new session's duration starts at zero, not from the original
  // walk's start.
  const [startedAtMs, setStartedAtMs] = useState<number>(() => Date.now());

  // Settings live in localStorage so the user's choices persist across walks.
  const [settings] = useState<WalkSettings>(() => {
    try {
      const raw = localStorage.getItem("rhozly:walk:settings");
      if (raw) return { ...DEFAULT_WALK_SETTINGS, ...JSON.parse(raw) };
    } catch {
      /* ignore */
    }
    return DEFAULT_WALK_SETTINGS;
  });

  // Bootstrap — resume-check, then session + route build in parallel.
  // Superseded-bootstrap guard: a dep change (or StrictMode dev
  // double-mount) mid-flight otherwise starts TWO walk_sessions rows and
  // the loser is orphaned with no endSession — and its slower response
  // could win the dispatch. The guard must NOT close a *resumed* session
  // (it wasn't created by this bootstrap), so orphan-closing only runs
  // for sessions this call opened.
  const bootstrapGen = useRef(0);

  const bootstrap = useCallback(
    async (opts?: { resumeSessionId?: string; forceFresh?: boolean }) => {
      const gen = ++bootstrapGen.current;
      dispatch({ type: "restart" });
      setStartedAtMs(Date.now());
      try {
        let resumeSessionId = opts?.resumeSessionId ?? null;

        if (!resumeSessionId) {
          const open = await walkService.findOpenSession(homeId, userId);
          if (open) {
            const startedToday =
              new Date(open.startedAt).getTime() >=
              new Date().setHours(0, 0, 0, 0);
            if (!startedToday) {
              // An open session from yesterday is not resumable — close
              // it silently and start fresh.
              await walkService.closeSession(open.id);
            } else if (opts?.forceFresh) {
              await walkService.closeSession(open.id);
            } else {
              if (gen === bootstrapGen.current) {
                dispatch({ type: "resume-prompt", openSessionId: open.id });
              }
              return;
            }
          }
        }

        const [session, route] = await Promise.all([
          resumeSessionId
            ? Promise.resolve({ id: resumeSessionId, startedAt: "" })
            : walkService.startSession(homeId, userId),
          buildWalkRoute(homeId, userId, settings),
        ]);
        if (gen !== bootstrapGen.current) {
          // A newer bootstrap superseded this one — close the orphan
          // session, but never a resumed one (we didn't open it).
          if (!resumeSessionId) {
            walkService.closeSession(session.id).catch(() => {});
          }
          return;
        }
        dispatch({ type: "loaded", sessionId: session.id, route });
      } catch (err: unknown) {
        if (gen !== bootstrapGen.current) return;
        const message = err instanceof Error ? err.message : "Couldn't start your walk.";
        Logger.error("GardenWalk bootstrap failed", err, { homeId });
        dispatch({ type: "error", message });
      }
    },
    [homeId, userId, settings],
  );

  // Fire bootstrap once on mount + whenever the underlying inputs
  // change. The bootstrap itself is idempotent — calling it again from
  // the summary card's "Walk again" button does the right thing (that
  // session was just ended, so no resume prompt reappears).
  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  // Wave 23.0001 — gate the walk walkthrough (23.0003) so it only fires
  // after a real start.
  useEffect(() => { void recordSignal("first_walk_started"); }, []);

  const handlePlantOutcome = useCallback(
    (outcome: WalkVisitOutcome) => {
      if (state.kind !== "walking") return;
      const current = state.route.steps[state.currentIndex];
      if (!current || current.kind !== "plant") return;
      // RHO-18 — a grouped card covers several instances. Resolving it writes
      // a visit row for EVERY member instance so a same-day walk rebuild
      // filters the whole group out (visitedTodaySet is keyed per instance).
      const instances = current.plant.instances?.length
        ? current.plant.instances.map((i) => i.inventoryItemId)
        : [current.plant.inventoryItemId];
      for (const instanceId of instances) {
        walkService.recordVisit(state.sessionId, instanceId, outcome);
      }
      dispatch({ type: "plant-outcome", outcome });
    },
    [state],
  );

  const handleSectionContinue = useCallback(
    (section: WalkSection) => {
      if (state.kind !== "walking") return;
      walkService.recordSectionVisit(
        state.sessionId,
        section.kind,
        section.refId,
        "section_done",
      );
      dispatch({ type: "section-continue" });
    },
    [state],
  );

  const handleSectionSkip = useCallback(
    (section: WalkSection) => {
      if (state.kind !== "walking") return;
      walkService.recordSectionVisit(
        state.sessionId,
        section.kind,
        section.refId,
        "section_skipped",
      );
      dispatch({ type: "section-skip", section });
    },
    [state],
  );

  // A task completed from any card: bump the metric and log a
  // task_completed step-visit row — WITHOUT advancing (the user resolves
  // the card explicitly). Plant rows mark the plant actioned-today;
  // section task_completed rows are history only (they don't exclude the
  // section from a same-day rebuild — only section_done does).
  const handleTaskCompleted = useCallback(
    (_task: WalkTask) => {
      if (state.kind !== "walking") return;
      const current = state.route.steps[state.currentIndex];
      if (!current) return;
      if (current.kind === "plant") {
        walkService.recordVisit(
          state.sessionId,
          current.plant.inventoryItemId,
          "task_completed",
        );
      } else {
        const section = sectionForStep(state.route, state.currentIndex);
        if (section) {
          walkService.recordSectionVisit(
            state.sessionId,
            section.kind,
            section.refId,
            "task_completed",
          );
        }
      }
      dispatch({ type: "bump", field: "tasksCompleted" });
    },
    [state],
  );

  const handleSectionNoteSaved = useCallback(() => {
    dispatch({ type: "bump", field: "notesAdded" });
  }, []);

  // Phase 2 — a manual soil reading saved from an area card. Record the
  // reading_logged step-visit row (history only — like task_completed it
  // does NOT resolve the section; Continue / Skip do) and bump the
  // session metric. The write itself already happened inside
  // WalkReadingSheet via areaReadingsService.logManualReading.
  const handleReadingLogged = useCallback(
    (section: WalkSection) => {
      if (state.kind !== "walking") return;
      walkService.recordSectionVisit(
        state.sessionId,
        section.kind,
        section.refId,
        "reading_logged",
      );
      dispatch({ type: "bump", field: "readingsLogged" });
    },
    [state],
  );

  const handleSectionPhotoSaved = useCallback(() => {
    dispatch({ type: "bump", field: "photosTaken" });
  }, []);

  // Detect "we just advanced past the last card" → finish.
  useEffect(() => {
    if (state.kind !== "walking") return;
    if (state.currentIndex < state.route.steps.length) return;
    const durationMs = Date.now() - startedAtMs;
    walkService
      .endSession(state.sessionId, state.summary)
      .catch((err) => Logger.error("endSession failed", err, { sessionId: state.sessionId }));
    dispatch({ type: "finish", durationMs });
  }, [state, startedAtMs]);

  const handleStop = useCallback(() => {
    if (state.kind === "walking") {
      const durationMs = Date.now() - startedAtMs;
      walkService.endSession(state.sessionId, state.summary).catch(() => {});
      dispatch({ type: "finish", durationMs });
    } else {
      navigate(returnTo);
    }
  }, [state, startedAtMs, navigate, returnTo]);

  // ── Render branches ────────────────────────────────────────────────

  if (state.kind === "loading") {
    return (
      <div
        data-testid="garden-walk-loading"
        className="h-full w-full flex items-center justify-center bg-rhozly-bg"
      >
        <div className="flex items-center gap-2 text-sm font-bold text-rhozly-on-surface/60">
          <Loader2 className="animate-spin" size={18} />
          Preparing your walk…
        </div>
      </div>
    );
  }

  if (state.kind === "resume-prompt") {
    return (
      <div
        data-testid="garden-walk-resume"
        className="h-full w-full flex items-center justify-center px-6"
      >
        <div className="max-w-md w-full rounded-3xl bg-white border border-rhozly-outline/15 p-6 text-center">
          <Footprints className="mx-auto mb-3 text-rhozly-primary" size={24} />
          <p className="font-display font-black text-rhozly-on-surface text-lg mb-1">
            Pick up where you left off?
          </p>
          <p className="text-sm text-rhozly-on-surface/65 mb-4 leading-snug">
            You have a walk from earlier today. Resume it — anything you already
            covered stays covered, and skipped sections come back around.
          </p>
          <div className="space-y-2">
            <button
              type="button"
              data-testid="walk-resume-continue"
              onClick={() => void bootstrap({ resumeSessionId: state.openSessionId })}
              className="w-full min-h-[48px] rounded-2xl bg-rhozly-primary text-white text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2"
            >
              <Footprints size={14} />
              Resume walk
            </button>
            <button
              type="button"
              data-testid="walk-resume-fresh"
              onClick={() => void bootstrap({ forceFresh: true })}
              className="w-full min-h-[48px] rounded-2xl bg-white border border-rhozly-outline/15 text-rhozly-on-surface/70 text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2"
            >
              <RotateCcw size={14} />
              Start fresh
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div
        data-testid="garden-walk-error"
        className="h-full w-full flex items-center justify-center px-6"
      >
        <div className="max-w-md rounded-3xl bg-red-50 border border-red-100 p-6 text-center">
          <AlertCircle className="mx-auto mb-3 text-red-600" size={24} />
          <p className="font-display font-black text-rhozly-on-surface text-lg mb-1">
            Couldn't start your walk
          </p>
          <p className="text-sm text-red-900/80 mb-4">{state.message}</p>
          <button
            type="button"
            data-testid="garden-walk-error-back"
            onClick={() => navigate(returnTo)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-rhozly-primary text-white text-xs font-black uppercase tracking-widest"
          >
            <ArrowLeft size={14} />
            Back
          </button>
        </div>
      </div>
    );
  }

  if (state.kind === "empty") {
    return (
      <div
        data-testid="garden-walk-empty"
        className="h-full w-full flex items-center justify-center px-6"
      >
        <div className="max-w-md rounded-3xl bg-white border border-rhozly-outline/15 p-6 text-center">
          <p className="font-display font-black text-rhozly-on-surface text-lg mb-1">
            Nothing to walk today
          </p>
          <p className="text-sm text-rhozly-on-surface/65 mb-4 leading-snug">
            Add some plants to your Shed and assign them to areas to start your daily walk.
          </p>
          <button
            type="button"
            data-testid="garden-walk-empty-back"
            onClick={() => navigate(returnTo)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-rhozly-primary text-white text-xs font-black uppercase tracking-widest"
          >
            <ArrowLeft size={14} />
            Back
          </button>
        </div>
      </div>
    );
  }

  if (state.kind === "finished") {
    return (
      <WalkSummaryCard
        durationMs={state.durationMs}
        summary={state.summary}
        skippedSections={state.skippedSectionLabels}
        onDone={() => navigate(returnTo)}
        onWalkAgain={() => void bootstrap()}
      />
    );
  }

  // state.kind === "walking"
  // When the user advances past the last card, `currentIndex` overshoots
  // by one tick before the finish effect dispatches. Show a tiny
  // wrapping-up placeholder for that frame instead of feeding an
  // undefined step into a card.
  const current: WalkStep | undefined = state.route.steps[state.currentIndex];
  if (!current) {
    return (
      <div
        data-testid="garden-walk-wrapping-up"
        className="h-full w-full flex items-center justify-center bg-rhozly-bg"
      >
        <div className="flex items-center gap-2 text-sm font-bold text-rhozly-on-surface/60">
          <Loader2 className="animate-spin" size={18} />
          Wrapping up your walk…
        </div>
      </div>
    );
  }

  const currentSection = sectionForStep(state.route, state.currentIndex);

  if (current.kind === "plant") {
    return (
      // Keyed by plant: without it, React reuses the card instance when
      // advancing, so the previous plant's scroll offset and in-flight
      // upload state (snapUploading) bled into the next plant's card.
      <WalkPlantCard
        key={current.plant.inventoryItemId}
        homeId={homeId}
        userId={userId}
        aiEnabled={aiEnabled}
        plant={current.plant}
        tasks={current.tasks}
        sectionLabel={currentSection?.label ?? null}
        progressIndex={state.currentIndex}
        progressTotal={state.route.steps.length}
        onOutcome={handlePlantOutcome}
        onTaskCompleted={handleTaskCompleted}
        onStop={handleStop}
      />
    );
  }

  // Section step (home / location / area). The section identity comes
  // from the step itself, not the smallest-enclosing lookup (a location
  // header's own section is the location, not its first area).
  const ownSection: WalkSection =
    state.route.sections.find(
      (s) =>
        s.kind === current.kind &&
        (current.kind === "home" || s.refId === (current as { id: string }).id),
    ) ?? {
      key: current.kind,
      kind: current.kind,
      refId: current.kind === "home" ? null : (current as { id: string }).id,
      label: current.kind === "home" ? "Home" : (current as { name: string }).name,
      stepStart: state.currentIndex,
      stepEnd: state.currentIndex,
      skippedEarlier: false,
    };

  return (
    <WalkSectionCard
      key={ownSection.key}
      homeId={homeId}
      userId={userId}
      step={current}
      section={ownSection}
      progressIndex={state.currentIndex}
      progressTotal={state.route.steps.length}
      onContinue={() => handleSectionContinue(ownSection)}
      onSkipSection={() => handleSectionSkip(ownSection)}
      onStop={handleStop}
      onTaskCompleted={handleTaskCompleted}
      onNoteSaved={handleSectionNoteSaved}
      onPhotoSaved={handleSectionPhotoSaved}
      onReadingLogged={() => handleReadingLogged(ownSection)}
    />
  );
}
