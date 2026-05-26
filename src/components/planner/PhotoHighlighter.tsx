import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Undo2, Trash2, Brush } from "lucide-react";

/**
 * Per-stroke record. Stored in component state so undo / re-render
 * can re-paint at natural resolution without losing any precision.
 * Points are in natural-image pixel coordinates.
 */
interface Stroke {
  brushPx: number;
  points: Array<{ x: number; y: number }>;
}

type BrushSize = "small" | "medium" | "large";

interface Props {
  /** Data URL or object URL of the original photo. */
  photoUrl: string;
  /** Fires after the user starts drawing for the first time. Lets the
   *  parent enable a downstream affordance ("Highlights detected"). */
  onHasStrokesChange?: (has: boolean) => void;
}

export interface PhotoHighlighterHandle {
  /** Returns the photo with highlight strokes painted on top, encoded
   *  as a base64 data URL (no MIME prefix). Returns null when no
   *  strokes have been drawn. */
  getAnnotatedBase64(): string | null;
  /** Convenience — has the user drawn anything yet? */
  hasStrokes(): boolean;
  /** Wipe all strokes. */
  clear(): void;
}

const BRUSH_PX: Record<BrushSize, number> = {
  small: 18,
  medium: 36,
  large: 64,
};

/**
 * Free-form drawing overlay used in the Garden Overhaul flow. The
 * user paints bright red strokes onto their garden photo to mark
 * areas they want the AI to focus changes on. The composited image
 * (photo + strokes) is what gets fed to gemini-2.5-flash-image as
 * its reference — the model treats the red regions as visual
 * guidance for where to concentrate changes.
 *
 * The component is uncontrolled — the parent reads the composited
 * output via the imperative `getAnnotatedBase64()` ref method when
 * the form submits. Avoids the cost of re-encoding on every stroke.
 */
