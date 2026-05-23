import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import {
  X, Leaf, BookOpen, Droplets, Sun, Sparkles, Flower2, Apple, ShieldAlert,
  Snowflake, Home as HomeIcon, AlertTriangle, Wheat,
} from "lucide-react";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import type { PlantLibraryRow } from "../../services/plantLibraryAdminService";

interface Props {
  row: PlantLibraryRow;
  /** Lazy-fetched fallback URL when row.thumbnail_url / image_url are null. */
  fallbackThumbnail: string | null;
  onClose: () => void;
  /** Called when the user wants to expand to the full care guide. */
  onOpenCareGuide: () => void;
}

/**
 * Compact "at a glance" preview triggered by the info icon on each
 * search result row. Larger image + description + a chip strip
 * covering the most useful per-trait facts. NOT the full care guide
 * — that's a separate modal — but the chip strip surfaces the most
 * useful things at a glance.
 *
 * Footer has a "View full care guide" button that hands off to
 * `PlantLibraryCareGuideModal` for the comprehensive view.
 */
export default function PlantLibraryQuickPreviewModal({
  row,
  fallbackThumbnail,
  onClose,
  onOpenCareGuide,
}: Props) {
  const trapRef = useFocusTrap<HTMLDivElement>(true);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "unset";
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const sciName = row.scientific_name?.[0] ?? null;
  const image = row.image_url || row.thumbnail_url || fallbackThumbnail || null;
  const chips = buildChips(row);

  return createPortal(
    <div
      data-testid="plant-library-quick-preview-modal"
      className="fixed inset-0 z-[100] flex items-end sm:items-center sm:justify-center bg-black/40 backdrop-blur-sm animate-in fade-in"
      onClick={onClose}
    >
      <div
        ref={trapRef}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full sm:max-w-md bg-rhozly-bg rounded-t-3xl sm:rounded-3xl shadow-2xl border border-rhozly-outline/15 flex flex-col max-h-[92vh] overflow-hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        {/* Header — close button only; the image takes pride of place below. */}
        <header className="shrink-0 px-5 pt-4 pb-2 flex items-start justify-end">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-10 h-10 rounded-2xl bg-white border border-rhozly-outline/15 text-rhozly-on-surface/60 hover:text-rhozly-primary flex items-center justify-center"
          >
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-4">
          {/* Hero image — wide tile so the user sees what the plant looks like. */}
          <div
            data-testid="plant-library-quick-preview-image"
            className="w-full aspect-[4/3] rounded-2xl bg-rhozly-surface-low border border-rhozly-outline/15 overflow-hidden flex items-center justify-center"
          >
            {image ? (
              <img
                src={image}
                alt={row.common_name}
                loading="lazy"
                className="w-full h-full object-cover"
              />
            ) : (
              <Leaf size={48} className="text-rhozly-on-surface/20" />
            )}
          </div>

          {/* Name + scientific name */}
          <div>
            <h2 className="font-display font-black text-rhozly-on-surface text-xl leading-tight">
              {row.common_name}
            </h2>
            {sciName && (
              <p className="text-xs text-rhozly-on-surface/55 italic mt-0.5">
                {sciName}
              </p>
            )}
          </div>

          {/* Description */}
          {row.description && (
            <p className="text-sm text-rhozly-on-surface/75 leading-relaxed">
              {row.description}
            </p>
          )}

          {/* Chip strip — only render the chips that have meaningful data. */}
          {chips.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {chips.map((chip, i) => (
                <span
                  key={i}
                  className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-full border ${chip.tone}`}
                >
                  {chip.icon}
                  {chip.label}
                </span>
              ))}
            </div>
          )}

          {!row.description && chips.length === 0 && (
            <p className="text-xs italic text-rhozly-on-surface/50">
              No description or care data populated for this row yet.
            </p>
          )}
        </div>

        {/* Footer — full care guide CTA */}
        <footer className="shrink-0 px-5 py-3 border-t border-rhozly-outline/10 flex items-center justify-end">
          <button
            type="button"
            data-testid="plant-library-quick-preview-open-care-guide"
            onClick={onOpenCareGuide}
            className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] rounded-xl bg-rhozly-primary text-white text-[11px] font-black uppercase tracking-widest hover:opacity-95 transition"
          >
            <BookOpen size={13} />
            View full care guide
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

interface Chip {
  label: string;
  icon: React.ReactNode;
  tone: string;
}

function buildChips(row: PlantLibraryRow): Chip[] {
  const out: Chip[] = [];

  if (row.cycle) {
    out.push({
      label: row.cycle,
      icon: <Leaf size={10} />,
      tone: "bg-emerald-50 text-emerald-700 border-emerald-100",
    });
  }
  if (row.watering) {
    out.push({
      label: `${row.watering} water`,
      icon: <Droplets size={10} />,
      tone: "bg-sky-50 text-sky-700 border-sky-100",
    });
  }
  if (row.watering_min_days != null || row.watering_max_days != null) {
    const range = formatRange(row.watering_min_days, row.watering_max_days);
    if (range) {
      out.push({
        label: `Water every ${range}d`,
        icon: <Droplets size={10} />,
        tone: "bg-sky-50 text-sky-700 border-sky-100",
      });
    }
  }
  if (Array.isArray(row.sunlight)) {
    row.sunlight.forEach((s) => {
      out.push({
        label: s,
        icon: <Sun size={10} />,
        tone: "bg-amber-50 text-amber-800 border-amber-100",
      });
    });
  }
  if (row.care_level) {
    out.push({
      label: `${row.care_level} care`,
      icon: <Sparkles size={10} />,
      tone: "bg-slate-50 text-slate-700 border-slate-100",
    });
  }
  const hardiness = formatRange(
    row.hardiness_min != null ? Number(row.hardiness_min) : null,
    row.hardiness_max != null ? Number(row.hardiness_max) : null,
  );
  if (hardiness) {
    out.push({
      label: `USDA ${hardiness}`,
      icon: <Snowflake size={10} />,
      tone: "bg-teal-50 text-teal-700 border-teal-100",
    });
  }
  if (row.is_edible) {
    out.push({
      label: "Edible",
      icon: <Apple size={10} />,
      tone: "bg-emerald-50 text-emerald-700 border-emerald-100",
    });
  }
  if (row.is_toxic_pets) {
    out.push({
      label: "Toxic to pets",
      icon: <ShieldAlert size={10} />,
      tone: "bg-rose-50 text-rose-800 border-rose-100",
    });
  }
  if (row.is_toxic_humans) {
    out.push({
      label: "Toxic to humans",
      icon: <ShieldAlert size={10} />,
      tone: "bg-rose-50 text-rose-800 border-rose-100",
    });
  }
  if (row.drought_tolerant) {
    out.push({
      label: "Drought tolerant",
      icon: <Sun size={10} />,
      tone: "bg-amber-50 text-amber-800 border-amber-100",
    });
  }
  if (row.indoor) {
    out.push({
      label: "Indoor",
      icon: <HomeIcon size={10} />,
      tone: "bg-violet-50 text-violet-700 border-violet-100",
    });
  }
  if (row.invasive) {
    out.push({
      label: "Invasive",
      icon: <AlertTriangle size={10} />,
      tone: "bg-orange-50 text-orange-800 border-orange-100",
    });
  }
  if (row.flowers) {
    out.push({
      label: "Flowering",
      icon: <Flower2 size={10} />,
      tone: "bg-pink-50 text-pink-700 border-pink-100",
    });
  }
  if (row.fruits) {
    out.push({
      label: "Fruiting",
      icon: <Apple size={10} />,
      tone: "bg-rose-50 text-rose-700 border-rose-100",
    });
  }
  if (Array.isArray(row.attracts) && row.attracts.length > 0) {
    row.attracts.forEach((a) => {
      out.push({
        label: `Attracts ${a}`,
        icon: <Wheat size={10} />,
        tone: "bg-lime-50 text-lime-700 border-lime-100",
      });
    });
  }
  const harvestRange = formatRange(row.days_to_harvest_min, row.days_to_harvest_max);
  if (harvestRange) {
    out.push({
      label: `Harvest in ${harvestRange}d`,
      icon: <Apple size={10} />,
      tone: "bg-amber-50 text-amber-800 border-amber-100",
    });
  }
  return out;
}

function formatRange(min: number | null | undefined, max: number | null | undefined): string | null {
  if (min == null && max == null) return null;
  if (min != null && max != null) {
    return min === max ? `${min}` : `${min}–${max}`;
  }
  return String(min ?? max);
}
