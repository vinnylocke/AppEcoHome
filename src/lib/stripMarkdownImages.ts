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
