/**
 * Tolerant JSON extraction for AI responses.
 *
 * Even in JSON mode, a model occasionally wraps its output in a ```json fence
 * or adds a prose preamble/suffix ("Here is the result: { … }. Hope this
 * helps!"). A raw `JSON.parse` then throws "invalid JSON" and 500s the action.
 * This strips a code fence and trims surrounding prose down to the outermost
 * JSON object/array before parsing. Pure + unit-tested.
 */
export function extractJsonObject(text: string): unknown {
  let raw = (text ?? "").trim();
  if (!raw) throw new Error("Empty AI response");

  // 1. Strip a ```json … ``` (or bare ```) fence if present.
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) raw = fence[1].trim();

  // 2. Drop any prose before the first { or [.
  if (!(raw.startsWith("{") || raw.startsWith("["))) {
    const firstObj = raw.indexOf("{");
    const firstArr = raw.indexOf("[");
    const start = firstArr === -1 ? firstObj
      : firstObj === -1 ? firstArr
      : Math.min(firstObj, firstArr);
    if (start > 0) raw = raw.slice(start);
  }

  // 3. Drop any prose after the last } or ].
  const lastClose = Math.max(raw.lastIndexOf("}"), raw.lastIndexOf("]"));
  if (lastClose >= 0 && lastClose < raw.length - 1) raw = raw.slice(0, lastClose + 1);

  return JSON.parse(raw);
}
