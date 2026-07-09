import React, { useState } from "react";
import {
  CalendarClock,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Clock,
  Loader2,
  Sparkles,
  Sprout,
  User,
  X,
} from "lucide-react";
import toast from "react-hot-toast";
import { Logger } from "../../lib/errorHandler";
import { usePersona } from "../../hooks/usePersona";
import type { WalkTask } from "../../lib/gardenWalk";
import {
  completeTask,
  postponeTask,
  skipTask,
  snoozeHarvestTask,
} from "../../lib/taskActions";
import HarvestRipenessSheet from "../HarvestRipenessSheet";
import HarvestPartialPickSheet from "../HarvestPartialPickSheet";
import HarvestEndOfLifePrompt from "../HarvestEndOfLifePrompt";
import { useHarvestYieldGate } from "../../hooks/useHarvestYieldGate";

// One task row on a Garden Walk card (section AND plant cards) with the
// three actions — complete / postpone / skip — backed by the shared
// mutation core in src/lib/taskActions.ts (RHO-17). The row resolves to
// a terminal state in place (Done / Moved / Snoozed / Skipped) instead
// of disappearing, so the user sees what happened.
//
// Phase 3 (approved answer 5) — harvest-window tasks get the FULL Task
// Detail experience in-walk, reusing the exact components + mutations
// TaskModal's HarvestWindowFooter mounts:
//   Harvested     → taskActions.completeTask, then HarvestEndOfLifePrompt
//                   (same post-complete prompt TaskList queues)
//   Picked some   → HarvestPartialPickSheet → yieldService.insertYieldRecord
//                   rows, then snoozeHarvestTask (next_check_at, capped at
//                   window_end_date)
//   Not yet       → 3/5/7-day chips → snoozeHarvestTask
//   Check with AI → HarvestRipenessSheet (analyse_comprehensive) → ripe
//                   completes, otherwise snoozes by the AI's estimate
// Window-closed harvest tasks keep the plain actions: ✓ logs it as
// harvested (TaskModal's "Log yield anyway"), ✕ marks it missed
// (status='Skipped', TaskModal's "Mark missed").
//
// Persona (§11): the "new" persona sees the task description expanded;
// "experienced" gets title-only with the description behind a Details
// tap. Copy + density only.

interface Props {
  task: WalkTask;
  homeId: string;
  userId: string;
  /** Resolved plant name — grounds the AI ripeness check (plant cards
   *  pass their plant; section cards fall back to the task title). */
  plantName?: string | null;
  onCompleted?: (task: WalkTask) => void;
  onPostponed?: (task: WalkTask) => void;
  onSkipped?: (task: WalkTask) => void;
}

type RowState = "pending" | "busy" | "completed" | "postponed" | "snoozed" | "skipped";

function localDatePlus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const HARVEST_SNOOZE_DAYS = [3, 5, 7]; // TaskModal's Not-yet presets

