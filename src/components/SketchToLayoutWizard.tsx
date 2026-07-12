import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  X, ChevronLeft, Camera, Upload, Loader2, Sparkles, Lock, Trash2, AlertTriangle,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { Logger } from "../lib/errorHandler";
import toast from "react-hot-toast";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { useEntitlements } from "../hooks/useEntitlements";
import { SHAPE_PRESETS, type ShapeGroup } from "./GardenShapePanel";
import { detectSketch } from "../services/sketchToLayoutService";
import {
  KIND_TO_PRESET_ID,
  computeCanvasSize,
  gardenWidthFromShapeWidth,
  normalizedWidthOf,
  detectionToShapes,
  type SketchDetection,
  type ClassifiedShape,
  type ResolvedPreset,
} from "../lib/garden/sketchToShapes";

interface Props {
  homeId: string;
  onClose: () => void;
}

const STEPS = ["Upload", "Scale", "Classify", "Review"];
const LOW_CONFIDENCE = 0.5;
const GROUP_ORDER: ShapeGroup[] = ["beds", "structures", "hardscape", "features"];
const GROUP_LABEL: Record<ShapeGroup, string> = {
  beds: "Beds & planters",
  structures: "Structures",
  hardscape: "Hardscape",
  features: "Features",
};

// Resize an image file → base64 (no `data:` prefix), mirroring AreaScanModal.
async function resizeImage(file: File, maxPx = 1600): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Canvas unsupported")); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      resolve({ base64: dataUrl.split(",")[1], mimeType: "image/jpeg" });
    };
    img.onerror = () => reject(new Error("Could not load image"));
    img.src = URL.createObjectURL(file);
  });
}

function resolvePreset(presetId: string | null): ResolvedPreset {
  if (presetId) {
    const p = SHAPE_PRESETS.find((sp) => sp.id === presetId);
    if (p) return { id: p.id, color: p.color, extrude_m: p.extrude_m, dashed: p.dashed ?? false };
  }
  // Unclassified → plain green rect (matches the editor's polygon default colour).
  return { id: null, color: "#4ade80", extrude_m: null, dashed: false };
}

interface AreaOpt { id: string; name: string; }
interface ShapeClass {
  presetId: string | null;
  label: string;
  areaId: string | null;
  removed: boolean;
}

