// Some agent tools are "display-only" — their result is surfaced through a
// dedicated UI element (e.g. `show_plant_images` becomes the `suggested_plants`
// photo gallery) rather than the generic ToolResultCard. Those must be dropped
// before rendering tool results, otherwise the card falls through to its JSON
// debug dump and the user sees a stray "code snippet". Pure + tested.
//
// The server already filters these out of new responses; this is the client-side
// guard so older/cached messages render cleanly too.

export const DISPLAY_ONLY_TOOLS = new Set<string>(["show_plant_images"]);

export function visibleToolResults<T extends { tool: string }>(
  results: T[] | null | undefined,
): T[] {
  if (!Array.isArray(results)) return [];
  return results.filter((r) => !DISPLAY_ONLY_TOOLS.has(r.tool));
}
