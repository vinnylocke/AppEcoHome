// Removes markdown image syntax from AI chat text so a model that promises an
// image it can't deliver never renders a broken placeholder. Plant thumbnails
// come from the structured `suggested_plants` cards instead. Pure + tested.
//
// Strips inline images `![alt](url)` (the alt text is dropped) but leaves normal
// links `[text](url)` and ordinary text untouched.

export function stripMarkdownImages(text: string): string {
  if (!text) return text;
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // ![alt](url)
    .replace(/!\[[^\]]*\]\[[^\]]*\]/g, "") // ![alt][ref]
    .replace(/[ \t]{2,}/g, " ") // collapse runs of spaces left behind
    .replace(/\n{3,}/g, "\n\n") // collapse excess blank lines
    .trim();
}

/**
 * Remove fenced code blocks (```…```) from an assistant reply. In the gardening
 * chat these are never legitimate — they're the model leaking a tool call it
 * made (e.g. ```tool_code show_plant_images(...)```), which looked like a stray
 * code snippet under the plant card. Pure.
 */
export function stripCodeBlocks(text: string): string {
  if (!text) return text;
  return text
    .replace(/```[\s\S]*?```/g, "") // fenced blocks (incl. tool_code)
    .replace(/^[ \t]*`{1,2}[^`\n]*`{1,2}[ \t]*$/gm, "") // a whole line that's just inline code
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Full sanitiser for a rendered assistant reply: strip images + code blocks. */
export function sanitizeAssistantText(text: string): string {
  return stripCodeBlocks(stripMarkdownImages(text));
}
