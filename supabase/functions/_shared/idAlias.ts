/**
 * ID aliasing helpers for AI prompts.
 *
 * Before calling Gemini, build a map of id → name for sensitive labels
 * (area names, location names, etc.). Pass IDs in the prompt instead of
 * names. After Gemini responds, call restoreNames / restoreNamesInObject
 * to swap IDs back to real names before the response reaches the client.
 */

export type AliasMap = Map<string, string>;

/** Build a lookup map from id → name for a list of named entities. */
export function buildAliasMap(items: { id: string; name: string }[]): AliasMap {
  const map = new Map<string, string>();
  for (const item of items) {
    map.set(item.id, item.name);
  }
  return map;
}

/** Replace all UUID keys found in `map` within a plain string. */
export function restoreNames(text: string, map: AliasMap): string {
  let result = text;
  for (const [id, name] of map) {
    result = result.replaceAll(id, name);
  }
  return result;
}

/**
 * Walk any JSON value and restore UUID keys found in all string leaves.
 * Safe to call on objects, arrays, primitives, or null.
 */
export function restoreNamesInObject(obj: unknown, map: AliasMap): unknown {
  if (typeof obj === "string") return restoreNames(obj, map);
  if (Array.isArray(obj)) return obj.map((item) => restoreNamesInObject(item, map));
  if (obj !== null && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = restoreNamesInObject(value, map);
    }
    return result;
  }
  return obj;
}
