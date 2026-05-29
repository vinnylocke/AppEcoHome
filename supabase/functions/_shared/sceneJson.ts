/**
 * Tolerant parse for the Multi-ID ("identify_scene") response. Gemini's
 * vision/thinking models can occasionally prepend prose ("Here is the…"),
 * wrap the JSON in a code fence, or truncate mid-array when reasoning eats the
 * token budget. This:
 *   1. strips code fences + a prose preamble (slices to the outermost { … }),
 *   2. on a truncated array, salvages every COMPLETE region object,
 *   3. never throws — returns `{ regions: [] }` so the caller can show an empty
 *      state instead of failing the request.
 */
export function parseSceneJson(text: string): { notes?: string; regions?: unknown[] } {
  const cleaned = String(text ?? "")
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  try { return JSON.parse(cleaned); } catch { /* fall through */ }

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { /* fall through */ }
  }

  // Salvage complete region objects from a truncated `"regions": [ … ]` array.
  const regionsKey = cleaned.indexOf('"regions"');
  const arrStart = regionsKey !== -1 ? cleaned.indexOf("[", regionsKey) : -1;
  if (arrStart !== -1) {
    const regions: unknown[] = [];
    let depth = 0;
    let objStart = -1;
    for (let i = arrStart + 1; i < cleaned.length; i++) {
      const ch = cleaned[i];
      if (ch === "{") { if (depth === 0) objStart = i; depth++; }
      else if (ch === "}") {
        depth--;
        if (depth === 0 && objStart !== -1) {
          try { regions.push(JSON.parse(cleaned.slice(objStart, i + 1))); } catch { /* skip partial */ }
          objStart = -1;
        }
      } else if (ch === "]" && depth === 0) break;
    }
    if (regions.length) return { regions };
  }

  return { regions: [] };
}