const PhotoHighlighter = forwardRef<PhotoHighlighterHandle, Props>(
  function PhotoHighlighter({ photoUrl, onHasStrokesChange }, ref) {
    const imgRef = useRef<HTMLImageElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [naturalDims, setNaturalDims] = useState<{ w: number; h: number } | null>(null);
    const [brush, setBrush] = useState<BrushSize>("medium");
    const strokesRef = useRef<Stroke[]>([]);
    const [strokeCount, setStrokeCount] = useState(0);
    const drawingRef = useRef<Stroke | null>(null);

    const notifyChange = useCallback((next: Stroke[]) => {
      strokesRef.current = next;
      setStrokeCount(next.length);
      onHasStrokesChange?.(next.length > 0);
    }, [onHasStrokesChange]);

    // Establish natural image dimensions once the photo loads.
    const handleImgLoad = useCallback(() => {
      const img = imgRef.current;
      if (!img) return;
      setNaturalDims({ w: img.naturalWidth, h: img.naturalHeight });
    }, []);

    // Sync canvas pixel buffer to natural dimensions whenever they
    // change or strokes are added — single source of truth is
    // strokesRef so we always re-paint from scratch (no incremental
    // smudging artefacts from device-pixel rounding).
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas || !naturalDims) return;
      canvas.width = naturalDims.w;
      canvas.height = naturalDims.h;
      repaint();
    }, [naturalDims, strokeCount]);

    const repaint = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "rgba(239, 68, 68, 0.62)";
      ctx.fillStyle = "rgba(239, 68, 68, 0.62)";
      for (const stroke of strokesRef.current) {
        ctx.lineWidth = stroke.brushPx;
        if (stroke.points.length === 1) {
          // Single tap → dot.
          const p = stroke.points[0];
          ctx.beginPath();
          ctx.arc(p.x, p.y, stroke.brushPx / 2, 0, Math.PI * 2);
          ctx.fill();
          continue;
        }
        ctx.beginPath();
        ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
        for (let i = 1; i < stroke.points.length; i++) {
          ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
        }
        ctx.stroke();
      }
    }, []);

    // ── Pointer handling ────────────────────────────────────────────
    // Convert pointer coords (CSS pixels relative to the canvas) into
    // natural image pixel coords. Keeps strokes high-res for the
    // composited export regardless of the on-screen scale.
    const pointerToNatural = useCallback((e: React.PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const xRatio = canvas.width / rect.width;
      const yRatio = canvas.height / rect.height;
      return {
        x: (e.clientX - rect.left) * xRatio,
        y: (e.clientY - rect.top) * yRatio,
      };
    }, []);

    const onPointerDown = (e: React.PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const p = pointerToNatural(e);
      if (!p) return;
      canvas.setPointerCapture(e.pointerId);
      const brushPx = BRUSH_PX[brush];
      drawingRef.current = { brushPx, points: [p] };
    };

    const onPointerMove = (e: React.PointerEvent) => {
      if (!drawingRef.current) return;
      const p = pointerToNatural(e);
      if (!p) return;
      drawingRef.current.points.push(p);

      // Draw the new segment incrementally for snappy feedback —
      // a full repaint on every move event chokes on long strokes.
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!ctx) return;
      const pts = drawingRef.current.points;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "rgba(239, 68, 68, 0.62)";
      ctx.lineWidth = drawingRef.current.brushPx;
      ctx.beginPath();
      ctx.moveTo(pts[pts.length - 2].x, pts[pts.length - 2].y);
      ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
      ctx.stroke();
    };

    const finishStroke = () => {
      if (!drawingRef.current) return;
      notifyChange([...strokesRef.current, drawingRef.current]);
      drawingRef.current = null;
    };

    const onPointerUp = (e: React.PointerEvent) => {
      const canvas = canvasRef.current;
      try { canvas?.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      finishStroke();
    };

    const onPointerLeave = () => {
      // Treat leaving the canvas as a stroke commit so the user
      // doesn't have to come back inside before lifting their finger.
      finishStroke();
    };

    // ── Toolbar actions ────────────────────────────────────────────
    const handleUndo = () => {
      if (strokesRef.current.length === 0) return;
      notifyChange(strokesRef.current.slice(0, -1));
    };

    const handleClear = () => {
      if (strokesRef.current.length === 0) return;
      notifyChange([]);
    };

    // ── Imperative API ─────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
      getAnnotatedBase64() {
        if (strokesRef.current.length === 0) return null;
        const img = imgRef.current;
        const dims = naturalDims;
        if (!img || !dims) return null;
        const offscreen = document.createElement("canvas");
        offscreen.width = dims.w;
        offscreen.height = dims.h;
        const ctx = offscreen.getContext("2d");
        if (!ctx) return null;
        // 1. The original photo at its full natural resolution.
        ctx.drawImage(img, 0, 0, dims.w, dims.h);
        // 2. The composited strokes on top — re-painted from the
        //    stroke list (NOT copied from the on-screen canvas) so
        //    we get the proper natural-resolution output regardless
        //    of viewport zoom or DPR.
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = "rgba(239, 68, 68, 0.62)";
        ctx.fillStyle = "rgba(239, 68, 68, 0.62)";
        for (const stroke of strokesRef.current) {
          ctx.lineWidth = stroke.brushPx;
          if (stroke.points.length === 1) {
            const p = stroke.points[0];
            ctx.beginPath();
            ctx.arc(p.x, p.y, stroke.brushPx / 2, 0, Math.PI * 2);
            ctx.fill();
            continue;
          }
          ctx.beginPath();
          ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
          for (let i = 1; i < stroke.points.length; i++) {
            ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
          }
          ctx.stroke();
        }
        // Strip the data:...;base64, prefix so the caller can hand
        // the raw payload to the edge fn just like the original photo.
        const dataUrl = offscreen.toDataURL("image/jpeg", 0.9);
        const commaIdx = dataUrl.indexOf(",");
        return commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
      },
      hasStrokes() {
        return strokesRef.current.length > 0;
      },
      clear() {
        notifyChange([]);
      },
    }), [naturalDims, notifyChange]);

    // ── Render ─────────────────────────────────────────────────────
    return (
      <div className="space-y-3">
        {/* Toolbar */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex items-center gap-1 bg-rhozly-surface-low rounded-xl p-1">
            {(["small", "medium", "large"] as BrushSize[]).map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => setBrush(size)}
                data-testid={`photo-highlighter-brush-${size}`}
                className={`inline-flex items-center justify-center min-h-[36px] min-w-[36px] px-2.5 rounded-lg text-xs font-black uppercase tracking-widest transition-colors ${
                  brush === size
                    ? "bg-white text-rhozly-primary shadow-sm"
                    : "text-rhozly-on-surface/50 hover:text-rhozly-on-surface"
                }`}
                aria-pressed={brush === size}
                aria-label={`${size} brush`}
              >
                <Brush size={size === "small" ? 12 : size === "medium" ? 14 : 16} />
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={handleUndo}
            disabled={strokeCount === 0}
            data-testid="photo-highlighter-undo"
            className="inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-xl bg-white border border-rhozly-outline/20 text-xs font-black text-rhozly-on-surface/70 hover:text-rhozly-primary hover:border-rhozly-primary/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Undo2 size={13} /> Undo
          </button>
          <button
            type="button"
            onClick={handleClear}
            disabled={strokeCount === 0}
            data-testid="photo-highlighter-clear"
            className="inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-xl bg-white border border-rhozly-outline/20 text-xs font-black text-rhozly-on-surface/70 hover:text-red-600 hover:border-red-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Trash2 size={13} /> Clear
          </button>
          {strokeCount > 0 && (
            <span className="ml-auto text-[10px] font-black uppercase tracking-widest text-rhozly-primary">
              {strokeCount} {strokeCount === 1 ? "highlight" : "highlights"}
            </span>
          )}
        </div>

        {/* Canvas + photo */}
        <div className="relative rounded-2xl overflow-hidden border border-rhozly-outline/15 bg-rhozly-surface-low/40">
          <img
            ref={imgRef}
            src={photoUrl}
            alt="Your garden"
            onLoad={handleImgLoad}
            className="block w-full h-auto select-none"
            draggable={false}
          />
          {naturalDims && (
            <canvas
              ref={canvasRef}
              data-testid="photo-highlighter-canvas"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onPointerLeave={onPointerLeave}
              style={{ touchAction: "none" }}
              className="absolute inset-0 w-full h-full cursor-crosshair"
            />
          )}
        </div>
      </div>
    );
  },
);

export default PhotoHighlighter;
