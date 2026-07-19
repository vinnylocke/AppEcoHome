// Genus-tinted plant placeholder helpers (design overhaul Phase 4.3).
//
// Unphotographed plants used to all share one Unsplash forest photo, making a
// grid of them unscannable. These helpers derive a stable identity for the
// placeholder tile instead: a tint keyed on the plant's GENUS (so a bed of
// Solanum — tomato, potato, aubergine — all get the same tint and read as a
// family) plus the common name's initial as the glyph. Pure functions, no
// React — the tile itself lives in src/components/ui/PlantInitialTile.tsx.

import { getTokenColorForKey } from "./garden/plantTokens";

export interface PlantPlaceholderSource {
  scientific_name?: string[] | null;
  common_name?: string | null;
}

/**
 * Colour key for a plant's placeholder tint. The genus when we know it (first
 * word of `scientific_name[0]`, lowercased) so same-genus plants share a
 * colour; the lowercased common name when we don't; `"plant"` as the final
 * fallback so a nameless plant still gets a deterministic tint.
 */
export function plantPlaceholderKey(p: PlantPlaceholderSource): string {
  const sci = p.scientific_name?.[0]?.trim();
  if (sci) {
    const genus = sci.split(/\s+/)[0].toLowerCase();
    if (genus) return genus;
  }
  const common = p.common_name?.trim().toLowerCase();
  return common || "plant";
}

/** Glyph for the placeholder tile: the common name's first letter, `"?"` when unnamed. */
export function plantPlaceholderInitial(p: Pick<PlantPlaceholderSource, "common_name">): string {
  const first = p.common_name?.trim().charAt(0);
  return first ? first.toUpperCase() : "?";
}

/** Palette colour for the placeholder tint — `getTokenColorForKey` over {@link plantPlaceholderKey}. */
export function plantPlaceholderColor(p: PlantPlaceholderSource): string {
  return getTokenColorForKey(plantPlaceholderKey(p));
}
