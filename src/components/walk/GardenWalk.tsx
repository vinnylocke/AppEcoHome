import React, { useCallback, useEffect, useReducer, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Loader2, AlertCircle, ArrowLeft } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Logger } from "../../lib/errorHandler";
import {
  buildWalkList,
  DEFAULT_WALK_SETTINGS,
  type WalkPlant,
  type WalkSettings,
} from "../../lib/gardenWalk";
import {
  walkService,
  type WalkVisitOutcome,
  type WalkSessionSummary,
} from "../../services/walkService";
import WalkPlantCard from "./WalkPlantCard";
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
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | {
      kind: "walking";
      sessionId: string;
      list: WalkPlant[];
      currentIndex: number;
      summary: WalkSessionSummary;
    }
  | {
      kind: "finished";
      sessionId: string;
      durationMs: number;
      summary: WalkSessionSummary;
    };

type WalkAction =
  | { type: "loaded"; sessionId: string; list: WalkPlant[] }
  | { type: "empty" }
  | { type: "error"; message: string }
  | { type: "outcome"; outcome: WalkVisitOutcome }
  | { type: "finish"; durationMs: number }
  | { type: "restart" };

const EMPTY_SUMMARY: WalkSessionSummary = {
  plantsVisited: 0,
  photosTaken: 0,
  notesAdded: 0,
  tasksCompleted: 0,
  ailmentsFlagged: 0,
};

function applyOutcome(summary: WalkSessionSummary, outcome: WalkVisitOutcome): WalkSessionSummary {
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
    if (action.list.length === 0) return { kind: "empty" };
    return {
      kind: "walking",
      sessionId: action.sessionId,
      list: action.list,
      currentIndex: 0,
      summary: { ...EMPTY_SUMMARY },
    };
  }
  if (action.type === "empty") return { kind: "empty" };
  if (action.type === "error") return { kind: "error", message: action.message };
  if (action.type === "outcome" && state.kind === "walking") {
    return {
      ...state,
      currentIndex: state.currentIndex + 1,
      summary: applyOutcome(state.summary, action.outcome),
    };
  }
  if (action.type === "finish" && state.kind === "walking") {
    return {
      kind: "finished",
      sessionId: state.sessionId,
      durationMs: action.durationMs,
      summary: state.summary,
    };
  }
  if (action.type === "restart") {
    // Drop to loading; the bootstrap callback will fire again, re-query
    // the walk list (today's same-day-visited filter naturally excludes
    // anything already actioned), and open a fresh session.
    return { kind: "loading" };
  }
  return state;
}

/**
 * The Garden Walk screen — a guided tour of every plant in the home.
 *
 * Routed at `/walk`. Full-bleed focus mode: no top bar, no side nav.
 * The walk list is pulled once at mount; each card outcome appends to
 * `garden_walk_visits`, and the rolled-up summary lands in
 * `garden_walk_sessions` when the walk ends.
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

  // Bootstrap — start a session + build the walk list in parallel.
  // Wrapped in a callback so the "Walk again" path on the summary card
  // can re-trigger it. Today's same-day-visited filter inside
  // buildWalkList means a second walk naturally surfaces just what's
  // left.
  // Superseded-bootstrap guard: a dep change (or StrictMode dev
  // double-mount) mid-flight otherwise starts TWO walk_sessions rows and
  // the loser is orphaned with no endSession — and its slower response
  // could win the dispatch.
  const bootstrapGen = useRef(0);

  const bootstrap = useCallback(async () => {
    const gen = ++bootstrapGen.current;
    dispatch({ type: "restart" });
    setStartedAtMs(Date.now());
    try {
      const [session, list] = await Promise.all([
        walkService.startSession(homeId, userId),
        buildWalkList(homeId, userId, settings),
      ]);
      if (gen !== bootstrapGen.current) {
        // A newer bootstrap superseded this one — close the orphan session.
        walkService
          .endSession(session.id, {
            plantsVisited: 0,
            photosTaken: 0,
            notesAdded: 0,
            tasksCompleted: 0,
            ailmentsFlagged: 0,
          })
          .catch(() => {});
        return;
      }
      dispatch({ type: "loaded", sessionId: session.id, list });
    } catch (err: unknown) {
      if (gen !== bootstrapGen.current) return;
      const message = err instanceof Error ? err.message : "Couldn't start your walk.";
      Logger.error("GardenWalk bootstrap failed", err, { homeId });
      dispatch({ type: "error", message });
    }
  }, [homeId, userId, settings]);

  // Fire bootstrap once on mount + whenever the underlying inputs
  // change. The bootstrap itself is idempotent — calling it again from
  // the summary card's "Walk again" button does the right thing.
  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  // Wave 23.0001 — gate the walk walkthrough (23.0003) so it only fires
  // after a real start.
  useEffect(() => { void recordSignal("first_walk_started"); }, []);

  const handleOutcome = useCallback(
    (outcome: WalkVisitOutcome) => {
      if (state.kind !== "walking") return;
      const current = state.list[state.currentIndex];
      if (!current) return;
      walkService.recordVisit(state.sessionId, current.inventoryItemId, outcome);
      dispatch({ type: "outcome", outcome });
    },
    [state],
  );

  // Detect "we just advanced past the last card" → finish.
  useEffect(() => {
    if (state.kind !== "walking") return;
    if (state.currentIndex < state.list.length) return;
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
        onDone={() => navigate(returnTo)}
        onWalkAgain={bootstrap}
      />
    );
  }

  // state.kind === "walking"
  // When the user advances past the last card, `currentIndex` overshoots
  // by one tick before the finish effect dispatches. Show a tiny
  // wrapping-up placeholder for that frame instead of feeding an
  // undefined `plant` into WalkPlantCard.
  const current = state.list[state.currentIndex];
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
  return (
    // Keyed by plant: without it, React reuses the card instance when
    // advancing, so the previous plant's scroll offset and in-flight
    // upload state (snapUploading) bled into the next plant's card.
    <WalkPlantCard
      key={current.inventoryItemId}
      homeId={homeId}
      aiEnabled={aiEnabled}
      plant={current}
      progressIndex={state.currentIndex}
      progressTotal={state.list.length}
      onOutcome={handleOutcome}
      onStop={handleStop}
    />
  );
}
