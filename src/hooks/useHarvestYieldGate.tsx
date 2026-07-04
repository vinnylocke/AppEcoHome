import React, { useCallback, useState } from "react";
import HarvestPartialPickSheet from "../components/HarvestPartialPickSheet";

// Shared "log the yield when a harvest is completed" flow, so every completion
// surface (task modal, garden walk, task list) opens the SAME yield prompt with
// one call. When a harvest task links to ≥1 plant the sheet asks for a yield
// (split-evenly or per-plant) before running `onDone`; non-harvest or unlinked
// tasks skip the prompt and run `onDone` immediately.
//
// Two continuations:
//  - `onDone`    — runs on "Log yield & complete" and on "Skip". For surfaces
//                  that gate BEFORE completing, this is the completion itself;
//                  for surfaces that already completed, it's the follow-up
//                  (e.g. queue the End-of-Life prompt).
//  - `onDismiss` — runs when the sheet is closed via the X. Omit it (default)
//                  for gate-before-complete surfaces so the X cancels; pass it
//                  equal to `onDone` for gate-after surfaces so any close still
//                  proceeds.

interface PendingHarvest {
  task: { id?: string; title?: string; type?: string; inventory_item_ids?: string[] };
  instanceIds: string[];
  plantName: string | null;
  onDone: () => void | Promise<void>;
  onDismiss?: () => void | Promise<void>;
}

interface RequestOpts {
  plantName?: string | null;
  /** Called when the sheet is dismissed via X (not submit/skip). */
  onDismiss?: () => void | Promise<void>;
}

export function useHarvestYieldGate(homeId: string) {
  const [pending, setPending] = useState<PendingHarvest | null>(null);

  const requestHarvestComplete = useCallback(
    (
      task: PendingHarvest["task"],
      onDone: () => void | Promise<void>,
      opts: RequestOpts = {},
    ) => {
      const instanceIds = Array.isArray(task?.inventory_item_ids)
        ? (task.inventory_item_ids as string[])
        : [];
      // Only harvest tasks with at least one linked plant carry a yield.
      // Accept the legacy "Harvest" synonym as well as the canonical "Harvesting".
      const isHarvest = task?.type === "Harvesting" || task?.type === "Harvest";
      if (isHarvest && instanceIds.length >= 1) {
        setPending({ task, instanceIds, plantName: opts.plantName ?? null, onDone, onDismiss: opts.onDismiss });
      } else {
        void onDone();
      }
    },
    [],
  );

  const complete = useCallback(async () => {
    const p = pending;
    setPending(null);
    if (p) await p.onDone();
  }, [pending]);

  const dismiss = useCallback(async () => {
    const p = pending;
    setPending(null);
    if (p?.onDismiss) await p.onDismiss();
  }, [pending]);

  const harvestYieldSheet = pending ? (
    <HarvestPartialPickSheet
      isOpen
      mode="final"
      homeId={homeId}
      instanceIds={pending.instanceIds}
      taskTitle={pending.task.title ?? "Harvest"}
      plantName={pending.plantName}
      onComplete={complete}
      onClose={dismiss}
    />
  ) : null;

  return { requestHarvestComplete, harvestYieldSheet };
}
