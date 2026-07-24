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

/**
 * Convert an assistant markdown reply into clean plain text for text-to-speech
 * so the synth voice never reads literal markdown aloud ("asterisk asterisk
 * bold", "hash heading"). Builds on sanitizeAssistantText (drops images + code)
 * then removes the remaining line- and inline-level markers, keeping the words.
 * The chat bubble still renders the markdown visually; this is TTS-only. Pure.
 */
export function markdownToSpeech(text: string): string {
  if (!text) return "";
  let t = sanitizeAssistantText(text); // drop images + fenced code first
  t = t.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1"); // [label](url) → label
  t = t.replace(/`([^`]+)`/g, "$1"); // `code` → code
  // Line-level markers first, before the stray-marker sweep nukes * and _.
  t = t.replace(/^\s{0,3}#{1,6}\s+/gm, ""); // ## Heading → Heading
  t = t.replace(/^\s{0,3}>\s?/gm, ""); // > quote → quote
  t = t.replace(/^\s{0,3}[-+*]\s+/gm, ""); // "- item" / "* item" → item
  // Inline emphasis: keep the words, drop the markers.
  t = t.replace(/(\*\*|__)(.*?)\1/g, "$2");
  t = t.replace(/(\*|_)(.*?)\1/g, "$2");
  t = t.replace(/[*_~]/g, ""); // any stray emphasis/strikethrough markers
  t = t.replace(/\|/g, " "); // table pipes
  return t
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n") // drop spaces left dangling before a newline
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
