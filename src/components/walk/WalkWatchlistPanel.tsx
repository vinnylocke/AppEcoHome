import React from "react";
import { Bug, Eye, Microscope, Sprout } from "lucide-react";
import { usePersona } from "../../hooks/usePersona";
import type { WalkWatchlistItem } from "../../lib/gardenWalk";

// RHO-17 Phase 3 — watchlist weaving. On the Home card this is the
// "look out for" digest of every active watchlist ailment; on an Area
// card it lists the ailments with active links among that area's plants.
// Read-only context: tapping an item opens the Watchlist (the walk
// session stays open, so the user gets the Resume prompt on return).
//
// Persona (§11): the "new" persona sees the first symptom line as a
// what-to-look-for hint; "experienced" gets names + type icons only.

interface Props {
  variant: "home" | "area";
  items: WalkWatchlistItem[];
  /** Open the Watchlist (navigate("/watchlist") in the walk). */
  onOpenWatchlist: () => void;
}

function typeIcon(type: string) {
  if (type === "pest") return <Bug size={13} />;
  if (type === "invasive_plant") return <Sprout size={13} />;
  return <Microscope size={13} />; // disease + anything else
}

function typeLabel(type: string): string {
  if (type === "pest") return "Pest";
  if (type === "invasive_plant") return "Invasive";
  return "Disease";
}

export default function WalkWatchlistPanel({
  variant,
  items,
  onOpenWatchlist,
}: Props) {
  const persona = usePersona();
  const isNew = persona !== "experienced"; // null ⇒ "new" (safer default)

  if (items.length === 0) return null;

  return (
    <div
      data-testid="walk-watchlist-panel"
      data-variant={variant}
      className="mb-4 rounded-2xl bg-white border border-amber-100 p-3"
    >
      <p className="text-[10px] font-black uppercase tracking-widest text-amber-800 mb-2 inline-flex items-center gap-1">
        <Eye size={11} />
        {variant === "home" ? "Look out for" : "Flagged in this bed"}
      </p>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              data-testid={`walk-watchlist-item-${item.id}`}
              onClick={onOpenWatchlist}
              className="w-full text-left rounded-xl px-2 py-1.5 hover:bg-amber-50/60 transition-colors"
            >
              <span className="flex items-center gap-1.5">
                <span className="shrink-0 text-amber-700">{typeIcon(item.type)}</span>
                <span className="text-sm font-bold text-rhozly-on-surface truncate">
                  {item.name}
                </span>
                <span className="shrink-0 text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40">
                  {typeLabel(item.type)}
                </span>
                {item.affectedPlantCount > 0 && (
                  <span className="ml-auto shrink-0 text-[10px] font-black px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                    {item.affectedPlantCount}{" "}
                    {item.affectedPlantCount === 1 ? "plant" : "plants"}
                  </span>
                )}
              </span>
              {isNew && item.firstSymptom && (
                <span
                  data-testid={`walk-watchlist-symptom-${item.id}`}
                  className="block mt-0.5 pl-5 text-[11px] font-bold text-rhozly-on-surface/50 leading-snug"
                >
                  Look for: {item.firstSymptom.toLowerCase()}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
      {isNew && variant === "home" && (
        <p
          data-testid="walk-watchlist-guidance"
          className="mt-2 text-[11px] font-bold text-rhozly-on-surface/45 leading-snug"
        >
          Keep these in the back of your mind as you walk — catching them on a
          leaf today is far easier than treating a bed next month.
        </p>
      )}
    </div>
  );
}
