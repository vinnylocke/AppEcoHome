import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import {
  ExternalLink,
  Flag,
  X,
  Images,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import {
  coerceImageCredit,
  isKnownCredit,
  PROVIDER_LABEL,
} from "../lib/imageCredit";

export interface GalleryImage {
  id: string;
  thumb_url: string;
  full_url: string;
  alt: string;
  source: "unsplash" | "pixabay" | "wikipedia" | "stored";
  // Unsplash — required by license
  photo_page?: string;
  photographer_name?: string;
  photographer_url?: string;
  report_url?: string;
  // Wikipedia
  wiki_page?: string;
  // Pixabay
  pixabay_page?: string;
  // Wave 22.0002 — unified credit. Mirrors src/lib/imageCredit.ts.
  // Optional because legacy callers may not populate it yet.
  image_credit?: {
    provider: string;
    license_name?: string | null;
    license_url?: string | null;
    attribution?: string | null;
    source_url?: string | null;
    commercial_ok?: boolean | null;
  };
}

// ---------------------------------------------------------------------------
// Attribution helpers — vary per source
// ---------------------------------------------------------------------------
function LightboxAttribution({ image }: { image: GalleryImage }) {
  if (image.source === "unsplash" && image.photographer_name) {
    return (
      <p className="text-xs text-white/70">
        Photo by{" "}
        <a
          href={image.photographer_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-white underline hover:text-white/90"
          onClick={(e) => e.stopPropagation()}
        >
          {image.photographer_name}
        </a>{" "}
        on{" "}
        <a
          href="https://unsplash.com?utm_source=rhozly&utm_medium=referral"
          target="_blank"
          rel="noopener noreferrer"
          className="text-white underline hover:text-white/90"
          onClick={(e) => e.stopPropagation()}
        >
          Unsplash
        </a>
      </p>
    );
  }
  if (image.source === "wikipedia" && image.wiki_page) {
    return (
      <a
        href={image.wiki_page}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-white/70 underline hover:text-white/90 flex items-center gap-1"
        onClick={(e) => e.stopPropagation()}
      >
        <ExternalLink size={10} /> Source: Wikipedia
      </a>
    );
  }
  if (image.source === "pixabay" && image.pixabay_page) {
    return (
      <a
        href={image.pixabay_page}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-white/70 underline hover:text-white/90 flex items-center gap-1"
        onClick={(e) => e.stopPropagation()}
      >
        <ExternalLink size={10} /> via Pixabay
      </a>
    );
  }
  // Wave 22.0007 — fall back to the unified image_credit shape so plant
  // heroes (which only carry image_credit, no legacy per-source fields)
  // show their provider, attribution and licence in the Lightbox too.
  const credit = coerceImageCredit(image.image_credit);
  if (isKnownCredit(credit) && credit) {
    return (
      <div className="text-xs text-white/75 flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span className="font-bold">via {PROVIDER_LABEL[credit.provider]}</span>
        {credit.attribution && <span className="opacity-90">· {credit.attribution}</span>}
        {credit.license_name && credit.license_url && (
          <a
            href={credit.license_url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-white"
            onClick={(e) => e.stopPropagation()}
          >
            {credit.license_name}
          </a>
        )}
        {credit.license_name && !credit.license_url && (
          <span className="opacity-90">· {credit.license_name}</span>
        )}
        {credit.source_url && (
          <a
            href={credit.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-white inline-flex items-center gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink size={10} /> View original
          </a>
        )}
      </div>
    );
  }
  // No legacy fields, no image_credit — show the umbrella attribution
  // link so the "tap to learn the source" promise holds.
  return (
    <Link
      to="/credits"
      className="text-xs text-white/55 underline hover:text-white/80 inline-flex items-center gap-1"
      onClick={(e) => e.stopPropagation()}
    >
      Source unknown — see Credits
    </Link>
  );
}

function ThumbAttribution({ image }: { image: GalleryImage }) {
  if (image.source === "unsplash" && image.photographer_name) {
    return (
      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5">
        <a
          href={image.photographer_url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-[10px] text-white/80 font-bold truncate block hover:text-white leading-tight"
          title={`Photo by ${image.photographer_name} on Unsplash`}
        >
          {image.photographer_name}
        </a>
      </div>
    );
  }
  if (image.source === "wikipedia") {
    return (
      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1.5">
        <span className="text-[10px] text-white/70 font-bold leading-tight block">Wikipedia</span>
      </div>
    );
  }
  if (image.source === "pixabay") {
    return (
      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1.5">
        <span className="text-[10px] text-white/70 font-bold leading-tight block">Pixabay</span>
      </div>
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// Unsplash report modal — only relevant for Unsplash images
// ---------------------------------------------------------------------------
function ReportModal({
  image,
  onClose,
}: {
  image: GalleryImage;
  onClose: () => void;
}) {
  return createPortal(
    <div
      className="fixed inset-0 z-[210] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="font-black text-gray-900 flex items-center gap-2">
              <Flag size={16} className="text-red-500" /> Report Image
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Photo by{" "}
              <a
                href={image.photographer_url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-gray-700"
              >
                {image.photographer_name}
              </a>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={18} />
          </button>
        </div>
        <p className="text-sm text-gray-600 mb-5 leading-relaxed">
          If this image infringes copyright, is incorrectly attributed, or is
          otherwise inappropriate, you can report it directly via Unsplash's
          reporting system.
        </p>
        <a
          href={image.report_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full py-3 bg-red-50 border border-red-200 text-red-700 font-black rounded-2xl hover:bg-red-100 transition-colors text-sm"
          onClick={onClose}
        >
          <ExternalLink size={14} /> Report on Unsplash
        </a>
        <p className="text-xs text-gray-400 text-center mt-3 leading-relaxed">
          All Unsplash images are provided under the{" "}
          <a
            href="https://unsplash.com/license"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-gray-600"
          >
            Unsplash License
          </a>
          .
        </p>
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Lightbox — keyboard-navigable full-size viewer
// ---------------------------------------------------------------------------
export function Lightbox({
  images,
  startIndex,
  onClose,
}: {
  images: GalleryImage[];
  startIndex: number;
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(startIndex);
  const image = images[idx];
  const lightboxRef = useRef<HTMLDivElement>(null);

  const prev = () => setIdx((i) => (i > 0 ? i - 1 : images.length - 1));
  const next = () => setIdx((i) => (i < images.length - 1 ? i + 1 : 0));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [idx]);

  useEffect(() => {
    const lightbox = lightboxRef.current;
    if (!lightbox) return;
    const selector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const prev = document.activeElement as HTMLElement;
    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const els = lightbox.querySelectorAll<HTMLElement>(selector);
      const first = els[0], last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    };
    window.addEventListener("keydown", handleTab);
    lightbox.querySelectorAll<HTMLElement>(selector)[0]?.focus();
    return () => { window.removeEventListener("keydown", handleTab); prev?.focus(); };
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in"
      onClick={onClose}
    >
      <div
        ref={lightboxRef}
        className="relative max-w-2xl w-full flex flex-col items-center"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          aria-label="Close lightbox"
          className="absolute -top-3 -right-3 z-10 w-9 h-9 bg-white rounded-full flex items-center justify-center shadow-lg hover:bg-gray-100 transition-colors"
        >
          <X size={18} />
        </button>

        {/* Image */}
        <img
          src={image.full_url}
          alt={image.alt || "Reference image"}
          className="w-full max-h-[60vh] object-contain rounded-2xl shadow-2xl"
        />

        {/* Prev / Next */}
        {images.length > 1 && (
          <>
            <button
              onClick={prev}
              aria-label="Previous image"
              className="absolute left-2 top-1/2 -translate-y-1/2 w-11 h-11 bg-white/80 rounded-full flex items-center justify-center hover:bg-white transition-colors shadow"
            >
              <ChevronLeft size={20} />
            </button>
            <button
              onClick={next}
              aria-label="Next image"
              className="absolute right-2 top-1/2 -translate-y-1/2 w-11 h-11 bg-white/80 rounded-full flex items-center justify-center hover:bg-white transition-colors shadow"
            >
              <ChevronRight size={20} />
            </button>
          </>
        )}

        {/* Attribution row */}
        <div className="mt-3 flex items-center justify-between w-full px-1">
          <LightboxAttribution image={image} />
          <span className="text-xs text-white/40 tabular-nums shrink-0 ml-4">
            {idx + 1} / {images.length}
          </span>
        </div>

        {/* Source link (Unsplash only) */}
        {image.source === "unsplash" && image.photo_page && (
          <a
            href={image.photo_page}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 text-xs text-white/50 hover:text-white/80 flex items-center gap-1 transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink size={11} /> View original on Unsplash
          </a>
        )}
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Skeleton placeholder
// ---------------------------------------------------------------------------
function Skeleton() {
  return (
    <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="shrink-0 w-28 h-28 sm:w-32 sm:h-32 bg-gray-100 rounded-2xl animate-pulse" />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single thumbnail card
// ---------------------------------------------------------------------------
function ThumbnailImage({
  image,
  label,
  onClick,
  onReport,
}: {
  image: GalleryImage;
  label: string;
  onClick: () => void;
  onReport: () => void;
}) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div
      className="group shrink-0 w-28 h-28 sm:w-32 sm:h-32 rounded-2xl overflow-hidden relative border border-gray-100 shadow-sm cursor-zoom-in"
      onClick={onClick}
    >
      {!loaded && <div className="absolute inset-0 bg-gray-100 animate-pulse" />}
      <img
        src={image.thumb_url}
        alt={image.alt ? `${image.alt} — ${label}` : `Reference image for ${label}`}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        className={`w-full h-full object-cover transition-all duration-300 group-hover:scale-105 ${loaded ? "opacity-100" : "opacity-0"}`}
      />

      <ThumbAttribution image={image} />

      {/* Action icons — top right */}
      <div className="absolute top-1.5 right-1.5 flex flex-col gap-1">
        {image.source === "unsplash" && image.photo_page && (
          <>
            <a
              href={image.photo_page}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="w-6 h-6 bg-white/90 rounded-lg flex items-center justify-center shadow-sm hover:bg-white transition-colors"
              title="View on Unsplash"
            >
              <ExternalLink size={11} className="text-gray-700" />
            </a>
            <button
              onClick={(e) => { e.stopPropagation(); onReport(); }}
              className="w-6 h-6 bg-white/90 rounded-lg flex items-center justify-center shadow-sm hover:bg-red-50 transition-colors"
              title="Report this image"
            >
              <Flag size={11} className="text-gray-500" />
            </button>
          </>
        )}
        {image.source === "wikipedia" && image.wiki_page && (
          <a
            href={image.wiki_page}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="w-6 h-6 bg-white/90 rounded-lg flex items-center justify-center shadow-sm hover:bg-white transition-colors"
            title="View on Wikipedia"
          >
            <ExternalLink size={11} className="text-gray-700" />
          </a>
        )}
        {image.source === "pixabay" && image.pixabay_page && (
          <a
            href={image.pixabay_page}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="w-6 h-6 bg-white/90 rounded-lg flex items-center justify-center shadow-sm hover:bg-white transition-colors"
            title="View on Pixabay"
          >
            <ExternalLink size={11} className="text-gray-700" />
          </a>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main gallery component — inline strip + lightbox
// ---------------------------------------------------------------------------
interface Props {
  /** Search query sent to the image API */
  query: string;
  /** Human-readable label shown above the gallery */
  label: string;
  /** If provided, shown as the first image in the gallery */
  existingImageUrl?: string | null;
}

export default function DiagnosisImageGallery({ query, label, existingImageUrl }: Props) {
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [reportImage, setReportImage] = useState<GalleryImage | null>(null);

  const loadImages = () => {
    if (!query) return;
    let cancelled = false;
    setLoading(true);
    setFetchError(false);
    setImages([]);

    supabase.functions
      .invoke("plant-image-search", { body: { query, count: 9 } })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (!error && Array.isArray(data?.images)) {
          // Prepend the stored image if provided
          const stored: GalleryImage[] = existingImageUrl
            ? [{
                id: "stored-0",
                thumb_url: existingImageUrl,
                full_url: existingImageUrl,
                alt: label,
                source: "stored",
              }]
            : [];
          setImages([...stored, ...data.images]);
        } else {
          setFetchError(true);
        }
      })
      .catch(() => { if (!cancelled) setFetchError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  };

  useEffect(() => {
    const cancel = loadImages();
    return cancel;
  }, [query]);

  if (loading) return <Skeleton />;

  if (fetchError) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 px-4 rounded-2xl bg-gray-50 border border-gray-200 text-center">
        <p className="text-sm font-semibold text-gray-700">Couldn't load reference photos</p>
        <p className="text-xs text-gray-500">There was a problem fetching images. Please try again.</p>
        <button
          onClick={loadImages}
          className="mt-1 px-4 py-2 bg-rhozly-primary text-white text-sm font-black rounded-xl hover:opacity-90 active:scale-95 transition-all"
        >
          Retry
        </button>
      </div>
    );
  }

  if (images.length === 0) return null;

  return (
    <>
      <div>
        <p className="text-xs font-black text-rhozly-on-surface/40 uppercase tracking-widest mb-2 ml-1 flex items-center gap-1.5">
          <Images size={11} /> Reference photos — {label}
        </p>

        <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
          {images.map((image, i) => (
            <ThumbnailImage
              key={image.id}
              image={image}
              label={label}
              onClick={() => setLightboxIndex(i)}
              onReport={() => setReportImage(image)}
            />
          ))}
        </div>

        {/* Platform footer — Unsplash license requires this */}
        <p className="text-xs text-gray-400 mt-2 ml-1">
          Photos via{" "}
          <a
            href="https://unsplash.com?utm_source=rhozly&utm_medium=referral"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-gray-600"
          >
            Unsplash
          </a>
          ,{" "}
          <a
            href="https://pixabay.com"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-gray-600"
          >
            Pixabay
          </a>{" "}
          &amp; Wikipedia. Shown for visual reference only.
        </p>
      </div>

      {lightboxIndex !== null && (
        <Lightbox
          images={images}
          startIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}

      {reportImage?.source === "unsplash" && (
        <ReportModal image={reportImage} onClose={() => setReportImage(null)} />
      )}
    </>
  );
}
