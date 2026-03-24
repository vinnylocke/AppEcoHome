import { parse, startOfMonth, endOfMonth, eachMonthOfInterval, isValid } from 'date-fns';

/**
 * Parses a harvest month string like "July - September" or "August"
 * and returns an array of month indices (0-11) it covers.
 */
export function parseHarvestMonths(harvestStr: string | undefined): number[] {
  if (!harvestStr) return [];

  // Common formats: "July - September", "July-September", "July", "July to September"
  const normalized = harvestStr.toLowerCase().replace(/\s+/g, ' ');
  const parts = normalized.split(/[-–—]| to /);

  const monthNames = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december'
  ];

  const getMonthIndex = (name: string) => {
    const cleanName = name.trim();
    return monthNames.findIndex(m => m.startsWith(cleanName));
  };

  if (parts.length === 1) {
    const idx = getMonthIndex(parts[0]);
    return idx !== -1 ? [idx] : [];
  }

  if (parts.length === 2) {
    const startIdx = getMonthIndex(parts[0]);
    const endIdx = getMonthIndex(parts[1]);

    if (startIdx === -1 || endIdx === -1) return [];

    const indices: number[] = [];
    let current = startIdx;
    while (current !== endIdx) {
      indices.push(current);
      current = (current + 1) % 12;
    }
    indices.push(endIdx);
    return indices;
  }

  return [];
}