export default function WalkTaskRow({
  task,
  homeId,
  userId,
  plantName,
  onCompleted,
  onPostponed,
  onSkipped,
}: Props) {
  const persona = usePersona();
  const isNewGardener = persona !== "experienced"; // null ⇒ "new"
  const [rowState, setRowState] = useState<RowState>("pending");
  const [postponeOpen, setPostponeOpen] = useState(false);
  const [pickedDate, setPickedDate] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Harvest experience (Phase 3)
  const [harvestOpen, setHarvestOpen] = useState(false);
  const [notYetOpen, setNotYetOpen] = useState(false);
  const [ripenessOpen, setRipenessOpen] = useState(false);
  const [partialOpen, setPartialOpen] = useState(false);
  const [eolTaskId, setEolTaskId] = useState<string | null>(null);
  const { requestHarvestComplete, harvestYieldSheet } = useHarvestYieldGate(homeId);

  const todayIso = localDatePlus(0);
  // Only HARVEST windows get the yield/AI walk strip. Pruning is also a
  // window task (2026-07) but has no yield — in the quick walk it uses the
  // normal Complete / Postpone / Skip actions; its "Still pruning" partial
  // lives in the full TaskModal. So gate the harvest strip on the type, not
  // just the presence of window_end_date.
  const isHarvest =
    (task.type === "Harvesting" || task.type === "Harvest") && !!task.window_end_date;
  const windowClosed =
    isHarvest && String(task.window_end_date).slice(0, 10) < todayIso;
  const inWindow = isHarvest && !windowClosed;
  const instanceIds = task.inventory_item_ids ?? [];
  // Same fallback TaskModal's HarvestWindowFooter uses for AI grounding.
  const plantNameGuess =
    plantName ??
    (task.title.replace(/\s+harvest\s*$/i, "").trim() || null);

  const run = async (
    action: () => Promise<unknown>,
    terminal: RowState,
    after?: () => void,
  ) => {
    setRowState("busy");
    try {
      await action();
      setRowState(terminal);
      setPostponeOpen(false);
      setHarvestOpen(false);
      setNotYetOpen(false);
      after?.();
    } catch (err: unknown) {
      Logger.error("WalkTaskRow action failed", err, { taskId: task.id });
      toast.error("That didn't save — try again.");
      setRowState("pending");
    }
  };

  const handleComplete = () =>
    run(() => completeTask(task, { homeId, userId }), "completed", () =>
      onCompleted?.(task),
    );

  // Harvested — first ask for the yield (split-evenly or per-plant) via the
  // shared gate, then complete via the shared path and offer the same
  // End-of-Life prompt TaskList queues after harvest completion. Dismissing the
  // yield sheet (X) cancels; "Skip" completes without a yield.
  const doHarvestComplete = () =>
    run(
      async () => {
        const finalRow = await completeTask(task, { homeId, userId });
        if (task.type === "Harvesting" && instanceIds.length > 0) {
          setEolTaskId((finalRow?.id as string) ?? task.id);
        }
      },
      "completed",
      () => onCompleted?.(task),
    );
  const handleHarvested = () =>
    requestHarvestComplete(task, doHarvestComplete, { plantName: plantNameGuess });

  const handleSnooze = (days: number) =>
    run(
      async () => {
        const backOn = await snoozeHarvestTask(task, days);
        toast.success(`Snoozed — back on ${backOn}, still in window.`);
      },
      "snoozed",
    );

  const handleSkip = () =>
    run(() => skipTask(task), "skipped", () => onSkipped?.(task));

  const handlePostpone = (newDate: string) => {
    if (!newDate) return;
    void run(() => postponeTask(task, newDate), "postponed", () =>
      onPostponed?.(task),
    );
  };

  const terminalLabel =
    rowState === "completed"
      ? "Done"
      : rowState === "postponed"
      ? "Moved"
      : rowState === "snoozed"
      ? "Snoozed"
      : rowState === "skipped"
      ? "Skipped"
      : null;

  return (
    <div
      data-testid={`walk-task-row-${task.id}`}
      data-state={rowState}
      className={`rounded-2xl border p-3 ${
        terminalLabel
          ? "bg-rhozly-surface-low/60 border-rhozly-outline/10 opacity-70"
          : "bg-white border-rhozly-outline/15"
      }`}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p
            className={`text-sm font-bold text-rhozly-on-surface leading-snug ${
              rowState === "completed" ? "line-through" : ""
            }`}
          >
            {task.title}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/45">
              {task.type}
            </span>
            {task.isOverdue && (
              <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-black uppercase tracking-widest border border-amber-200">
                Overdue
              </span>
            )}
            {task.isPersonal && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-800 text-[10px] font-black uppercase tracking-widest border border-violet-100">
                <User size={9} />
                Personal
              </span>
            )}
            {task.plan_id && (
              <span
                data-testid={`walk-task-plan-chip-${task.id}`}
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-rhozly-primary/10 text-rhozly-primary text-[10px] font-black uppercase tracking-widest border border-rhozly-primary/15"
              >
                <ClipboardList size={9} />
                Plan
              </span>
            )}
            {task.alsoCoversCount > 0 && (
              <span className="text-[10px] font-bold text-rhozly-on-surface/45">
                also covers {task.alsoCoversCount} other{" "}
                {task.alsoCoversCount === 1 ? "plant" : "plants"}
              </span>
            )}
          </div>
          {/* Persona density (§11): new → description expanded;
              experienced → behind a Details tap. */}
          {task.description && rowState === "pending" && (
            isNewGardener || detailsOpen ? (
              <p
                data-testid={`walk-task-description-${task.id}`}
                className="mt-1 text-xs font-bold text-rhozly-on-surface/55 leading-snug"
              >
                {task.description}
              </p>
            ) : (
              <button
                type="button"
                data-testid={`walk-task-details-${task.id}`}
                onClick={() => setDetailsOpen(true)}
                className="mt-1 inline-flex items-center gap-0.5 text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/45 hover:text-rhozly-on-surface/70"
              >
                Details
                <ChevronDown size={11} />
              </button>
            )
          )}
          {windowClosed && rowState === "pending" && (
            <p
              data-testid={`walk-task-window-closed-${task.id}`}
              className="mt-1 text-[10px] font-bold text-amber-800"
            >
              Harvest window closed — ✓ logs it as harvested, ✕ marks it
              missed.
            </p>
          )}
        </div>

        {terminalLabel ? (
          <span
            data-testid={`walk-task-state-${task.id}`}
            className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-full bg-rhozly-primary/10 text-rhozly-primary text-[10px] font-black uppercase tracking-widest"
          >
            <Check size={11} />
            {terminalLabel}
          </span>
        ) : (
          <div className="shrink-0 flex items-center gap-1">
            {rowState === "busy" ? (
              <span className="w-9 h-9 flex items-center justify-center text-rhozly-on-surface/50">
                <Loader2 className="animate-spin" size={16} />
              </span>
            ) : (
              <>
                {inWindow ? (
                  // In-window harvest: the Harvest button opens the full
                  // 4-action strip (snooze replaces postpone in-window).
                  <button
                    type="button"
                    data-testid={`walk-task-harvest-${task.id}`}
                    onClick={() => setHarvestOpen((v) => !v)}
                    aria-label={`Harvest options for ${task.title}`}
                    aria-expanded={harvestOpen}
                    className="h-9 px-2.5 rounded-xl bg-rhozly-primary text-white flex items-center gap-1 hover:opacity-95"
                  >
                    <Sprout size={15} />
                    <span className="text-[10px] font-black uppercase tracking-widest">
                      Harvest
                    </span>
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      data-testid={`walk-task-complete-${task.id}`}
                      onClick={handleComplete}
                      aria-label={`Complete ${task.title}`}
                      className="w-9 h-9 rounded-xl bg-rhozly-primary text-white flex items-center justify-center hover:opacity-95"
                    >
                      <Check size={16} />
                    </button>
                    {!windowClosed && (
                      <button
                        type="button"
                        data-testid={`walk-task-postpone-${task.id}`}
                        onClick={() => setPostponeOpen((v) => !v)}
                        aria-label={`Postpone ${task.title}`}
                        className="w-9 h-9 rounded-xl bg-white border border-rhozly-outline/15 text-rhozly-on-surface/60 flex items-center justify-center hover:border-rhozly-primary/30"
                      >
                        <CalendarClock size={15} />
                      </button>
                    )}
                  </>
                )}
                <button
                  type="button"
                  data-testid={`walk-task-skip-${task.id}`}
                  onClick={handleSkip}
                  aria-label={`Skip ${task.title}`}
                  className="w-9 h-9 rounded-xl bg-white border border-rhozly-outline/15 text-rhozly-on-surface/50 flex items-center justify-center hover:border-red-200 hover:text-red-600"
                >
                  <X size={15} />
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Harvest action strip — mirrors TaskModal's HarvestWindowFooter */}
      {harvestOpen && inWindow && rowState === "pending" && (
        <div
          data-testid={`walk-harvest-strip-${task.id}`}
          className="mt-2 rounded-xl bg-rhozly-surface-low/60 border border-rhozly-outline/10 p-2"
        >
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              data-testid={`walk-harvest-harvested-${task.id}`}
              onClick={handleHarvested}
              className="min-h-[44px] rounded-xl bg-rhozly-primary text-white text-[11px] font-black flex items-center justify-center gap-1.5"
            >
              <Sprout size={13} />
              Harvested
            </button>
            <button
              type="button"
              data-testid={`walk-harvest-partial-${task.id}`}
              onClick={() => setPartialOpen(true)}
              disabled={instanceIds.length === 0}
              title={
                instanceIds.length === 0
                  ? "Link a plant to this task to log partial picks."
                  : "Log a partial harvest — task stays open."
              }
              className="min-h-[44px] rounded-xl bg-amber-50 text-amber-800 text-[11px] font-black flex items-center justify-center gap-1.5 hover:bg-amber-100 disabled:opacity-40"
            >
              <Sprout size={13} />
              Picked some
            </button>
            <button
              type="button"
              data-testid={`walk-harvest-notyet-${task.id}`}
              onClick={() => setNotYetOpen((v) => !v)}
              aria-expanded={notYetOpen}
              className="min-h-[44px] rounded-xl bg-white border border-rhozly-outline/15 text-rhozly-on-surface/70 text-[11px] font-black flex items-center justify-center gap-1.5"
            >
              <Clock size={13} />
              Not yet
            </button>
            <button
              type="button"
              data-testid={`walk-harvest-ai-${task.id}`}
              onClick={() => setRipenessOpen(true)}
              className="min-h-[44px] rounded-xl bg-emerald-50 text-emerald-700 text-[11px] font-black flex items-center justify-center gap-1.5 hover:bg-emerald-100"
            >
              <Sparkles size={13} />
              Check with AI
            </button>
          </div>
          {notYetOpen && (
            <div
              data-testid={`walk-harvest-snooze-popover-${task.id}`}
              className="mt-1.5 grid grid-cols-3 gap-1.5"
            >
              {HARVEST_SNOOZE_DAYS.map((d) => (
                <button
                  key={d}
                  type="button"
                  data-testid={`walk-harvest-snooze-${d}-${task.id}`}
                  onClick={() => handleSnooze(d)}
                  className="min-h-[40px] rounded-xl bg-white border border-rhozly-outline/15 text-[11px] font-black text-rhozly-on-surface/70 hover:border-rhozly-primary/30"
                >
                  {d} days
                </button>
              ))}
            </div>
          )}
          {isNewGardener && (
            <p
              data-testid={`walk-harvest-guidance-${task.id}`}
              className="mt-1.5 text-[10px] font-bold text-rhozly-on-surface/45 leading-snug"
            >
              Picked some logs today's haul and keeps the task open — most
              crops pick over weeks, not once.
            </p>
          )}
        </div>
      )}

      {postponeOpen && rowState === "pending" && (
        <div
          data-testid={`walk-task-postpone-sheet-${task.id}`}
          className="mt-2 flex flex-wrap items-center gap-1.5 rounded-xl bg-rhozly-surface-low/60 border border-rhozly-outline/10 p-2"
        >
          <button
            type="button"
            data-testid={`walk-task-postpone-tomorrow-${task.id}`}
            onClick={() => handlePostpone(localDatePlus(1))}
            className="px-2.5 py-1.5 rounded-lg bg-white border border-rhozly-outline/15 text-[11px] font-black text-rhozly-on-surface/70 hover:border-rhozly-primary/30"
          >
            Tomorrow
          </button>
          <button
            type="button"
            data-testid={`walk-task-postpone-3d-${task.id}`}
            onClick={() => handlePostpone(localDatePlus(3))}
            className="px-2.5 py-1.5 rounded-lg bg-white border border-rhozly-outline/15 text-[11px] font-black text-rhozly-on-surface/70 hover:border-rhozly-primary/30"
          >
            +3 days
          </button>
          <input
            type="date"
            data-testid={`walk-task-postpone-date-${task.id}`}
            value={pickedDate}
            min={localDatePlus(1)}
            onChange={(e) => setPickedDate(e.target.value)}
            className="px-2 py-1 rounded-lg bg-white border border-rhozly-outline/15 text-[11px] font-bold text-rhozly-on-surface"
          />
          <button
            type="button"
            data-testid={`walk-task-postpone-confirm-${task.id}`}
            onClick={() => handlePostpone(pickedDate)}
            disabled={!pickedDate}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rhozly-primary text-white text-[11px] font-black disabled:opacity-40"
          >
            Move
            <ChevronRight size={12} />
          </button>
        </div>
      )}

      {/* Harvest sheets — the EXACT components Task Detail mounts (they
          portal to document.body above the walk's own sheets). */}
      <HarvestRipenessSheet
        isOpen={ripenessOpen}
        onClose={() => setRipenessOpen(false)}
        homeId={homeId}
        taskTitle={task.title}
        plantName={plantNameGuess}
        onReady={handleHarvested}
        onSnoozeFor={(d) =>
          handleSnooze(Math.max(1, Math.min(28, Math.round(d))))
        }
      />
      {instanceIds.length > 0 && (
        <HarvestPartialPickSheet
          isOpen={partialOpen}
          onClose={() => setPartialOpen(false)}
          homeId={homeId}
          instanceIds={instanceIds}
          taskTitle={task.title}
          plantName={plantNameGuess}
          onLogged={(days) => handleSnooze(days)}
        />
      )}
      {eolTaskId && (
        <HarvestEndOfLifePrompt
          isOpen
          homeId={homeId}
          taskId={eolTaskId}
          taskTitle={task.title}
          inventoryItemIds={instanceIds}
          onClose={() => setEolTaskId(null)}
        />
      )}
      {harvestYieldSheet}
    </div>
  );
}
