import React, { useState, useEffect } from "react";
import { Sun, Droplets, Leaf, TriangleAlert, Bird } from "lucide-react";
import type { PlantDetails } from "../lib/verdantlyUtils";
import { formatOtherNames } from "../lib/plantNames";
import { supabase } from "../lib/supabase";
// Wave 22.0005 — reuse the canonical Lightbox so plant gallery thumbs
// enlarge in-app (with prev/next + arrow keys + per-image attribution)
// instead of opening the original in a new browser tab.
import { Lightbox, type GalleryImage } from "./DiagnosisImageGallery";

// ─── Label helpers ─────────────────────────────────────────────────────────────

function sunlightLabel(value: string): string {
  const map: Record<string, string> = {
    full_sun:       "Full Sun",
    part_shade:     "Partial Shade",
    full_shade:     "Full Shade",
    deep_shade:     "Full Shade",
    indirect_light: "Indirect Light",
  };
  if (map[value]) return map[value];
  return value.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function wateringLabel(details: PlantDetails): string {
  const max = details.watering_max_days;
  if (max != null) {
    if (max <= 2)  return "Frequent watering";
    if (max <= 7)  return "Moderate watering";
    if (max <= 14) return "Low water";
    return "Very low water";
  }
  const fallback = details.watering;
  if (!fallback) return "Watering unknown";
  const map: Record<string, string> = {
    Frequent: "Frequent watering",
    Average:  "Moderate watering",
    Minimum:  "Low water",
    None:     "Very low water",
  };
  return map[fallback] ?? fallback;
}

function toxicLabel(pets: boolean, humans: boolean): string {
  if (pets && humans) return "Toxic to both";
  if (pets)  return "Toxic to pets";
  return "Toxic to humans";
}

function wildlifeLabel(attracts: string[]): string {
  if (attracts.length <= 2) return "Attracts " + attracts.join(" & ");
  return "Attracts " + attracts.slice(0, 2).join(" & ") + " & more";
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  details: PlantDetails | null;
  loading: boolean;
  plantName?: string;
}

const DESCRIPTION_LIMIT = 300;

export default function PlantInfoPanel({ details, loading, plantName }: Props) {
  const [descExpanded, setDescExpanded] = useState(false);
  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([]);
  // Wave 22.0005 — in-app lightbox state. null = closed; otherwise the
  // index of the image to show first.
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const hasDetails = !!details;

  useEffect(() => {
    if (!plantName || !hasDetails) return;
    setGalleryImages([]);
    setGalleryLoading(true);
    supabase.functions
      .invoke("plant-image-search", { body: { query: plantName, count: 4 } })
      .then(({ data }) => { setGalleryImages(data?.images ?? []); })
      .catch(() => {})
      .finally(() => { setGalleryLoading(false); });
  }, [plantName, hasDetails]);

  if (loading && !details) {
    return (
      <div className="p-3 space-y-2.5 animate-pulse">
        <div className="flex flex-wrap gap-1.5">
          {[80, 96, 64].map((w, i) => (
            <div key={i} className={`h-6 bg-rhozly-surface-low rounded-full`} style={{ width: w }} />
          ))}
        </div>
        <div className="space-y-1.5">
          <div className="h-2.5 bg-rhozly-surface-low rounded w-full" />
          <div className="h-2.5 bg-rhozly-surface-low rounded w-4/5" />
        </div>
      </div>
    );
  }

  if (!details) {
    return (
      <p className="px-3 py-3 text-[10px] font-bold text-rhozly-on-surface/30 text-center">
        No information available.
      </p>
    );
  }

  const sunParts = (details.sunlight ?? []).map(sunlightLabel).filter(Boolean);
  const sunDisplay = sunParts.length > 0 ? sunParts.join(" / ") : null;
  const waterDisplay = wateringLabel(details);
  const isToxic = details.is_toxic_pets || details.is_toxic_humans;
  const hasWildlife = (details.attracts?.length ?? 0) > 0;

  const desc = details.description ?? "";
  const isTruncatable = desc.length > DESCRIPTION_LIMIT;
  const displayDesc = descExpanded || !isTruncatable
    ? desc
    : desc.slice(0, DESCRIPTION_LIMIT) + "…";

  const otherNames = formatOtherNames(details.other_names, [
    details.common_name,
    ...(Array.isArray(details.scientific_name) ? details.scientific_name : []),
  ]);

  return (
    <div className="p-3 space-y-2.5">
      {otherNames.length > 0 && (
        <p data-testid="plant-info-other-names" className="text-[11px] font-semibold text-rhozly-on-surface/45">
          <span className="font-black text-rhozly-on-surface/35">Also known as:</span> {otherNames.join(", ")}
        </p>
      )}
      {/* Pills row */}
      <div className="flex flex-wrap gap-1.5">
        {sunDisplay && (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-yellow-50 text-yellow-700 text-[10px] font-black">
            <Sun size={10} />
            {sunDisplay}
          </span>
        )}

        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-sky-50 text-sky-600 text-[10px] font-black">
          <Droplets size={10} />
          {waterDisplay}
        </span>

        {details.is_edible && (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-50 text-green-700 text-[10px] font-black">
            <Leaf size={10} />
            Edible
          </span>
        )}

        {isToxic && (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-50 text-red-600 text-[10px] font-black">
            <TriangleAlert size={10} />
            {toxicLabel(details.is_toxic_pets, details.is_toxic_humans)}
          </span>
        )}

        {hasWildlife && (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-rhozly-surface text-rhozly-on-surface/60 text-[10px] font-black">
            <Bird size={10} />
            {wildlifeLabel(details.attracts ?? [])}
          </span>
        )}
      </div>

      {/* Description */}
      {desc && (
        <div>
          <p className="text-[11px] font-semibold text-rhozly-on-surface/80 leading-relaxed">
            {displayDesc}
          </p>
          {isTruncatable && (
            <button
              onClick={() => setDescExpanded((v) => !v)}
              className="text-[10px] font-black text-rhozly-primary mt-1 hover:underline"
            >
              {descExpanded ? "Show less" : "Read more"}
            </button>
          )}
        </div>
      )}

      {/* Image gallery */}
      {plantName && (galleryLoading || galleryImages.length > 0) && (
        <div className="overflow-x-auto -mx-1">
          <div className="flex gap-1.5 px-1 pb-1">
            {galleryLoading && galleryImages.length === 0
              ? [0, 1, 2].map((i) => (
                  <div key={i} className="w-16 h-16 rounded-xl bg-rhozly-surface-low animate-pulse shrink-0" />
                ))
              : galleryImages.map((img, i) => (
                  <button
                    key={img.id}
                    type="button"
                    onClick={() => setLightboxIndex(i)}
                    aria-label={`Enlarge ${img.alt}`}
                    className="shrink-0 rounded-xl overflow-hidden block focus:outline-none focus:ring-2 focus:ring-rhozly-primary/40"
                  >
                    <img
                      src={img.thumb_url}
                      alt={img.alt}
                      className="w-16 h-16 object-cover hover:scale-105 transition-transform"
                    />
                  </button>
                ))
            }
          </div>
        </div>
      )}
      {lightboxIndex !== null && galleryImages.length > 0 && (
        <Lightbox
          images={galleryImages}
          startIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  );
}
