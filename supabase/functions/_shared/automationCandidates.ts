/**
 * Candidate selection for the hybrid automation engine.
 *
 * `evaluate-automations` runs in three scopes:
 *   - event   (`{ deviceId }`): on a new `device_readings` row, evaluate only the
 *               automations whose sensor leaves watch that device — near-real-time.
 *   - time    (`{ scope: "time" }`, 5-min cron): clock-driven automations
 *               (time / date_range / weather leaves).
 *   - all     (`{ scope: "all" }`, 15-min safety cron + back-compat): everything —
 *               the catch-all that also re-evaluates sensor automations for
 *               cooldown / run-limit aging if an event was ever missed.
 *
 * These predicates pick the right set. Pure — unit-tested without a DB.
 */

import type { ConditionNode } from "./conditionTree.ts";

/** Does the tree contain a clock-driven leaf (time / date_range / weather)? */
export function treeHasTimeTrigger(node: ConditionNode): boolean {
  if (node.kind === "group") return node.children.some(treeHasTimeTrigger);
  return node.kind === "time" || node.kind === "date_range" || node.kind === "weather";
}

/** Does the tree contain a sensor leaf? */
export function treeHasSensorTrigger(node: ConditionNode): boolean {
  if (node.kind === "group") return node.children.some(treeHasSensorTrigger);
  return node.kind === "sensor";
}

/**
 * Is this automation affected by a reading from `deviceId` (which lives in
 * `deviceAreaId`)? True when a sensor leaf either lists the device explicitly,
 * OR is area-scoped (no `sensorIds`) to the device's area — via the leaf's own
 * `areaId` or, when the leaf doesn't set one, the automation's `area_id`. Pure.
 */
export function treeAffectedByDevice(
  node: ConditionNode,
  deviceId: string,
  deviceAreaId: string | null,
  automationAreaId: string | null,
): boolean {
  if (node.kind === "group") {
    return node.children.some((c) => treeAffectedByDevice(c, deviceId, deviceAreaId, automationAreaId));
  }
  if (node.kind !== "sensor") return false;
  if (node.sensorIds?.length) return node.sensorIds.includes(deviceId);
  const leafArea = node.areaId ?? automationAreaId;
  return leafArea != null && deviceAreaId != null && leafArea === deviceAreaId;
}
