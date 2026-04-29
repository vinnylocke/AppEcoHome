import React, { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { X, Camera, Trash2, AlertCircle, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { supabase } from "../lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlantInstance {
  instanceId: string;
  plantId: string;
  spriteImg: HTMLImageElement;
  x: number;
  y: number;
  scale: number;               // fraction of canvas height
  scalePreset: "s" | "m" | "l" | "custom";
}

interface Plant {
  id: number | string;
  common_name: string;
  thumbnail_url?: string | null;
}

interface Props {
  plants: Plant[];
  sprites: Map<string | number, string>;  // plantId → spriteUrl
  homeId: string;
  onClose: () => void;
  onCapture?: (storagePath: string) => void;  // called after successful save
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SCALE_PRESETS = { s: 0.3, m: 0.5, l: 0.75 } as const;
const SCALE_MIN = 0.05;
const SCALE_MAX = 1.0;
const CORNER_HIT_RADIUS = 22;   // px in canvas space

// ─── Component ────────────────────────────────────────────────────────────────

export default function PlantCameraView({ plants, sprites, homeId, onClose, onCapture }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef  = useRef<HTMLVideoElement>(null);
  const rafRef    = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);

  // Mutable state kept in refs so the render loop always sees current values
  const instancesRef   = useRef<PlantInstance[]>([]);
  const selectedIdRef  = useRef<string | null>(null);
  const spritesRef     = useRef<Map<string, HTMLImageElement>>(new Map());

  // Drag / pinch refs — never cause re-renders
  const dragRef  = useRef<
    | { type: "instance"; id: string; ox: number; oy: number }
    | { type: "corner";   id: string; startDist: number; startScale: number; cx: number; cy: number }
    | null
  >(null);
  const pinchRef = useRef<{ dist: number; scale: number } | null>(null);
  const trayDragRef = useRef<{ plantId: string; x: number; y: number } | null>(null);

  // React display state
  const [instances,    setInstances]    = useState<PlantInstance[]>([]);
  const [selectedId,   setSelectedId]   = useState<string | null>(null);
  const [controlsPos,  setControlsPos]  = useState<{ cx: number; top: number } | null>(null);
  const [ghostPos,     setGhostPos]     = useState<{ x: number; y: number; plantId: string } | null>(null);
  const [cameraError,  setCameraError]  = useState<string | null>(null);
  const [isCapturing,  setIsCapturing]  = useState(false);

  // Keep instances ref in sync with React state (for controls after drag ends)
  useEffect(() => { instancesRef.current = instances; }, [instances]);
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);

  // ── Camera ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    initCamera();
    return () => {
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const initCamera = async () => {
    const canvas = canvasRef.current!;
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      video.onloadedmetadata = () => video.play();
    } catch (err: any) {
      const msg = err.name === "NotAllowedError" ? "Camera permission denied." : "Camera unavailable.";
      setCameraError(msg);
    }
    rafRef.current = requestAnimationFrame(renderLoop);
  };

  // ── Sprite pre-loading ─────────────────────────────────────────────────────

  useEffect(() => {
    for (const [id, url] of sprites.entries()) {
      const key = String(id);
      if (spritesRef.current.has(key)) continue;
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = url;
      spritesRef.current.set(key, img);
    }
  }, [sprites]);

  // ── Render loop ────────────────────────────────────────────────────────────

  const renderLoop = useCallback(() => {
    const canvas = canvasRef.current;
    const video  = videoRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Camera feed
    if (video && video.readyState >= 2) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    } else {
      ctx.fillStyle = "#111";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Instances
    for (const inst of instancesRef.current) {
      const img = inst.spriteImg;
      if (!img.complete || img.naturalWidth === 0) continue;

      const h = canvas.height * inst.scale;
      const w = h * (img.naturalWidth / img.naturalHeight);

      ctx.save();
      ctx.translate(inst.x, inst.y);

      // Shadow for visibility over any background
      ctx.shadowColor = "rgba(0,0,0,0.4)";
      ctx.shadowBlur  = 12;
      ctx.drawImage(img, -w / 2, -h, w, h);
      ctx.shadowBlur  = 0;

      if (inst.instanceId === selectedIdRef.current) {
        // Dashed selection outline
        ctx.strokeStyle = "rgba(255,255,255,0.85)";
        ctx.lineWidth   = 2;
        ctx.setLineDash([8, 4]);
        ctx.strokeRect(-w / 2 - 5, -h - 5, w + 10, h + 10);
        ctx.setLineDash([]);

        // Corner resize handle (bottom-right of bounding box)
        const hx = w / 2 + 5;
        const hy = 5;
        ctx.fillStyle   = "white";
        ctx.strokeStyle = "rgba(0,0,0,0.25)";
        ctx.lineWidth   = 1.5;
        ctx.beginPath();
        ctx.arc(hx, hy, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle      = "#444";
        ctx.font           = "bold 11px sans-serif";
        ctx.textAlign      = "center";
        ctx.textBaseline   = "middle";
        ctx.fillText("⤡", hx, hy);
      }

      ctx.restore();
    }

    rafRef.current = requestAnimationFrame(renderLoop);
  }, []);

  // ── Coordinate helpers ─────────────────────────────────────────────────────

  const toCanvas = (clientX: number, clientY: number) => {
    const c    = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    return {
      x: (clientX - rect.left)  * (c.width  / rect.width),
      y: (clientY - rect.top)   * (c.height / rect.height),
    };
  };

  const hitTest = (x: number, y: number): PlantInstance | null => {
    const c = canvasRef.current;
    if (!c) return null;
    const insts = instancesRef.current;
    for (let i = insts.length - 1; i >= 0; i--) {
      const inst = insts[i];
      if (!inst.spriteImg.complete || inst.spriteImg.naturalWidth === 0) continue;
      const h = c.height * inst.scale;
      const w = h * (inst.spriteImg.naturalWidth / inst.spriteImg.naturalHeight);
      if (x >= inst.x - w / 2 && x <= inst.x + w / 2 &&
          y >= inst.y - h     && y <= inst.y) return inst;
    }
    return null;
  };

  const cornerHit = (inst: PlantInstance, x: number, y: number): boolean => {
    const c = canvasRef.current;
    if (!c) return false;
    const h  = c.height * inst.scale;
    const w  = h * (inst.spriteImg.naturalWidth / inst.spriteImg.naturalHeight);
    const hx = inst.x + w / 2 + 5;
    const hy = inst.y + 5;
    return Math.hypot(x - hx, y - hy) < CORNER_HIT_RADIUS;
  };

  // Convert a canvas-space (x,y) to the container's CSS space for HTML overlay
  const toCSS = (cx: number, cy: number) => {
    const c = canvasRef.current!;
    return {
      x: cx * (c.clientWidth  / c.width),
      y: cy * (c.clientHeight / c.height),
    };
  };

  const refreshControlsPos = (id: string | null) => {
    if (!id) { setControlsPos(null); return; }
    const inst = instancesRef.current.find(i => i.instanceId === id);
    if (!inst) { setControlsPos(null); return; }
    const c  = canvasRef.current;
    if (!c)  return;
    const h  = c.height * inst.scale;
    const w  = inst.spriteImg.naturalWidth > 0
      ? h * (inst.spriteImg.naturalWidth / inst.spriteImg.naturalHeight) : h;
    const topCSS  = toCSS(inst.x, inst.y - h);
    const centreX = toCSS(inst.x, 0).x;
    setControlsPos({ cx: centreX, top: topCSS.y });
  };

  // ── Instance management ────────────────────────────────────────────────────

  const createInstance = useCallback((plantId: string, canvasX: number, canvasY: number) => {
    const img = spritesRef.current.get(plantId);
    if (!img) return;
    const newInst: PlantInstance = {
      instanceId: crypto.randomUUID(),
      plantId,
      spriteImg: img,
      x: canvasX,
      y: canvasY,
      scale: SCALE_PRESETS.m,
      scalePreset: "m",
    };
    instancesRef.current = [...instancesRef.current, newInst];
    setInstances([...instancesRef.current]);
    selectedIdRef.current = newInst.instanceId;
    setSelectedId(newInst.instanceId);
    refreshControlsPos(newInst.instanceId);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const select = (id: string | null) => {
    selectedIdRef.current = id;
    setSelectedId(id);
    refreshControlsPos(id);
  };

  const applyPreset = (preset: "s" | "m" | "l") => {
    const id = selectedIdRef.current;
    if (!id) return;
    const next = instancesRef.current.map(inst =>
      inst.instanceId === id
        ? { ...inst, scale: SCALE_PRESETS[preset], scalePreset: preset as PlantInstance["scalePreset"] }
        : inst,
    );
    instancesRef.current = next;
    setInstances(next);
    setTimeout(() => refreshControlsPos(id), 0);
  };

  const deleteSelected = () => {
    const id = selectedIdRef.current;
    if (!id) return;
    const next = instancesRef.current.filter(i => i.instanceId !== id);
    instancesRef.current = next;
    setInstances(next);
    select(null);
  };

  // ── Canvas pointer events ──────────────────────────────────────────────────

  const onPtrDown = (clientX: number, clientY: number) => {
    const { x, y } = toCanvas(clientX, clientY);
    const selId = selectedIdRef.current;

    // Corner handle?
    if (selId) {
      const selInst = instancesRef.current.find(i => i.instanceId === selId);
      if (selInst && cornerHit(selInst, x, y)) {
        const c  = canvasRef.current!;
        const h  = c.height * selInst.scale;
        const w  = h * (selInst.spriteImg.naturalWidth / selInst.spriteImg.naturalHeight);
        dragRef.current = {
          type: "corner", id: selId,
          startDist: Math.hypot(x - selInst.x, y - (selInst.y - h / 2)),
          startScale: selInst.scale,
          cx: selInst.x, cy: selInst.y - h / 2,
        };
        return;
      }
    }

    // Hit test on instance?
    const hit = hitTest(x, y);
    if (hit) {
      dragRef.current = { type: "instance", id: hit.instanceId, ox: x - hit.x, oy: y - hit.y };
      select(hit.instanceId);
    } else {
      select(null);
    }
  };

  const onPtrMove = (clientX: number, clientY: number) => {
    const drag = dragRef.current;
    if (!drag) return;
    const { x, y } = toCanvas(clientX, clientY);

    if (drag.type === "instance") {
      instancesRef.current = instancesRef.current.map(inst =>
        inst.instanceId === drag.id
          ? { ...inst, x: x - drag.ox, y: y - drag.oy }
          : inst,
      );
    } else if (drag.type === "corner") {
      const dist     = Math.hypot(x - drag.cx, y - drag.cy);
      const newScale = Math.min(SCALE_MAX, Math.max(SCALE_MIN, drag.startScale * (dist / drag.startDist)));
      instancesRef.current = instancesRef.current.map(inst =>
        inst.instanceId === drag.id
          ? { ...inst, scale: newScale, scalePreset: "custom" }
          : inst,
      );
    }
  };

  const onPtrUp = () => {
    if (dragRef.current) {
      // Sync ref back to React state for controls / re-render
      setInstances([...instancesRef.current]);
      refreshControlsPos(selectedIdRef.current);
      dragRef.current = null;
    }
  };

  // Touch events
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      onPtrDown(e.touches[0].clientX, e.touches[0].clientY);
    } else if (e.touches.length === 2 && selectedIdRef.current) {
      const dist    = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
      const selInst = instancesRef.current.find(i => i.instanceId === selectedIdRef.current);
      if (selInst) {
        pinchRef.current = { dist, scale: selInst.scale };
        dragRef.current  = null;
      }
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();
    if (e.touches.length === 1 && !pinchRef.current) {
      onPtrMove(e.touches[0].clientX, e.touches[0].clientY);
    } else if (e.touches.length === 2 && pinchRef.current) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
      const newScale = Math.min(SCALE_MAX, Math.max(SCALE_MIN, pinchRef.current.scale * (dist / pinchRef.current.dist)));
      instancesRef.current = instancesRef.current.map(inst =>
        inst.instanceId === selectedIdRef.current
          ? { ...inst, scale: newScale, scalePreset: "custom" }
          : inst,
      );
    }
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length < 2) pinchRef.current = null;
    if (e.touches.length === 0) onPtrUp();
  };

  // Mouse events (canvas)
  const onMouseDown = (e: React.MouseEvent) => onPtrDown(e.clientX, e.clientY);
  const onMouseMove = (e: React.MouseEvent) => onPtrMove(e.clientX, e.clientY);
  const onMouseUp   = ()                     => onPtrUp();

  // ── Tray drag — desktop (HTML5 DnD) ───────────────────────────────────────

  const onTrayDragStart = (e: React.DragEvent, plantId: string) => {
    e.dataTransfer.setData("plantId", plantId);
    e.dataTransfer.effectAllowed = "copy";
  };

  const onCanvasDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const onCanvasDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const plantId = e.dataTransfer.getData("plantId");
    if (!plantId) return;
    const { x, y } = toCanvas(e.clientX, e.clientY);
    createInstance(plantId, x, y);
  };

  // ── Tray drag — mobile (touch) ─────────────────────────────────────────────

  const onTrayTouchStart = (e: React.TouchEvent, plantId: string) => {
    e.stopPropagation();
    const t = e.touches[0];
    trayDragRef.current = { plantId, x: t.clientX, y: t.clientY };
    setGhostPos({ plantId, x: t.clientX, y: t.clientY });
  };

  useEffect(() => {
    const onDocMove = (e: TouchEvent) => {
      if (!trayDragRef.current) return;
      const t = e.touches[0];
      trayDragRef.current = { ...trayDragRef.current, x: t.clientX, y: t.clientY };
      setGhostPos({ plantId: trayDragRef.current.plantId, x: t.clientX, y: t.clientY });
    };

    const onDocEnd = (e: TouchEvent) => {
      const drag = trayDragRef.current;
      if (!drag) return;
      trayDragRef.current = null;
      setGhostPos(null);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect  = canvas.getBoundingClientRect();
      const touch = e.changedTouches[0];
      if (touch.clientX >= rect.left && touch.clientX <= rect.right &&
          touch.clientY >= rect.top  && touch.clientY <= rect.bottom) {
        const { x, y } = toCanvas(touch.clientX, touch.clientY);
        createInstance(drag.plantId, x, y);
      }
    };

    document.addEventListener("touchmove", onDocMove, { passive: true });
    document.addEventListener("touchend",  onDocEnd);
    return () => {
      document.removeEventListener("touchmove", onDocMove);
      document.removeEventListener("touchend",  onDocEnd);
    };
  }, [createInstance]);

  // ── Capture ────────────────────────────────────────────────────────────────

  const handleCapture = async () => {
    const canvas = canvasRef.current;
    if (!canvas || isCapturing) return;
    setIsCapturing(true);

    // Drop selection so the dashed outline + corner handle are gone from the capture
    selectedIdRef.current = null;
    setSelectedId(null);
    setControlsPos(null);

    // Wait one RAF tick so the render loop draws a clean frame before we snapshot
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

    try {
      const blob = await new Promise<Blob | null>(resolve =>
        canvas.toBlob(resolve, "image/jpeg", 0.9),
      );
      if (!blob) throw new Error("Canvas toBlob returned null");

      const path = `${homeId}/${Date.now()}.jpg`;

      const { error: uploadErr } = await supabase.storage
        .from("visualiser-captures")
        .upload(path, blob, { contentType: "image/jpeg", upsert: false });
      if (uploadErr) throw uploadErr;

      const plantIds = [...new Set(instancesRef.current.map(i => Number(i.plantId)))];

      const { error: dbErr } = await supabase
        .from("visualiser_captures")
        .insert({ home_id: homeId, image_url: path, plant_ids: plantIds });
      if (dbErr) throw dbErr;

      toast.success("Captured! View in your gallery.");
      onCapture?.(path);
    } catch (err: any) {
      console.error("[PlantCameraView] Capture error:", err);
      toast.error("Capture failed. Please try again.");
    } finally {
      setIsCapturing(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const selectedInst = instances.find(i => i.instanceId === selectedId) ?? null;

  return createPortal(
    <div className="fixed inset-0 z-[130] bg-black overflow-hidden" style={{ touchAction: "none" }}>

      {/* Hidden video */}
      <video ref={videoRef} className="hidden" playsInline muted autoPlay />

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onDragOver={onCanvasDragOver}
        onDrop={onCanvasDrop}
      />

      {/* Camera error banner */}
      {cameraError && (
        <div className="absolute top-24 left-4 right-4 pointer-events-none">
          <div className="bg-black/60 backdrop-blur-md text-white rounded-2xl px-4 py-3 flex items-center gap-3 border border-white/10">
            <AlertCircle size={16} className="text-amber-400 shrink-0" />
            <div>
              <p className="text-xs font-black">{cameraError}</p>
              <p className="text-[10px] text-white/50 mt-0.5">Plants can still be placed on the dark preview.</p>
            </div>
          </div>
        </div>
      )}

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-4 z-10 pointer-events-none">
        <button
          onClick={onClose}
          className="pointer-events-auto w-11 h-11 rounded-2xl bg-black/50 backdrop-blur-md flex items-center justify-center text-white hover:bg-black/70 transition-colors"
          aria-label="Exit visualiser"
        >
          <X size={20} />
        </button>

        {instances.length > 0 && (
          <div className="bg-black/40 backdrop-blur-md rounded-full px-4 py-1.5 border border-white/10">
            <p className="text-white/70 text-xs font-bold">
              {instances.length} plant{instances.length !== 1 ? "s" : ""} placed
            </p>
          </div>
        )}

        <button
          onClick={handleCapture}
          disabled={isCapturing}
          className="pointer-events-auto w-11 h-11 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white hover:bg-white/30 transition-colors border border-white/10 disabled:opacity-50"
          aria-label="Capture photo"
        >
          {isCapturing
            ? <Loader2 size={18} className="animate-spin" />
            : <Camera size={20} />
          }
        </button>
      </div>

      {/* Selected instance controls */}
      {selectedId && controlsPos && (
        <div
          className="absolute z-20 pointer-events-auto"
          style={{
            left: controlsPos.cx,
            top: Math.max(72, controlsPos.top - 52),
            transform: "translateX(-50%)",
          }}
        >
          <div className="flex items-center gap-1.5 bg-black/70 backdrop-blur-md rounded-2xl px-2 py-1.5 border border-white/10 shadow-xl">
            {(["s", "m", "l"] as const).map(preset => (
              <button
                key={preset}
                onClick={() => applyPreset(preset)}
                className={`w-9 h-9 rounded-xl text-sm font-black uppercase transition-all ${
                  selectedInst?.scalePreset === preset
                    ? "bg-white text-black shadow-md"
                    : "text-white/70 hover:bg-white/15"
                }`}
              >
                {preset.toUpperCase()}
              </button>
            ))}
            <div className="w-px h-5 bg-white/20 mx-0.5" />
            <button
              onClick={deleteSelected}
              className="w-9 h-9 rounded-xl text-red-400 hover:bg-red-500/20 transition-colors flex items-center justify-center"
              aria-label="Remove plant"
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>
      )}

      {/* Touch drag ghost */}
      {ghostPos && (() => {
        const p   = plants.find(p => String(p.id) === ghostPos.plantId);
        const url = p?.thumbnail_url || sprites.get(ghostPos.plantId) || sprites.get(Number(ghostPos.plantId));
        return (
          <div
            className="fixed pointer-events-none z-50 w-16 h-16 rounded-full overflow-hidden border-2 border-white/60 shadow-2xl"
            style={{ left: ghostPos.x - 32, top: ghostPos.y - 32 }}
          >
            {url && <img src={url} alt="" className="w-full h-full object-cover" />}
          </div>
        );
      })()}

      {/* Bottom tray */}
      <div className="absolute bottom-0 left-0 right-0 z-10 pointer-events-auto px-4 pb-6">
        <div className="bg-black/55 backdrop-blur-md rounded-2xl border border-white/10 px-4 py-3">
          <p className="text-white/40 text-[10px] font-black uppercase tracking-widest mb-2.5 text-center">
            Drag onto camera to place · drag to move · pinch to resize
          </p>
          <div className="flex gap-3 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
            {plants.map(plant => {
              const plantId  = String(plant.id);
              const spriteUrl = sprites.get(plant.id) || sprites.get(plantId);
              if (!spriteUrl) return null;
              return (
                <div
                  key={plantId}
                  draggable
                  onDragStart={e => onTrayDragStart(e, plantId)}
                  onTouchStart={e => onTrayTouchStart(e, plantId)}
                  className="flex-shrink-0 flex flex-col items-center gap-1.5 cursor-grab active:cursor-grabbing select-none"
                >
                  <div className="w-14 h-14 rounded-2xl overflow-hidden bg-white/10 border-2 border-white/20 hover:border-white/50 transition-colors">
                    <img
                      src={spriteUrl}
                      alt={plant.common_name}
                      draggable={false}
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <span className="text-white/70 text-[10px] font-bold text-center max-w-[56px] truncate leading-tight">
                    {plant.common_name}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
