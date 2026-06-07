import React, { useState, useEffect } from "react";
import { Images } from "lucide-react";
import { supabase } from "../lib/supabase";
import type { GalleryImage } from "./DiagnosisImageGallery";
import { Lightbox } from "./DiagnosisImageGallery";
import ImageCredit from "./credit/ImageCredit";
import { coerceImageCredit, isKnownCredit } from "../lib/imageCredit";

// ---------------------------------------------------------------------------
// Gallery modal — fetches images lazily when first opened
// ---------------------------------------------------------------------------
function GalleryModal({
  query,
  label,
  existingImageUrl,
  onClose,
}: {
  query: string;
  label: string;
  existingImageUrl?: string | null;
  onClose: () => void;
}) {
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    const stored: GalleryImage[] = existingImageUrl
      ? [{ id: "stored-0", thumb_url: existingImageUrl, full_url: existingImageUrl, alt: label, source: "stored" }]
      : [];

    // Open lightbox on stored image immediately while fetching
    if (stored.length) {
      setImages(stored);
      setLightboxIndex(0);
    }

    supabase.functions
      .invoke("plant-image-search", { body: { query, count: 9 } })
      .then(({ data, error }) => {
        if (cancelled) return;
        const fetched: GalleryImage[] = (!error && Array.isArray(data?.images)) ? data.images : [];
        setImages([...stored, ...fetched]);
        setLoading(false);
        // If no stored image was available, open on first fetched
        if (!stored.length && fetched.length) setLightboxIndex(0);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [query]);

  // Once the user closes the lightbox we close the whole modal
  const handleClose = () => {
    setLightboxIndex(null);
    onClose();
  };

  return (
    <>
      {/* Strip backdrop — visible while lightbox is closed between navigations */}
      {lightboxIndex === null && (
        <div
          className="fixed inset-0 z-[190] bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 gap-4"
          onClick={onClose}
        >
          <div className="text-white font-black text-sm uppercase tracking-widest mb-2 flex items-center gap-2">
            <Images size={14} /> {label}
          </div>

          {loading && images.length === 0 ? (
            <div className="flex gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="w-24 h-24 rounded-2xl bg-white/10 animate-pulse" />
              ))}
            </div>
          ) : (
            <div
              className="flex gap-3 overflow-x-auto pb-2 max-w-full"
              style={{ scrollbarWidth: "none" }}
              onClick={(e) => e.stopPropagation()}
            >
              {images.map((img, i) => {
                const credit = coerceImageCredit((img as any).image_credit);
                return (
                  <button
                    key={img.id}
                    onClick={() => setLightboxIndex(i)}
                    className="relative shrink-0 w-24 h-24 sm:w-28 sm:h-28 rounded-2xl overflow-hidden border-2 border-white/20 hover:border-white/60 transition-all"
                  >
                    <img src={img.thumb_url} alt={img.alt} className="w-full h-full object-cover" />
                    {isKnownCredit(credit) && (
                      <div
                        className="absolute bottom-1 right-1 z-[2]"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ImageCredit credit={credit} variant="badge-only" />
                      </div>
                    )}
                  </button>
                );
              })}
              {loading && (
                <div className="shrink-0 w-24 h-24 rounded-2xl bg-white/10 animate-pulse" />
              )}
            </div>
          )}

          <button
            onClick={onClose}
            className="mt-2 px-5 py-2 bg-white/10 text-white text-xs font-black rounded-xl hover:bg-white/20 transition-colors"
          >
            Close
          </button>
        </div>
      )}

      {lightboxIndex !== null && images.length > 0 && (
        <Lightbox
          images={images}
          startIndex={lightboxIndex}
          onClose={handleClose}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Public component — renders an expand button overlay on any image container.
//
// Usage: place inside a `position: relative` parent alongside the image.
//
//   <div className="relative h-44 overflow-hidden">
//     <SmartImage src={url} ... />
//     <MultiImageGallery
//       query="Monstera deliciosa plant"
//       label="Monstera Deliciosa"
//       existingImageUrl={plant.thumbnail_url}
//     />
//   </div>
// ---------------------------------------------------------------------------
interface Props {
  query: string;
  label: string;
  existingImageUrl?: string | null;
  /** Position class for the trigger button. Defaults to bottom-right. */
  triggerClassName?: string;
  /** Show icon only (no "Photos" label) — useful inside small image slots. */
  compact?: boolean;
}

export default function MultiImageGallery({
  query,
  label,
  existingImageUrl,
  triggerClassName = "absolute bottom-3 right-3",
  compact = false,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        data-testid="multi-image-gallery-btn"
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpen(true); }}
        className={`${triggerClassName} z-10 flex items-center gap-1 bg-black/50 backdrop-blur-sm text-white hover:bg-black/70 transition-colors shadow-lg ${compact ? "w-6 h-6 rounded-lg justify-center" : "px-2.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest gap-1.5"}`}
        title="View more photos"
      >
        <Images size={compact ? 12 : 11} />
        {!compact && "Photos"}
      </button>

      {open && (
        <GalleryModal
          query={query}
          label={label}
          existingImageUrl={existingImageUrl}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
