import React, { useRef, useState } from "react";
import { Edit3, Trash2, X } from "lucide-react";

export interface PhotoAnnotation {
  /** Normalised x position (0–1) within the image. */
  x: number;
  /** Normalised y position (0–1) within the image. */
  y: number;
  /** Short user-supplied note describing what the marker points at. */
  label: string;
}

interface PhotoAnnotationOverlayProps {
  /** The image URL to annotate. */
  src: string;
  /** Alt text for the image. */
  alt?: string;
  /** Current list of annotations. */
  annotations: PhotoAnnotation[];
  /** Called with the new list whenever an annotation is added / edited / removed. */
  onChange: (next: PhotoAnnotation[]) => void;
  /** Set the editing mode on/off (mode is owned by the parent). */
  editing: boolean;
  /** Optional className for the wrapping element. */
  className?: string;
  /** Optional max height for the image (e.g. "max-h-[400px]"). */
  maxHeightClass?: string;
}

/**
 * Overlays numbered markers on an image. While `editing` is true, clicking on
 * the image adds a marker at the clicked position; clicking on an existing
 * marker opens a small label editor with a remove button.
 *
 * Marker positions are stored as normalised (0–1) coordinates so they survive
 * image resizing.
 */
export default function PhotoAnnotationOverlay({
  src,
  alt = "Annotated photo",
  annotations,
  onChange,
  editing,
  className = "",
  maxHeightClass = "max-h-[400px]",
}: PhotoAnnotationOverlayProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [draftLabel, setDraftLabel] = useState("");

  const handleImageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!editing) return;
    // If a marker is currently being edited, ignore canvas clicks until the
    // user closes the editor; otherwise it's too easy to drop a stray marker.
    if (activeIndex != null) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    const next: PhotoAnnotation[] = [...annotations, { x, y, label: "" }];
    onChange(next);
    setActiveIndex(next.length - 1);
    setDraftLabel("");
  };

  const handleMarkerClick = (idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveIndex(idx);
    setDraftLabel(annotations[idx]?.label ?? "");
  };

  const saveLabel = () => {
    if (activeIndex == null) return;
    const next = annotations.map((a, i) =>
      i === activeIndex ? { ...a, label: draftLabel.trim() } : a,
    );
    onChange(next);
    setActiveIndex(null);
    setDraftLabel("");
  };

  const removeMarker = () => {
    if (activeIndex == null) return;
    onChange(annotations.filter((_, i) => i !== activeIndex));
    setActiveIndex(null);
    setDraftLabel("");
  };

  return (
    <div
      ref={containerRef}
      onClick={handleImageClick}
      className={`relative inline-block w-full ${editing ? "cursor-crosshair" : ""} ${className}`}
      data-testid="photo-annotation-overlay"
    >
      <img
        src={src}
        alt={alt}
        className={`object-contain w-full h-full ${maxHeightClass}`}
        draggable={false}
      />

      {annotations.map((annotation, idx) => {
        const isActive = activeIndex === idx;
        return (
          <React.Fragment key={idx}>
            <button
              type="button"
              onClick={(e) => handleMarkerClick(idx, e)}
              className={`absolute -translate-x-1/2 -translate-y-1/2 w-7 h-7 rounded-full text-white text-xs font-black shadow-lg flex items-center justify-center border-2 transition-transform ${
                isActive
                  ? "bg-rhozly-primary border-white scale-110 ring-2 ring-rhozly-primary/40"
                  : "bg-amber-500 border-white hover:scale-110"
              }`}
              style={{ left: `${annotation.x * 100}%`, top: `${annotation.y * 100}%` }}
              aria-label={`Annotation ${idx + 1}${annotation.label ? `: ${annotation.label}` : ""}`}
              data-testid={`photo-annotation-marker-${idx}`}
            >
              {idx + 1}
            </button>

            {/* Label badge — shown beside the marker when not being edited */}
            {!isActive && annotation.label && (
              <span
                className="absolute -translate-y-1/2 ml-4 px-2 py-0.5 rounded-md bg-black/70 text-white text-[10px] font-bold backdrop-blur-sm pointer-events-none max-w-[140px] truncate"
                style={{ left: `${annotation.x * 100}%`, top: `${annotation.y * 100}%` }}
              >
                {annotation.label}
              </span>
            )}
          </React.Fragment>
        );
      })}

      {/* Inline label editor */}
      {activeIndex != null && (
        <div
          className="absolute z-10 bg-white rounded-2xl shadow-2xl border border-rhozly-outline/15 p-3 w-[220px] -translate-x-1/2"
          style={{
            left: `${(annotations[activeIndex]?.x ?? 0) * 100}%`,
            top: `calc(${(annotations[activeIndex]?.y ?? 0) * 100}% + 24px)`,
          }}
          onClick={(e) => e.stopPropagation()}
          data-testid="photo-annotation-editor"
        >
          <div className="flex items-center gap-2 mb-2">
            <Edit3 size={12} className="text-rhozly-primary" />
            <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/55">
              Marker {activeIndex + 1}
            </p>
            <button
              type="button"
              onClick={() => { setActiveIndex(null); setDraftLabel(""); }}
              aria-label="Close marker editor"
              className="ml-auto p-1 text-rhozly-on-surface/40 hover:text-rhozly-on-surface"
            >
              <X size={12} />
            </button>
          </div>
          <input
            type="text"
            autoFocus
            value={draftLabel}
            onChange={(e) => setDraftLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); saveLabel(); }
              if (e.key === "Escape") { e.preventDefault(); setActiveIndex(null); setDraftLabel(""); }
            }}
            placeholder="e.g. brown patches"
            maxLength={60}
            className="w-full text-xs rounded-lg border border-rhozly-outline/20 bg-white px-2 py-1.5 text-rhozly-on-surface placeholder:text-rhozly-on-surface/40 focus:outline-none focus:ring-2 focus:ring-rhozly-primary/30"
            data-testid="photo-annotation-input"
          />
          <div className="flex gap-1.5 justify-end mt-2">
            <button
              type="button"
              onClick={removeMarker}
              aria-label="Remove marker"
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black text-red-600 hover:bg-red-50 transition-colors"
              data-testid="photo-annotation-remove"
            >
              <Trash2 size={11} /> Remove
            </button>
            <button
              type="button"
              onClick={saveLabel}
              className="px-3 py-1 rounded-lg bg-rhozly-primary text-white text-[10px] font-black hover:opacity-90 transition-opacity"
              data-testid="photo-annotation-save"
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
