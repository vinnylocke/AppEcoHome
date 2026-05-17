// Task Optimiser — pure analysis logic (no React, no Supabase calls)
// All inputs are plain data already fetched by the caller.

export type OptimisableCategory = "Watering" | "Harvesting" | "Pruning" | "Maintenance" | "Planting";
export const OPTIMISABLE_CATEGORIES: OptimisableCategory[] = ["Watering", "Harvesting", "Pruning"];

export interface OptimiserBlueprint {
  id: string;
  title: string;
  task_type: string;
  frequency_days: number | null;
  start_date: string | null;
  area_id: string | null;
  location_id: string | null;
  inventory_item_ids: string[];
  description: string | null;
  is_recurring: boolean | null;
}

export interface OptimiserPlantInstance {
  id: string;
  plant_name: string;
  area_id: string | null;
}

export type ScenarioType =
  | "fragmentation" | "redundant" | "two-tier" | "pileup"
  | "frequency-change" | "new-blueprint" | "retire";

export interface ProposalBeforeItem {
  blueprintId: string;
  title: string;
  frequencyDays: number | null;
  plantNames: string[];
}

export interface ProposalAfterItem {
  title: string;
  frequencyDays: number;
  plantNames: string[];
  isNew: boolean;
  retainedBlueprintId?: string;
}

