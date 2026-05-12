/**
 * Heuristic: binomial nomenclature has a capitalised genus followed by a
 * lowercase species epithet (e.g. "Monstera deliciosa", "Rosa canina").
 * Everything else — plain words, multi-capital phrases, single common words —
 * is treated as a common name.
 */
export function detectNameType(name: string): "common" | "scientific" {
  const trimmed = name.trim();
  // "Genus species" pattern: capital first word, then at least one lowercase word
  if (/^[A-Z][a-z]+ [a-z]/.test(trimmed)) return "scientific";
  return "common";
}
