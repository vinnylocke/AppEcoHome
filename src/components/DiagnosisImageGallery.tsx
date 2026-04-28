import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  ExternalLink,
  Flag,
  X,
  Images,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { supabase } from "../lib/supabase";

interface ImageResult {
  id: string;
  thumb_url: string;
  small_url: string;
  alt: string;
  photo_page: string;
  photographer_name: string;
  photographer_url: string;
  report_url: string;
}

// ---------------------------------------------------------------------------
// Report modal — links directly to Unsplash's DMCA / copyright report form
// ---------------------------------------------------------------------------
function ReportModal({
  image,
  onClose,
}: {
  image: ImageResult;
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

        <p className="text-[10px] text-gray-400 text-center mt-3 leading-relaxed">
          All images are provided under the{" "}
          <a
            href="https://unsplash.com/license"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-gray-600"
          >
            Unsplash License
          </a>
          . Thumbnails are shown for visual reference only.
        </p>
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Lightbox — keyboard-navigable full-size viewer with attribution
// ---------------------------------------------------------------------------
function Lightbox({
  images,
  startIndex,
  onClose,
}: {
  images: ImageResult[];
  startIndex: number;
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(startIndex);
  const image = images[idx];
  const lightboxRef = useRef<HTMLDivElement>(null);

  const prev = () => setIdx((i) => (i > 0 ? i - 1 : images.length - 1));
  const next = () => setIdx((i) => (i < images.length - 1 ? i + 1 : 0));

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [idx]);

  // Focus trap
  useEffect(() => {
    const lightbox = lightboxRef.current;
    if (!lightbox) return;

    const focusableSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const previouslyFocused = document.activeElement as HTMLElement;

    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;

      const focusableElements = lightbox.querySelectorAll<HTMLElement>(focusableSelector);
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    };

    const focusableElements = lightbox.querySelectorAll<HTMLElement>(focusableSelector);
    const firstFocusable = focusableElements[0];

    window.addEventListener("keydown", handleTabKey);
    firstFocusable?.focus();

    return () => {
      window.removeEventListener("keydown", handleTabKey);
      previouslyFocused?.focus();
    };
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
          src={image.small_url}
          alt={image.alt || "Plant reference image"}
          className="w-full max-h-[60vh] object-contain rounded-2xl shadow-2xl"
        />

        {/* Prev / Next */}
        {images.length > 1 && (
          <>
            <button
              onClick={prev}
              aria-label="Previous image"
              className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 bg-white/80 rounded-full flex items-center justify-center hover:bg-white transition-colors shadow"
            >
              <ChevronLeft size={20} />
            </button>
            <button
              onClick={next}
              aria-label="Next image"
              className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 bg-white/80 rounded-full flex items-center justify-center hover:bg-white transition-colors shadow"
            >
              <ChevronRight size={20} />
            </button>
          </>
        )}

        {/* Attribution — Unsplash requires linking photographer + platform */}
        <div className="mt-3 flex items-center justify-between w-full px-1">
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
          <span className="text-xs text-white/40 tabular-nums shrink-0 ml-4">
            {idx + 1} / {images.length}
          </span>
        </div>

        {/* Source link */}
        <a
          href={image.photo_page}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 text-[11px] text-white/50 hover:text-white/80 flex items-center gap-1 transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink size={11} /> View original on Unsplash
        </a>
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Gallery thumbnail skeleton
// ---------------------------------------------------------------------------
function Skeleton() {
  return (
    <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="shrink-0 w-28 h-28 sm:w-32 sm:h-32 bg-gray-100 rounded-2xl animate-pulse"
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Image thumbnail with loading state
// ---------------------------------------------------------------------------
function ThumbnailImage({
  image,
  label,
  onClick,
  onReport
}: {
  image: ImageResult;
  label: string;
  onClick: () => void;
  onReport: () => void;
}) {
  const [imageLoaded, setImageLoaded] = useState(false);

  return (
    <div
      className="group shrink-0 w-28 h-28 sm:w-32 sm:h-32 rounded-2xl overflow-hidden relative border border-gray-100 shadow-sm cursor-zoom-in"
      onClick={onClick}
    >
      {/* Loading placeholder */}
      {!imageLoaded && (
        <div className="absolute inset-0 bg-gray-100 animate-pulse" />
      )}

      {/* Thumbnail */}
      <img
        src={image.thumb_url}
        alt={image.alt ? `${image.alt} - ${label}` : `Reference image for ${label}`}
        loading="lazy"
        onLoad={() => setImageLoaded(true)}
        className={`w-full h-full object-cover transition-all duration-300 group-hover:scale-105 ${
          imageLoaded ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* Always-visible attribution strip — required by Unsplash License */}
      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5">
        <a
          href={image.photographer_url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-[9px] text-white/80 font-bold truncate block hover:text-white leading-tight"
          title={`Photo by ${image.photographer_name} on Unsplash`}
        >
          {image.photographer_name}
        </a>
      </div>

      {/* Hover action buttons */}
      <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-1">
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
          onClick={(e) => {
            e.stopPropagation();
            onReport();
          }}
          className="w-6 h-6 bg-white/90 rounded-lg flex items-center justify-center shadow-sm hover:bg-red-50 transition-colors"
          title="Report this image"
        >
          <Flag size={11} className="text-gray-500" />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
interface Props {
  /** Search query sent to the image API (e.g. "Monstera plant" or "Root Rot plant disease") */
  query: string;
  /** Human-readable label shown above the gallery (e.g. "Monstera Deliciosa") */
  label: string;
}

export default function DiagnosisImageGallery({ query, label }: Props) {
  const [images, setImages] = useState<ImageResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [reportImage, setReportImage] = useState<ImageResult | null>(null);

  useEffect(() => {
    if (!query) return;
    let cancelled = false;
    setLoading(true);
    setImages([]);

    supabase.functions
      .invoke("plant-image-search", { body: { query, count: 6 } })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (!error && Array.isArray(data?.images)) setImages(data.images);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [query]);

  if (loading) return <Skeleton />;
  if (images.length === 0) return null;

  return (
    <>
      <div>
        <p className="text-[10px] font-black text-rhozly-on-surface/40 uppercase tracking-widest mb-2 ml-1 flex items-center gap-1.5">
          <Images size={11} /> Reference photos — {label}
        </p>

        {/* Scrollable thumbnail strip */}
        <div
          className="flex gap-3 overflow-x-auto pb-2"
          style={{ scrollbarWidth: "none" }}
        >
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

        {/* Platform attribution footer — required by Unsplash License */}
        <p className="text-[9px] text-gray-400 mt-2 ml-1">
          Thumbnails via{" "}
          <a
            href="https://unsplash.com?utm_source=rhozly&utm_medium=referral"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-gray-600"
          >
            Unsplash
          </a>
          . Shown for visual reference only.
        </p>
      </div>

      {lightboxIndex !== null && (
        <Lightbox
          images={images}
          startIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}

      {reportImage && (
        <ReportModal
          image={reportImage}
          onClose={() => setReportImage(null)}
        />
      )}
    </>
  );
}