export interface OptimisationProposal {
  id: string;
  scenario: ScenarioType;
  areaId: string;
  category: OptimisableCategory;
  displayText: string;
  before: ProposalBeforeItem[];
  after: ProposalAfterItem[];
  blueprintsToArchive: string[];
  plantInstanceIdsForNewBlueprint: string[];
  newBlueprintTitle: string;
  newBlueprintFrequencyDays: number;
  newBlueprintDescription: string;
  source: "rule" | "ai";
  reasoning?: string;
  frequencyChanges?: { blueprintId: string; newFrequencyDays: number }[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dayOffset(startDate: string | null, frequencyDays: number): number {
  if (!startDate || frequencyDays <= 0) return 0;
  const epoch = new Date("2024-01-01").getTime();
  const start = new Date(startDate).getTime();
  const diffDays = Math.floor((start - epoch) / 86_400_000);
  return ((diffDays % frequencyDays) + frequencyDays) % frequencyDays;
}

function plantNamesFor(
  bp: OptimiserBlueprint,
  instanceMap: Map<string, OptimiserPlantInstance>,
): string[] {
  return bp.inventory_item_ids
    .map((id) => instanceMap.get(id)?.plant_name ?? "Unknown Plant")
    .filter(Boolean);
}

function buildDescription(plantNames: string[], areaName: string): string {
  const list = plantNames.join(", ");
  return `Covers: ${list} in ${areaName}`;
}

function proposalId(category: string, areaId: string, scenario: string): string {
  return `${scenario}-${category}-${areaId}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function analyseArea(
  areaId: string,
  areaName: string,
  blueprints: OptimiserBlueprint[],
  instanceMap: Map<string, OptimiserPlantInstance>,
): OptimisationProposal[] {
  const proposals: OptimisationProposal[] = [];

  for (const category of OPTIMISABLE_CATEGORIES) {
    const inArea = blueprints.filter(
      (bp) =>
        bp.task_type === category &&
        bp.is_recurring &&
        (bp.area_id === areaId ||
          bp.inventory_item_ids.some((id) => instanceMap.get(id)?.area_id === areaId)),
    );

    if (inArea.length < 2) continue;

    const areaLevel = inArea.filter((bp) => bp.area_id === areaId && bp.inventory_item_ids.length === 0);
    const instanceLevel = inArea.filter((bp) => bp.inventory_item_ids.length > 0);

    // Scenario B — area blueprint exists AND instance blueprints exist
    if (areaLevel.length > 0 && instanceLevel.length > 0) {
      const archiveIds = instanceLevel.map((bp) => bp.id);
      const allPlantIds = [...new Set(instanceLevel.flatMap((bp) => bp.inventory_item_ids))];
      const allPlantNames = allPlantIds.map((id) => instanceMap.get(id)?.plant_name ?? "Unknown");

      proposals.push({
        id: proposalId(category, areaId, "redundant"),
        scenario: "redundant",
        areaId,
        category,
        source: "rule",
        displayText: `${areaName} already has an area-wide ${category} blueprint. ${instanceLevel.length} plant-level ${category} blueprint${instanceLevel.length > 1 ? "s are" : " is"} redundant → archive them.`,
        before: instanceLevel.map((bp) => ({
          blueprintId: bp.id,
          title: bp.title,
          frequencyDays: bp.frequency_days,
          plantNames: plantNamesFor(bp, instanceMap),
        })),
        after: areaLevel.map((bp) => ({
          title: bp.title,
          frequencyDays: bp.frequency_days ?? 7,
          plantNames: allPlantNames,
          isNew: false,
          retainedBlueprintId: bp.id,
        })),
        blueprintsToArchive: archiveIds,
        plantInstanceIdsForNewBlueprint: allPlantIds,
        newBlueprintTitle: areaLevel[0].title,
        newBlueprintFrequencyDays: areaLevel[0].frequency_days ?? 7,
        newBlueprintDescription: buildDescription(allPlantNames, areaName),
      });
      continue;
    }

    // All instance-level from here
    if (instanceLevel.length < 2) continue;

    const frequencies = instanceLevel.map((bp) => bp.frequency_days ?? 7);
    const minFreq = Math.min(...frequencies);
    const maxFreq = Math.max(...frequencies);

    // Scenario C — two-tier: max frequency is >2× the min
    if (maxFreq > minFreq * 2) {
      // mainstream = at/near minimum frequency, outliers = the rest
      const mainstream = instanceLevel.filter((bp) => (bp.frequency_days ?? 7) <= minFreq * 2);
      const outliers = instanceLevel.filter((bp) => (bp.frequency_days ?? 7) > minFreq * 2);

      const mainPlantIds = [...new Set(mainstream.flatMap((bp) => bp.inventory_item_ids))];
      const mainPlantNames = mainPlantIds.map((id) => instanceMap.get(id)?.plant_name ?? "Unknown");
      const outlierNames = outliers.flatMap((bp) => plantNamesFor(bp, instanceMap));

      proposals.push({
        id: proposalId(category, areaId, "two-tier"),
        scenario: "two-tier",
        areaId,
        category,
        source: "rule",
        displayText: `${mainstream.length} of ${instanceLevel.length} plants need ${category.toLowerCase()} every ${minFreq} days. ${outlierNames.join(", ")} need${outliers.length === 1 ? "s" : ""} every ${maxFreq} days → create area blueprint for the ${mainstream.length} common plants, keep outlier blueprint${outliers.length > 1 ? "s" : ""} as-is.`,
        before: instanceLevel.map((bp) => ({
          blueprintId: bp.id,
          title: bp.title,
          frequencyDays: bp.frequency_days,
          plantNames: plantNamesFor(bp, instanceMap),
        })),
        after: [
          {
            title: `${areaName} — ${category} (every ${minFreq} days)`,
            frequencyDays: minFreq,
            plantNames: mainPlantNames,
            isNew: true,
          },
          ...outliers.map((bp) => ({
            title: bp.title,
            frequencyDays: bp.frequency_days ?? maxFreq,
            plantNames: plantNamesFor(bp, instanceMap),
            isNew: false,
            retainedBlueprintId: bp.id,
          })),
        ],
        blueprintsToArchive: mainstream.map((bp) => bp.id),
        plantInstanceIdsForNewBlueprint: mainPlantIds,
        newBlueprintTitle: `${areaName} — ${category} (every ${minFreq} days)`,
        newBlueprintFrequencyDays: minFreq,
        newBlueprintDescription: buildDescription(mainPlantNames, areaName),
      });
      continue;
    }

    // Scenario D — same-day pile-up (≥3 blueprints all firing on the same day)
    const byOffset = new Map<number, OptimiserBlueprint[]>();
    for (const bp of instanceLevel) {
      const freq = bp.frequency_days ?? 7;
      const off = dayOffset(bp.start_date, freq);
      const key = off; // group by offset regardless of freq for pile-up detection
      byOffset.set(key, [...(byOffset.get(key) ?? []), bp]);
    }

    const pileupGroups = [...byOffset.values()].filter((g) => g.length >= 3);
    if (pileupGroups.length > 0) {
      const group = pileupGroups[0];
      const groupFreqs = group.map((bp) => bp.frequency_days ?? 7);
      const groupMin = Math.min(...groupFreqs);
      const groupMax = Math.max(...groupFreqs);
      const compatible = groupMax <= groupMin * 2;

      if (compatible) {
        const allPlantIds = [...new Set(group.flatMap((bp) => bp.inventory_item_ids))];
        const allPlantNames = allPlantIds.map((id) => instanceMap.get(id)?.plant_name ?? "Unknown");

        proposals.push({
          id: proposalId(category, areaId, "pileup"),
          scenario: "pileup",
          areaId,
          category,
          source: "rule",
          displayText: `${group.length} ${category} blueprints in ${areaName} all fire on the same day → consolidate into 1 area blueprint every ${groupMin} days.`,
          before: group.map((bp) => ({
            blueprintId: bp.id,
            title: bp.title,
            frequencyDays: bp.frequency_days,
            plantNames: plantNamesFor(bp, instanceMap),
          })),
          after: [
            {
              title: `${areaName} — ${category} (every ${groupMin} days)`,
              frequencyDays: groupMin,
              plantNames: allPlantNames,
              isNew: true,
            },
          ],
          blueprintsToArchive: group.map((bp) => bp.id),
          plantInstanceIdsForNewBlueprint: allPlantIds,
          newBlueprintTitle: `${areaName} — ${category} (every ${groupMin} days)`,
          newBlueprintFrequencyDays: groupMin,
          newBlueprintDescription: buildDescription(allPlantNames, areaName),
        });
        continue;
      }
      // incompatible frequencies — informational only, no auto-fix proposal
    }

    // Scenario A — fragmentation: ≥2 instance blueprints firing on different days
    const offsets = instanceLevel.map((bp) => ({
      bp,
      offset: dayOffset(bp.start_date, bp.frequency_days ?? 7),
    }));
    const distinctOffsets = new Set(offsets.map((o) => o.offset));

    if (distinctOffsets.size >= 2 || frequencies.some((f) => f !== frequencies[0])) {
      const allPlantIds = [...new Set(instanceLevel.flatMap((bp) => bp.inventory_item_ids))];
      const allPlantNames = allPlantIds.map((id) => instanceMap.get(id)?.plant_name ?? "Unknown");

      proposals.push({
        id: proposalId(category, areaId, "fragmentation"),
        scenario: "fragmentation",
        areaId,
        category,
        source: "rule",
        displayText: `${instanceLevel.length} ${category} blueprints across ${instanceLevel.length} plants in ${areaName}, firing on different days → consolidate into 1 area blueprint every ${minFreq} days.`,
        before: instanceLevel.map((bp) => ({
          blueprintId: bp.id,
          title: bp.title,
          frequencyDays: bp.frequency_days,
          plantNames: plantNamesFor(bp, instanceMap),
        })),
        after: [
          {
            title: `${areaName} — ${category} (every ${minFreq} days)`,
            frequencyDays: minFreq,
            plantNames: allPlantNames,
            isNew: true,
          },
        ],
        blueprintsToArchive: instanceLevel.map((bp) => bp.id),
        plantInstanceIdsForNewBlueprint: allPlantIds,
        newBlueprintTitle: `${areaName} — ${category} (every ${minFreq} days)`,
        newBlueprintFrequencyDays: minFreq,
        newBlueprintDescription: buildDescription(allPlantNames, areaName),
      });
    }
  }

  return proposals;
}

// ---------------------------------------------------------------------------
// Undo eligibility check (pure — compares timestamps only)
// ---------------------------------------------------------------------------
export function canUndoSession(
  session: { applied_at: string; is_reversed: boolean },
  createdBlueprints: { updated_at: string | null; created_at: string | null }[],
): { eligible: boolean; reason?: string } {
  if (session.is_reversed) return { eligible: false, reason: "Already reversed" };

  const appliedAt = new Date(session.applied_at).getTime();
  const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
  if (appliedAt < ninetyDaysAgo) return { eligible: false, reason: "Older than 90 days" };

  for (const bp of createdBlueprints) {
    const createdAt = bp.created_at ? new Date(bp.created_at).getTime() : appliedAt;
    const updatedAt = bp.updated_at ? new Date(bp.updated_at).getTime() : createdAt;
    if (updatedAt > appliedAt + 5000) {
      return { eligible: false, reason: "Blueprint was manually edited after optimisation" };
    }
  }

  return { eligible: true };
}