export default function SketchToLayoutWizard({ homeId, onClose }: Props) {
  const navigate = useNavigate();
  const trapRef = useFocusTrap<HTMLDivElement>(true);
  const { tier, loading: tierLoading } = useEntitlements();
  const isSagePlus = tier === "sage" || tier === "evergreen";

  const [step, setStep] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [base64, setBase64] = useState("");
  const [mimeType, setMimeType] = useState("image/jpeg");
  const [detecting, setDetecting] = useState(false);

  const [detection, setDetection] = useState<SketchDetection | null>(null);
  const [sketchUrl, setSketchUrl] = useState("");

  const [scaleMode, setScaleMode] = useState<"garden" | "shape">("garden");
  const [gardenWidthM, setGardenWidthM] = useState(10);
  const [refShapeIdx, setRefShapeIdx] = useState(0);
  const [refShapeWidthM, setRefShapeWidthM] = useState(2);

  const [classes, setClasses] = useState<ShapeClass[]>([]);
  const [areas, setAreas] = useState<AreaOpt[]>([]);

  const [layoutName, setLayoutName] = useState("My Garden");
  const [creating, setCreating] = useState(false);

  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Areas link to the home via location, so resolve locations first.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: locs, error: locErr } = await supabase.from("locations").select("id").eq("home_id", homeId);
      if (locErr) { Logger.error("Sketch wizard: could not load locations for area linking", locErr); return; }
      const locIds = (locs ?? []).map((l: { id: string }) => l.id);
      if (locIds.length === 0) { if (!cancelled) setAreas([]); return; }
      const { data: rows, error: areaErr } = await supabase.from("areas").select("id, name").in("location_id", locIds).order("name");
      if (areaErr) { Logger.error("Sketch wizard: could not load areas for area linking", areaErr); return; }
      if (!cancelled) setAreas((rows ?? []) as AreaOpt[]);
    })();
    return () => { cancelled = true; };
  }, [homeId]);

  const canvas = useMemo(() => {
    if (!detection) return { canvas_w_m: 30, canvas_h_m: 20 };
    let widthM = gardenWidthM;
    if (scaleMode === "shape" && detection.shapes[refShapeIdx]) {
      const normW = normalizedWidthOf(detection.shapes[refShapeIdx].geometry);
      widthM = gardenWidthFromShapeWidth(refShapeWidthM, normW);
    }
    return computeCanvasSize(detection.garden_outline, widthM);
  }, [detection, scaleMode, gardenWidthM, refShapeIdx, refShapeWidthM]);

  const activeCount = classes.filter((c) => !c.removed).length;
  // Classify order: least-confident first so the user checks the risky ones.
  const classifyOrder = useMemo(() => {
    if (!detection) return [];
    return detection.shapes
      .map((s, i) => ({ i, conf: s.confidence }))
      .filter(({ i }) => classes[i] && !classes[i].removed)
      .sort((a, b) => a.conf - b.conf)
      .map(({ i }) => i);
  }, [detection, classes]);

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) { toast.error("Please choose an image."); return; }
    try {
      setPreviewUrl(URL.createObjectURL(file));
      const { base64: b64, mimeType: mt } = await resizeImage(file);
      setBase64(b64);
      setMimeType(mt);
    } catch (err) {
      Logger.error("Sketch resize failed", err);
      toast.error("Could not read that image.");
    }
  }

  async function runDetect() {
    if (!base64) return;
    setDetecting(true);
    try {
      const res = await detectSketch({ homeId, sketchBase64: base64, mimeType });
      setSketchUrl(res.sketch_url ?? "");
      if (res.detection && res.detection.shapes.length > 0) {
        setDetection(res.detection);
        setClasses(res.detection.shapes.map((s) => ({
          presetId: KIND_TO_PRESET_ID[s.detected_kind] ?? null,
          label: s.label_guess ?? "",
          areaId: null,
          removed: false,
        })));
        setStep(1);
      } else {
        toast.error("Couldn't pick out shapes from that sketch. Try a clearer top-down photo, or start a blank layout.");
      }
    } catch (err: any) {
      Logger.error("Sketch detection failed", err);
      const msg = typeof err?.message === "string" ? err.message : "";
      toast.error(msg.includes("Sage") ? "Sketch to Layout is a Sage+ feature." : "Couldn't analyse the sketch. Please try again.");
    } finally {
      setDetecting(false);
    }
  }

  async function createBlank() {
    setCreating(true);
    try {
      const { data, error } = await supabase
        .from("garden_layouts")
        .insert({ home_id: homeId, name: layoutName.trim() || "My Garden" })
        .select("id").single();
      if (error || !data) throw error ?? new Error("insert failed");
      onClose();
      navigate(`/garden-layout/${data.id}`);
    } catch (err) {
      Logger.error("Blank layout create failed", err);
      toast.error("Could not create layout.");
      setCreating(false);
    }
  }

  async function handleCreate() {
    if (!detection) return;
    setCreating(true);
    try {
      const items: ClassifiedShape[] = detection.shapes
        .map((s, i) => ({ s, c: classes[i] }))
        .filter(({ c }) => c && !c.removed)
        .map(({ s, c }) => ({
          geometry: s.geometry,
          preset: resolvePreset(c.presetId),
          label: c.label.trim() || null,
          area_id: c.areaId,
        }));
      const drafts = detectionToShapes(items, canvas);

      const { data: layout, error: lErr } = await supabase
        .from("garden_layouts")
        .insert({
          home_id: homeId,
          name: layoutName.trim() || "My Garden",
          canvas_w_m: canvas.canvas_w_m,
          canvas_h_m: canvas.canvas_h_m,
          source_sketch_url: sketchUrl || null,
        })
        .select("id").single();
      if (lErr || !layout) throw lErr ?? new Error("layout insert failed");

      if (drafts.length > 0) {
        const rows = drafts.map((d) => ({ ...d, id: crypto.randomUUID(), layout_id: layout.id }));
        const { error: sErr } = await supabase.from("garden_shapes").insert(rows);
        if (sErr) throw sErr;
      }
      onClose();
      navigate(`/garden-layout/${layout.id}`);
    } catch (err) {
      Logger.error("Sketch layout create failed", err);
      toast.error("Could not create the layout.");
      setCreating(false);
    }
  }

  const back = () => setStep((s) => Math.max(0, s - 1));

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-label="Convert a sketch to a layout"
        data-testid="sketch-to-layout-wizard"
        className="relative w-[calc(100vw-2rem)] max-w-lg bg-white rounded-3xl shadow-xl max-h-[90vh] overflow-y-auto"
      >
        {/* Header + progress */}
        <div className="sticky top-0 bg-white border-b border-rhozly-outline/10 px-6 py-4 flex items-center gap-3 rounded-t-3xl z-10">
          {step > 0 && (
            <button onClick={back} data-testid="sketch-back" aria-label="Back"
              className="p-1 -ml-1 text-rhozly-on-surface-variant hover:text-rhozly-on-surface">
              <ChevronLeft size={22} />
            </button>
          )}
          <div className="flex-1">
            <p className="text-xs text-rhozly-on-surface-variant font-medium">
              Step {step + 1} of {STEPS.length} — {STEPS[step]}
            </p>
            <div className="mt-2 h-1 bg-rhozly-outline/20 rounded-full overflow-hidden">
              <div className="h-full bg-rhozly-primary rounded-full transition-all duration-300"
                style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
            </div>
          </div>
          <button onClick={onClose} data-testid="sketch-close" aria-label="Close"
            className="p-1 text-rhozly-on-surface-variant hover:text-rhozly-on-surface">
            <X size={20} />
          </button>
        </div>

        <div className="px-6 py-6">
          {/* ── Step 0 — Upload ── */}
          {step === 0 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-black text-rhozly-on-surface">Convert a sketch</h2>
                <p className="text-sm text-rhozly-on-surface-variant mt-1">
                  Snap or upload a top-down drawing of your garden. AI picks out the beds, paths, and
                  structures, then you refine them into a real layout.
                </p>
              </div>

              {tierLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="animate-spin text-rhozly-primary" /></div>
              ) : !isSagePlus ? (
                <div data-testid="sketch-to-layout-ai-gate"
                  className="bg-rhozly-surface rounded-3xl border border-rhozly-outline/20 p-6 text-center">
                  <div className="w-10 h-10 bg-rhozly-on-surface/5 rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <Lock size={18} className="text-rhozly-on-surface/30" />
                  </div>
                  <p className="font-black text-rhozly-on-surface text-sm mb-1">Sage tier required</p>
                  <p className="text-xs font-bold text-rhozly-on-surface/50 leading-relaxed">
                    Upgrade to Sage to turn a hand-drawn sketch into a garden layout with AI.
                  </p>
                </div>
              ) : (
                <>
                  {previewUrl ? (
                    <div className="rounded-2xl overflow-hidden border border-rhozly-outline/20">
                      <img src={previewUrl} alt="Your sketch" className="w-full max-h-64 object-contain bg-rhozly-surface" />
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <button data-testid="sketch-upload-camera" onClick={() => cameraRef.current?.click()}
                        className="flex flex-col items-center gap-2 p-6 rounded-2xl border-2 border-rhozly-outline/20 hover:border-rhozly-primary/40 hover:bg-rhozly-primary/5 transition-all">
                        <Camera size={24} className="text-rhozly-primary" />
                        <span className="text-sm font-bold text-rhozly-on-surface">Take photo</span>
                      </button>
                      <button data-testid="sketch-upload-file" onClick={() => fileRef.current?.click()}
                        className="flex flex-col items-center gap-2 p-6 rounded-2xl border-2 border-rhozly-outline/20 hover:border-rhozly-primary/40 hover:bg-rhozly-primary/5 transition-all">
                        <Upload size={24} className="text-rhozly-primary" />
                        <span className="text-sm font-bold text-rhozly-on-surface">Upload</span>
                      </button>
                    </div>
                  )}
                  <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
                  <input ref={fileRef} type="file" accept="image/*" className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />

                  {previewUrl && (
                    <div className="flex gap-2">
                      <button onClick={() => { setPreviewUrl(null); setBase64(""); }}
                        className="flex-1 py-3 rounded-2xl border border-rhozly-outline/30 text-sm font-bold text-rhozly-on-surface-variant">
                        Choose another
                      </button>
                      <button data-testid="sketch-detect-btn" onClick={runDetect} disabled={!base64 || detecting}
                        className="flex-1 py-3 rounded-2xl bg-rhozly-primary text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50">
                        {detecting ? <><Loader2 size={16} className="animate-spin" /> Reading…</> : <><Sparkles size={16} /> Read my sketch</>}
                      </button>
                    </div>
                  )}

                  <button onClick={createBlank} disabled={creating}
                    className="w-full text-xs font-bold text-rhozly-on-surface-variant hover:text-rhozly-on-surface pt-1">
                    …or start a blank layout instead
                  </button>
                </>
              )}
            </div>
          )}

          {/* ── Step 1 — Scale ── */}
          {step === 1 && detection && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-black text-rhozly-on-surface">Set the scale</h2>
                <p className="text-sm text-rhozly-on-surface-variant mt-1">
                  {detection.shapes.length} shape{detection.shapes.length === 1 ? "" : "s"} detected. A sketch has no
                  real size — tell us one measurement so we can lay it out in metres.
                </p>
              </div>
              {previewUrl && (
                <div className="rounded-2xl overflow-hidden border border-rhozly-outline/20">
                  <img src={previewUrl} alt="Your sketch" className="w-full max-h-40 object-contain bg-rhozly-surface" />
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setScaleMode("garden")} data-testid="sketch-scale-mode-garden"
                  className={`py-2 rounded-2xl text-xs font-bold border-2 transition-all ${scaleMode === "garden" ? "border-rhozly-primary bg-rhozly-primary/5 text-rhozly-on-surface" : "border-rhozly-outline/20 text-rhozly-on-surface-variant"}`}>
                  Whole garden width
                </button>
                <button onClick={() => setScaleMode("shape")} data-testid="sketch-scale-mode-shape"
                  className={`py-2 rounded-2xl text-xs font-bold border-2 transition-all ${scaleMode === "shape" ? "border-rhozly-primary bg-rhozly-primary/5 text-rhozly-on-surface" : "border-rhozly-outline/20 text-rhozly-on-surface-variant"}`}>
                  A specific shape
                </button>
              </div>

              {scaleMode === "garden" ? (
                <label className="block">
                  <span className="text-sm font-bold text-rhozly-on-surface">How wide is your garden? (m)</span>
                  <input type="number" min={1} max={200} step={0.5} value={gardenWidthM} data-testid="sketch-scale-width"
                    onChange={(e) => setGardenWidthM(Number(e.target.value))}
                    className="mt-1 w-full px-4 py-3 rounded-2xl border border-rhozly-outline/30 text-rhozly-on-surface" />
                </label>
              ) : (
                <div className="space-y-2">
                  <label className="block">
                    <span className="text-sm font-bold text-rhozly-on-surface">Which shape do you know the size of?</span>
                    <select value={refShapeIdx} onChange={(e) => setRefShapeIdx(Number(e.target.value))}
                      className="mt-1 w-full px-4 py-3 rounded-2xl border border-rhozly-outline/30 text-rhozly-on-surface bg-white">
                      {detection.shapes.map((s, i) => (
                        <option key={i} value={i}>{s.label_guess || s.detected_kind.replace(/_/g, " ")} ({i + 1})</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-sm font-bold text-rhozly-on-surface">How wide is it? (m)</span>
                    <input type="number" min={0.1} max={200} step={0.1} value={refShapeWidthM}
                      onChange={(e) => setRefShapeWidthM(Number(e.target.value))}
                      className="mt-1 w-full px-4 py-3 rounded-2xl border border-rhozly-outline/30 text-rhozly-on-surface" />
                  </label>
                </div>
              )}

              <div className="text-xs font-bold text-rhozly-on-surface-variant bg-rhozly-surface rounded-2xl px-4 py-3">
                Canvas: {canvas.canvas_w_m} × {canvas.canvas_h_m} m
              </div>

              <button data-testid="sketch-next" onClick={() => setStep(2)}
                className="w-full py-3 rounded-2xl bg-rhozly-primary text-white text-sm font-bold">
                Next — classify shapes
              </button>
            </div>
          )}

          {/* ── Step 2 — Classify ── */}
          {step === 2 && detection && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-black text-rhozly-on-surface">Classify shapes</h2>
                <p className="text-sm text-rhozly-on-surface-variant mt-1">
                  Set what each shape is. Uncertain ones are flagged at the top. Remove anything the AI got
                  wrong — you can add missed shapes in the editor.
                </p>
              </div>

              <div className="space-y-3 max-h-[45vh] overflow-y-auto pr-1">
                {classifyOrder.map((i) => {
                  const s = detection.shapes[i];
                  const c = classes[i];
                  const lowConf = s.confidence < LOW_CONFIDENCE;
                  return (
                    <div key={i} data-testid={`sketch-shape-row-${i}`}
                      className="rounded-2xl border border-rhozly-outline/20 p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        {lowConf && (
                          <span className="flex items-center gap-1 text-[10px] font-black text-amber-600 bg-amber-50 rounded-full px-2 py-0.5">
                            <AlertTriangle size={11} /> check
                          </span>
                        )}
                        <span className="text-xs font-bold text-rhozly-on-surface-variant capitalize">
                          {s.detected_kind.replace(/_/g, " ")}
                        </span>
                        <button data-testid={`sketch-shape-remove-${i}`} aria-label="Remove shape"
                          onClick={() => setClasses((prev) => prev.map((p, j) => j === i ? { ...p, removed: true } : p))}
                          className="ml-auto p-1 text-rhozly-on-surface-variant hover:text-red-500">
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <select value={c.presetId ?? ""} aria-label="Shape type"
                          onChange={(e) => setClasses((prev) => prev.map((p, j) => j === i ? { ...p, presetId: e.target.value || null } : p))}
                          className="px-3 py-2 rounded-xl border border-rhozly-outline/30 text-sm bg-white">
                          <option value="">Unclassified</option>
                          {GROUP_ORDER.map((g) => (
                            <optgroup key={g} label={GROUP_LABEL[g]}>
                              {SHAPE_PRESETS.filter((p) => p.group === g).map((p) => (
                                <option key={p.id} value={p.id}>{p.label}</option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                        <select value={c.areaId ?? ""} aria-label="Link to area"
                          onChange={(e) => setClasses((prev) => prev.map((p, j) => j === i ? { ...p, areaId: e.target.value || null } : p))}
                          className="px-3 py-2 rounded-xl border border-rhozly-outline/30 text-sm bg-white">
                          <option value="">No area link</option>
                          {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                      </div>
                      <input type="text" value={c.label} placeholder="Label (optional)"
                        onChange={(e) => setClasses((prev) => prev.map((p, j) => j === i ? { ...p, label: e.target.value } : p))}
                        className="w-full px-3 py-2 rounded-xl border border-rhozly-outline/30 text-sm" />
                    </div>
                  );
                })}
                {activeCount === 0 && (
                  <p className="text-sm text-rhozly-on-surface-variant text-center py-6">
                    No shapes left — go back, or create a blank layout and draw it yourself.
                  </p>
                )}
              </div>

              <button data-testid="sketch-next" onClick={() => setStep(3)}
                className="w-full py-3 rounded-2xl bg-rhozly-primary text-white text-sm font-bold">
                Next — review
              </button>
            </div>
          )}

          {/* ── Step 3 — Review ── */}
          {step === 3 && detection && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-black text-rhozly-on-surface">Review & create</h2>
                <p className="text-sm text-rhozly-on-surface-variant mt-1">
                  {activeCount} shape{activeCount === 1 ? "" : "s"} on a {canvas.canvas_w_m} × {canvas.canvas_h_m} m canvas.
                </p>
              </div>
              <label className="block">
                <span className="text-sm font-bold text-rhozly-on-surface">Layout name</span>
                <input type="text" value={layoutName} data-testid="sketch-layout-name"
                  onChange={(e) => setLayoutName(e.target.value)}
                  className="mt-1 w-full px-4 py-3 rounded-2xl border border-rhozly-outline/30 text-rhozly-on-surface" />
              </label>
              <button data-testid="sketch-create-btn" onClick={handleCreate} disabled={creating || activeCount === 0}
                className="w-full py-3 rounded-2xl bg-rhozly-primary text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50">
                {creating ? <><Loader2 size={16} className="animate-spin" /> Creating…</> : "Create layout"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
