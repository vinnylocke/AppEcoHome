import type { PatternDetector, PatternHit } from "./index.ts";

// Fires when a recurring blueprint has been postponed >= THRESHOLD times in WINDOW_DAYS.
// Works on both ghost tasks (blueprint_id parsed from ID string) and physical tasks
// (batch-looked up from the tasks table). Does not require a linked plant.
const THRESHOLD = 4;
const WINDOW_DAYS = 30;

function extractGhostBlueprintId(taskId: string): string | null {
  if (!taskId.startsWith("ghost-")) return null;
  // Format: ghost-<blueprint_uuid>-YYYY-MM-DD
  // Strip "ghost-" prefix (6 chars) then strip trailing "-YYYY-MM-DD" (11 chars)
  const inner = taskId.slice(6);
  return inner.slice(0, -11);
}

const blueprintPostponeRate: PatternDetector = {
  id: "blueprint_postpone_rate",
  label: "Blueprint Postpone Rate",

  async detect(userId, _homeId, db): Promise<PatternHit[]> {
    const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();

    const { data: events } = await db
      .from("user_events")
      .select("meta")
      .eq("user_id", userId)
      .eq("event_type", "task_postponed")
      .gte("created_at", since);

    if (!events?.length) return [];

    // Split into parseable ghost IDs and physical task IDs that need a DB lookup
    const ghostCounts = new Map<string, number>();
    const physicalTaskIds: string[] = [];

    for (const e of events) {
      const taskId = e.meta?.task_id as string | undefined;
      if (!taskId) continue;
      const ghostBpId = extractGhostBlueprintId(taskId);
      if (ghostBpId) {
        ghostCounts.set(ghostBpId, (ghostCounts.get(ghostBpId) ?? 0) + 1);
      } else {
        physicalTaskIds.push(taskId);
      }
    }

    // Batch-resolve physical task IDs → blueprint_id
    const physicalCounts = new Map<string, number>();
    if (physicalTaskIds.length) {
      const { data: taskRows } = await db
        .from("tasks")
        .select("id, blueprint_id")
        .in("id", physicalTaskIds)
        .not("blueprint_id", "is", null);

      for (const row of taskRows ?? []) {
        physicalCounts.set(row.blueprint_id, (physicalCounts.get(row.blueprint_id) ?? 0) + 1);
      }
    }

    // Merge counts from both sources
    const totalCounts = new Map<string, number>(ghostCounts);
    for (const [bpId, n] of physicalCounts) {
      totalCounts.set(bpId, (totalCounts.get(bpId) ?? 0) + n);
    }

    // Filter to blueprints that cross the threshold
    const qualifyingIds = [...totalCounts.entries()]
      .filter(([, n]) => n >= THRESHOLD)
      .map(([id]) => id);

    if (!qualifyingIds.length) return [];

    // Fetch blueprint titles for readable insight text
    const { data: bpRows } = await db
      .from("task_blueprints")
      .select("id, title")
      .in("id", qualifyingIds);

    const titleMap = new Map((bpRows ?? []).map((b: any) => [b.id, b.title as string]));

    return qualifyingIds.map((bpId) => ({
      blueprintId: bpId,
      rawData: {
        count: totalCounts.get(bpId)!,
        task_name: titleMap.get(bpId) ?? "Unknown task",
        window_days: WINDOW_DAYS,
      },
    }));
  },
};

export default blueprintPostponeRate;
