// Pure helpers for the automation builder's task / sensor chip pickers. Extracted
// so the "when to show a search box" threshold and the substring-filter (which
// must never hide an already-selected item) are unit-testable without React.

export const PICKER_FILTER_THRESHOLD = 6;

export interface PickerItem {
  id: string;
  name?: string;
  title?: string;
}

/** Surface a search box only once the list is long enough to be worth it. */
export function shouldShowPickerSearch(count: number, threshold = PICKER_FILTER_THRESHOLD): boolean {
  return count > threshold;
}

/**
 * Filter `items` by a case-insensitive name/title substring. An already-selected
 * item is ALWAYS kept in the result even when it doesn't match the query, so a
 * hidden selection is never silently dropped. An empty query returns everything.
 * Pure.
 */
export function filterPickerItems<T extends PickerItem>(
  items: T[],
  query: string,
  selected: string[],
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  const sel = new Set(selected);
  return items.filter((it) => (it.name ?? it.title ?? "").toLowerCase().includes(q) || sel.has(it.id));
}
