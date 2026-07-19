import { cn } from "../../lib/cn";
import {
  plantPlaceholderColor,
  plantPlaceholderInitial,
  type PlantPlaceholderSource,
} from "../../lib/plantPlaceholder";

export interface PlantInitialTileProps {
  plant: PlantPlaceholderSource;
  className?: string;
  "data-testid"?: string;
}

/**
 * The photo-less plant tile. Replaces the shared Unsplash forest-photo
 * fallback: every unphotographed plant used to look identical, so grids of
 * them were unscannable. Instead we show the common name's initial on a soft
 * genus-keyed tint — a bed of Solanum (tomato, potato, aubergine) all share
 * one tint and read as a family at a glance. A real photo always wins; only
 * render this when there is no `thumbnail_url`.
 *
 * Fills its parent (the card's image slot sets the height), and is
 * `aria-hidden` — the surrounding card already carries the plant's name, so
 * the glyph is decoration, not information.
 */
export function PlantInitialTile({
  plant,
  className,
  "data-testid": testId = "plant-initial-tile",
}: PlantInitialTileProps) {
  const color = plantPlaceholderColor(plant);
  return (
    // The utility classes are the pre-color-mix() fallback: WebViews older
    // than Chromium 111 / iOS 16.2 drop the inline declarations as invalid
    // and the tile degrades to a neutral surface with a legible initial.
    <div
      aria-hidden
      data-testid={testId}
      className={cn(
        "w-full h-full flex items-center justify-center bg-rhozly-surface-low",
        className,
      )}
      style={{
        backgroundColor: `color-mix(in srgb, ${color} 14%, var(--color-rhozly-surface-low))`,
      }}
    >
      <span
        className="font-display font-black text-4xl select-none text-rhozly-on-surface/60"
        style={{ color: `color-mix(in srgb, ${color} 80%, var(--color-rhozly-on-surface))` }}
      >
        {plantPlaceholderInitial(plant)}
      </span>
    </div>
  );
}
