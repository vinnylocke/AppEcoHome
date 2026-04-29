import React, { useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  X, Camera, Upload, Loader2, CheckCircle2, AlertTriangle, AlertCircle,
  Leaf, Bug, Droplets, Wind, Sun, Sprout, ChevronDown, ChevronUp,
  Check, Minus, Edit3, Trash2, Sparkles, ScanLine, RefreshCw,
  Biohazard, FlaskConical, Clock, CalendarDays, RotateCcw, ArrowRight,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import toast from "react-hot-toast";
import { getQuestionsToAsk, ScanQuestion } from "../lib/scanQuestions";
import { logEvent, EVENT } from "../events/registry";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlantResult {
  identified_name: string;
  scientific_name?: string;
  confidence: number;
  health_status: "good" | "warning" | "issue";
  health_notes: string;
  pruning_advice?: string;
  position_suitability: "good" | "marginal" | "poor";
  position_notes?: string;
}

interface MaintenanceSuggestion {
  title: string;
  description: string;
  urgency: "now" | "this_week" | "this_month" | "seasonal";
  recurring: boolean;
  frequency_days?: number;
  _state?: "pending" | "accepted" | "dismissed";
}

interface PestDisease {
  name: string;
  type: "pest" | "disease";
  severity: "mild" | "moderate" | "severe";
  affected_plants?: string[];
  notes: string;
  action_needed: string;
}

interface ScanAnalysis {
  summary: string;
  capacity: {
    current_count: number;
    estimated_max: number;
    label: "Well stocked" | "Room to grow" | "Near capacity" | "Overcrowded";
  };
  plants: PlantResult[];
  companions: Array<{ name: string; reason: string }>;
  maintenance: MaintenanceSuggestion[];
  pests_diseases: PestDisease[];
  soil_conditions: {
    observed_medium?: string;
    drainage_notes?: string;
    recommendations?: string;
  };
  weather_advice?: string;
}

interface AreaScanModalProps {
  homeId: string;
  area: any;
  weatherSnap?: any;
  onClose: () => void;
  onScanSaved: (scan: any) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const URGENCY_LABELS: Record<string, string> = {
  now: "Do now",
  this_week: "This week",
  this_month: "This month",
  seasonal: "Seasonal",
};

const URGENCY_COLOURS: Record<string, string> = {
  now: "bg-red-100 text-red-700",
  this_week: "bg-amber-100 text-amber-700",
  this_month: "bg-blue-100 text-blue-700",
  seasonal: "bg-green-100 text-green-700",
};

const CAPACITY_COLOURS: Record<string, string> = {
  "Well stocked": "bg-blue-100 text-blue-700",
  "Room to grow": "bg-green-100 text-green-700",
  "Near capacity": "bg-amber-100 text-amber-700",
  "Overcrowded": "bg-red-100 text-red-700",
};

const HEALTH_META: Record<string, { icon: React.ReactNode; colour: string; label: string }> = {
  good:    { icon: <CheckCircle2 size={14} />, colour: "text-green-600 bg-green-100",  label: "Healthy" },
  warning: { icon: <AlertTriangle size={14} />, colour: "text-amber-600 bg-amber-100", label: "Needs attention" },
  issue:   { icon: <AlertCircle size={14} />,  colour: "text-red-600 bg-red-100",      label: "Issue found" },
};

const SUITABILITY_META: Record<string, { colour: string; label: string }> = {
  good:     { colour: "text-green-600", label: "Good position" },
  marginal: { colour: "text-amber-600", label: "Marginal position" },
  poor:     { colour: "text-red-600",   label: "Poor position" },
};

const SEVERITY_COLOURS: Record<string, string> = {
  mild:     "bg-amber-100 text-amber-700 border-amber-200",
  moderate: "bg-orange-100 text-orange-700 border-orange-200",
  severe:   "bg-red-100 text-red-700 border-red-200",
};

function confidenceLabel(c: number): { label: string; colour: string } {
  if (c >= 0.8) return { label: "High confidence", colour: "text-green-600" };
  if (c >= 0.55) return { label: "Moderate confidence", colour: "text-amber-600" };
  return { label: "Low confidence", colour: "text-red-500" };
}

function derivedueDateFromUrgency(urgency: string): string {
  const today = new Date();
  const offsets: Record<string, number> = {
    now: 0, this_week: 3, this_month: 7, seasonal: 30,
  };
  today.setDate(today.getDate() + (offsets[urgency] ?? 0));
  return today.toISOString().split("T")[0];
}

async function resizeImage(file: File, maxPx = 1920): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      resolve({ base64: dataUrl.split(",")[1], mimeType: "image/jpeg" });
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

// ─── Main Component ───────────────────────────────────────────────────────────

type FlowState = "idle" | "previewing" | "questioning" | "uploading" | "analysing" | "results";

export default function AreaScanModal({
  homeId,
  area,
  weatherSnap,
  onClose,
  onScanSaved,
}: AreaScanModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [flow, setFlow] = useState<FlowState>("idle");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string>("");
  const [imageMimeType, setImageMimeType] = useState<string>("image/jpeg");

  const questions = getQuestionsToAsk(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const [statusMessage, setStatusMessage] = useState("");
  const [analysis, setAnalysis] = useState<ScanAnalysis | null>(null);
  const [savedScanId, setSavedScanId] = useState<string | null>(null);

  // Task suggestion states
  const [taskStates, setTaskStates] = useState<Record<number, "pending" | "accepted" | "dismissed">>({});
  const [savingTask, setSavingTask] = useState<number | null>(null);

  // Pest/disease link states
  const [expandedPest, setExpandedPest] = useState<number | null>(null);

  // Results section collapse
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggleSection = (key: string) =>
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));

  const handleFileSelect = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file.");
      return;
    }
    setImageFile(file);
    setImagePreviewUrl(URL.createObjectURL(file));
    const { base64, mimeType } = await resizeImage(file);
    setImageBase64(base64);
    setImageMimeType(mimeType);
    setFlow("previewing");
  }, []);

  const handleRunScan = async () => {
    if (!imageBase64) return;

    try {
      // Upload image to Storage
      setFlow("uploading");
      setStatusMessage("Uploading image...");

      const filePath = `${homeId}/${area.id}/${Date.now()}.jpg`;
      const blob = await (await fetch(`data:${imageMimeType};base64,${imageBase64}`)).blob();

      const { error: uploadError } = await supabase.storage
        .from("area-scans")
        .upload(filePath, blob, { contentType: imageMimeType, upsert: false });

      if (uploadError) throw uploadError;

      const imageUrl = supabase.storage.from("area-scans").getPublicUrl(filePath).data.publicUrl;

      // Call edge function
      setFlow("analysing");
      setStatusMessage("Identifying plants...");

      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const { data: fnData, error: fnError } = await supabase.functions.invoke("scan-area", {
        body: {
          homeId,
          areaId: area.id,
          imageBase64,
          mimeType: imageMimeType,
          questions: Object.keys(answers).length > 0 ? answers : undefined,
          weatherSnap: weatherSnap ?? undefined,
        },
      });

      if (fnError) throw fnError;
      if (fnData?.error) throw new Error(fnData.error);

      setStatusMessage("Saving results...");
      const result = fnData as ScanAnalysis;

      // Save scan record
      const { data: scan, error: saveError } = await supabase
        .from("area_scans")
        .insert({
          home_id: homeId,
          area_id: area.id,
          image_url: imageUrl,
          image_path: filePath,
          analysis: result,
          questions: Object.keys(answers).length > 0 ? answers : null,
          weather_snap: weatherSnap ?? null,
        })
        .select()
        .single();

      if (saveError) throw saveError;

      setSavedScanId(scan.id);
      setAnalysis(result);
      setTaskStates({});
      setFlow("results");

      logEvent(EVENT.AREA_SCAN_COMPLETED, {
        area_id: area.id,
        area_name: area.name,
        plant_count: result.plants.length,
        pests_found: result.pests_diseases.length > 0,
        capacity_label: result.capacity.label,
      });

      onScanSaved(scan);
    } catch (err: any) {
      toast.error(`Scan failed: ${err.message}`);
      setFlow("previewing");
    }
  };

  const handleAcceptTask = async (idx: number, suggestion: MaintenanceSuggestion) => {
    setSavingTask(idx);
    try {
      if (suggestion.recurring && suggestion.frequency_days) {
        await supabase.from("task_blueprints").insert({
          home_id: homeId,
          area_id: area.id,
          location_id: area.location_id ?? null,
          title: suggestion.title,
          description: suggestion.description,
          start_date: new Date().toISOString().split("T")[0],
          frequency_days: suggestion.frequency_days,
          is_recurring: true,
          task_type: "General",
          blueprint_type: "plant",
        });
        toast.success(`Recurring task created: ${suggestion.title}`);
      } else {
        await supabase.from("tasks").insert({
          home_id: homeId,
          area_id: area.id,
          location_id: area.location_id ?? null,
          title: suggestion.title,
          description: suggestion.description,
          due_date: derivedueDateFromUrgency(suggestion.urgency),
          status: "Pending",
        });
        toast.success(`Task added: ${suggestion.title}`);
      }
      logEvent(EVENT.SCAN_TASK_ACCEPTED, {
        area_id: area.id,
        task_title: suggestion.title,
        urgency: suggestion.urgency,
      });
      setTaskStates((prev) => ({ ...prev, [idx]: "accepted" }));
    } catch {
      toast.error("Could not create task.");
    } finally {
      setSavingTask(null);
    }
  };

  const handleDismissTask = (idx: number) =>
    setTaskStates((prev) => ({ ...prev, [idx]: "dismissed" }));

  // ─── Render ────────────────────────────────────────────────────────────────

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl mt-4 mb-8 overflow-hidden animate-in fade-in zoom-in-95 duration-200">

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-rhozly-outline/10">
          <div className="flex items-center gap-3">
            <div className="bg-rhozly-primary/10 p-2 rounded-xl">
              <ScanLine className="w-5 h-5 text-rhozly-primary" />
            </div>
            <div>
              <h2 className="font-black text-xl font-display text-rhozly-on-surface">
                Scan Area
              </h2>
              <p className="text-xs font-bold text-rhozly-on-surface/40 uppercase tracking-widest">
                {area.name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-rhozly-on-surface/40 hover:text-rhozly-on-surface hover:bg-rhozly-surface-low transition-all"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6">

          {/* ── IDLE: capture or upload ──────────────────────────────── */}
          {flow === "idle" && (
            <div className="space-y-4">
              <p className="text-sm text-rhozly-on-surface/60 leading-relaxed">
                Take or upload a photo of <strong>{area.name}</strong> and our AI will identify
                plants, flag health issues, spot pests, and suggest tasks.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => cameraInputRef.current?.click()}
                  className="flex flex-col items-center gap-3 p-8 rounded-3xl border-2 border-dashed border-rhozly-primary/30 bg-rhozly-primary/5 hover:bg-rhozly-primary/10 hover:border-rhozly-primary/50 transition-all group"
                >
                  <Camera className="w-10 h-10 text-rhozly-primary group-hover:scale-110 transition-transform" />
                  <span className="font-bold text-sm text-rhozly-primary">Take Photo</span>
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center gap-3 p-8 rounded-3xl border-2 border-dashed border-rhozly-outline/30 bg-rhozly-surface-lowest hover:bg-rhozly-surface-low hover:border-rhozly-outline/50 transition-all group"
                >
                  <Upload className="w-10 h-10 text-rhozly-on-surface/40 group-hover:scale-110 transition-transform" />
                  <span className="font-bold text-sm text-rhozly-on-surface/60">Upload Image</span>
                </button>
              </div>
              <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])} />
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])} />
            </div>
          )}

          {/* ── PREVIEWING: show image + question step ───────────────── */}
          {(flow === "previewing" || flow === "questioning") && imagePreviewUrl && (
            <div className="space-y-4">
              <div className="relative rounded-2xl overflow-hidden">
                <img src={imagePreviewUrl} alt="Area scan" className="w-full max-h-72 object-cover" />
                <button
                  onClick={() => { setFlow("idle"); setImagePreviewUrl(null); setImageBase64(""); }}
                  className="absolute top-3 right-3 p-1.5 bg-black/50 hover:bg-black/70 text-white rounded-lg transition-all"
                >
                  <RotateCcw size={14} />
                </button>
              </div>

              {flow === "previewing" && (
                <div className="flex gap-3">
                  <button
                    onClick={() => setFlow("questioning")}
                    className="flex-1 py-3 rounded-2xl border border-rhozly-outline/20 text-sm font-bold text-rhozly-on-surface/60 hover:bg-rhozly-surface-low transition-all"
                  >
                    Add context first
                  </button>
                  <button
                    onClick={handleRunScan}
                    className="flex-1 py-3 rounded-2xl bg-rhozly-primary text-white font-black text-sm hover:bg-rhozly-primary/90 transition-all flex items-center justify-center gap-2"
                  >
                    <ScanLine size={16} />
                    Scan Now
                  </button>
                </div>
              )}

              {flow === "questioning" && (
                <div className="space-y-4">
                  <h3 className="font-black text-sm uppercase tracking-widest text-rhozly-on-surface/50">
                    Quick questions (optional)
                  </h3>
                  {questions.map((q) => (
                    <QuestionInput
                      key={q.id}
                      question={q}
                      value={answers[q.question] ?? ""}
                      onChange={(val) =>
                        setAnswers((prev) =>
                          val ? { ...prev, [q.question]: val } : Object.fromEntries(
                            Object.entries(prev).filter(([k]) => k !== q.question),
                          )
                        )
                      }
                    />
                  ))}
                  <button
                    onClick={handleRunScan}
                    className="w-full py-3 rounded-2xl bg-rhozly-primary text-white font-black text-sm hover:bg-rhozly-primary/90 transition-all flex items-center justify-center gap-2"
                  >
                    <ScanLine size={16} />
                    Start Scan
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── UPLOADING / ANALYSING: progress ─────────────────────── */}
          {(flow === "uploading" || flow === "analysing") && (
            <div className="py-16 flex flex-col items-center gap-6">
              <div className="relative">
                <div className="w-20 h-20 rounded-full bg-rhozly-primary/10 flex items-center justify-center">
                  <ScanLine className="w-10 h-10 text-rhozly-primary animate-pulse" />
                </div>
                <Loader2 className="w-6 h-6 text-rhozly-primary animate-spin absolute -bottom-1 -right-1" />
              </div>
              <div className="text-center space-y-1">
                <p className="font-black text-rhozly-on-surface">{statusMessage}</p>
                <p className="text-sm text-rhozly-on-surface/40">
                  {flow === "uploading" ? "Preparing image for analysis..." : "AI is analysing your garden area..."}
                </p>
              </div>
            </div>
          )}

          {/* ── RESULTS ──────────────────────────────────────────────── */}
          {flow === "results" && analysis && (
            <div className="space-y-5">

              {/* Summary + capacity */}
              <div className="bg-rhozly-surface-lowest rounded-2xl p-5 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <p className="text-sm text-rhozly-on-surface/70 leading-relaxed flex-1">
                    {analysis.summary}
                  </p>
                  {analysis.capacity && (
                    <span className={`shrink-0 text-xs font-black px-3 py-1 rounded-full ${CAPACITY_COLOURS[analysis.capacity.label] ?? "bg-gray-100 text-gray-600"}`}>
                      {analysis.capacity.label}
                    </span>
                  )}
                </div>
                {analysis.capacity && (
                  <div className="flex items-center gap-2 text-xs text-rhozly-on-surface/40 font-bold">
                    <Sprout size={12} />
                    {analysis.capacity.current_count} visible plants · estimated max {analysis.capacity.estimated_max}
                  </div>
                )}
              </div>

              {/* Weather advice */}
              {analysis.weather_advice && (
                <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex gap-3">
                  <Wind size={16} className="text-blue-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-blue-700">{analysis.weather_advice}</p>
                </div>
              )}

              {/* Plants */}
              {analysis.plants.length > 0 && (
                <ResultSection
                  icon={<Leaf size={16} />}
                  title={`Plants (${analysis.plants.length})`}
                  sectionKey="plants"
                  collapsed={collapsed}
                  onToggle={toggleSection}
                >
                  <div className="space-y-3">
                    {analysis.plants.map((plant, i) => {
                      const health = HEALTH_META[plant.health_status];
                      const suit = SUITABILITY_META[plant.position_suitability];
                      const conf = confidenceLabel(plant.confidence);
                      return (
                        <div key={i} className="bg-white rounded-2xl p-4 border border-rhozly-outline/10 space-y-2 shadow-sm">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-black text-rhozly-on-surface">{plant.identified_name}</p>
                              {plant.scientific_name && (
                                <p className="text-xs text-rhozly-on-surface/40 italic">{plant.scientific_name}</p>
                              )}
                            </div>
                            <span className={`text-xs font-black px-2 py-0.5 rounded-full flex items-center gap-1 ${health.colour}`}>
                              {health.icon}{health.label}
                            </span>
                          </div>
                          {/* Confidence bar */}
                          <div className="space-y-1">
                            <div className="flex justify-between items-center">
                              <span className="text-xs text-rhozly-on-surface/40">Confidence</span>
                              <span className={`text-xs font-bold ${conf.colour}`}>{conf.label} · {Math.round(plant.confidence * 100)}%</span>
                            </div>
                            <div className="h-1.5 bg-rhozly-outline/20 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${plant.confidence >= 0.8 ? "bg-green-500" : plant.confidence >= 0.55 ? "bg-amber-500" : "bg-red-400"}`}
                                style={{ width: `${plant.confidence * 100}%` }}
                              />
                            </div>
                          </div>
                          {plant.confidence < 0.55 && (
                            <p className="text-xs text-red-500 font-bold">AI is uncertain — verify before acting on this identification.</p>
                          )}
                          <p className="text-xs text-rhozly-on-surface/60">{plant.health_notes}</p>
                          {plant.pruning_advice && (
                            <p className="text-xs text-rhozly-on-surface/50 border-t border-rhozly-outline/10 pt-2">
                              ✂️ {plant.pruning_advice}
                            </p>
                          )}
                          <p className={`text-xs font-bold ${suit.colour}`}>
                            Position: {suit.label}{plant.position_notes ? ` — ${plant.position_notes}` : ""}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </ResultSection>
              )}

              {/* Maintenance / Task suggestions */}
              {analysis.maintenance.length > 0 && (
                <ResultSection
                  icon={<CalendarDays size={16} />}
                  title={`Suggested Tasks (${analysis.maintenance.length})`}
                  sectionKey="tasks"
                  collapsed={collapsed}
                  onToggle={toggleSection}
                >
                  <div className="space-y-3">
                    {analysis.maintenance.map((s, i) => {
                      const state = taskStates[i] ?? "pending";
                      return (
                        <div
                          key={i}
                          className={`rounded-2xl p-4 border transition-all ${
                            state === "accepted" ? "bg-green-50 border-green-200 opacity-70" :
                            state === "dismissed" ? "bg-rhozly-surface-lowest border-rhozly-outline/10 opacity-40" :
                            "bg-white border-rhozly-outline/10 shadow-sm"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex-1 space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className={`font-bold text-sm ${state === "dismissed" ? "line-through text-rhozly-on-surface/40" : "text-rhozly-on-surface"}`}>
                                  {s.title}
                                </p>
                                <span className={`text-xs font-black px-2 py-0.5 rounded-full ${URGENCY_COLOURS[s.urgency]}`}>
                                  {URGENCY_LABELS[s.urgency]}
                                </span>
                                {s.recurring && (
                                  <span className="text-xs font-black px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                                    Every {s.frequency_days}d
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-rhozly-on-surface/50">{s.description}</p>
                            </div>
                            {state === "pending" && (
                              <div className="flex gap-1 shrink-0">
                                <button
                                  onClick={() => handleAcceptTask(i, s)}
                                  disabled={savingTask === i}
                                  className="p-2 rounded-xl bg-green-100 text-green-700 hover:bg-green-200 transition-all disabled:opacity-50"
                                  title="Accept"
                                >
                                  {savingTask === i ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                                </button>
                                <button
                                  onClick={() => handleDismissTask(i)}
                                  className="p-2 rounded-xl text-rhozly-on-surface/30 hover:bg-red-50 hover:text-red-500 transition-all"
                                  title="Dismiss"
                                >
                                  <Minus size={14} />
                                </button>
                              </div>
                            )}
                            {state === "accepted" && (
                              <CheckCircle2 size={18} className="text-green-500 shrink-0" />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ResultSection>
              )}

              {/* Pests & Diseases */}
              {analysis.pests_diseases.length > 0 && (
                <ResultSection
                  icon={<Bug size={16} />}
                  title={`Pests & Diseases (${analysis.pests_diseases.length})`}
                  sectionKey="pests"
                  collapsed={collapsed}
                  onToggle={toggleSection}
                  accent="red"
                >
                  <div className="space-y-3">
                    {analysis.pests_diseases.map((pest, i) => (
                      <div key={i} className={`rounded-2xl p-4 border ${SEVERITY_COLOURS[pest.severity]} space-y-2`}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            {pest.type === "pest" ? <Bug size={16} /> : <Biohazard size={16} />}
                            <p className="font-black text-sm">{pest.name}</p>
                          </div>
                          <span className="text-xs font-black uppercase">{pest.severity}</span>
                        </div>
                        <p className="text-xs">{pest.notes}</p>
                        {pest.affected_plants && pest.affected_plants.length > 0 && (
                          <p className="text-xs opacity-70">Affects: {pest.affected_plants.join(", ")}</p>
                        )}
                        <p className="text-xs font-bold border-t border-current/20 pt-2">
                          Action: {pest.action_needed}
                        </p>
                        {savedScanId && (
                          <LinkAilmentFromScan
                            homeId={homeId}
                            pest={pest}
                            scanId={savedScanId}
                            areaId={area.id}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </ResultSection>
              )}

              {/* Companions */}
              {analysis.companions.length > 0 && (
                <ResultSection
                  icon={<Sparkles size={16} />}
                  title="Companion Plants"
                  sectionKey="companions"
                  collapsed={collapsed}
                  onToggle={toggleSection}
                >
                  <div className="flex flex-wrap gap-2">
                    {analysis.companions.map((c, i) => (
                      <div key={i} className="group relative">
                        <span className="px-3 py-1.5 rounded-full bg-rhozly-primary/10 text-rhozly-primary text-xs font-bold cursor-default">
                          {c.name}
                        </span>
                        <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block z-10 bg-rhozly-on-surface text-white text-xs rounded-xl px-3 py-2 max-w-48 shadow-lg">
                          {c.reason}
                        </div>
                      </div>
                    ))}
                  </div>
                </ResultSection>
              )}

              {/* Soil conditions */}
              {(analysis.soil_conditions.observed_medium || analysis.soil_conditions.drainage_notes || analysis.soil_conditions.recommendations) && (
                <ResultSection
                  icon={<FlaskConical size={16} />}
                  title="Soil & Conditions"
                  sectionKey="soil"
                  collapsed={collapsed}
                  onToggle={toggleSection}
                >
                  <div className="space-y-1 text-sm text-rhozly-on-surface/60">
                    {analysis.soil_conditions.observed_medium && (
                      <p><span className="font-bold text-rhozly-on-surface/80">Medium:</span> {analysis.soil_conditions.observed_medium}</p>
                    )}
                    {analysis.soil_conditions.drainage_notes && (
                      <p><span className="font-bold text-rhozly-on-surface/80">Drainage:</span> {analysis.soil_conditions.drainage_notes}</p>
                    )}
                    {analysis.soil_conditions.recommendations && (
                      <p><span className="font-bold text-rhozly-on-surface/80">Recommendation:</span> {analysis.soil_conditions.recommendations}</p>
                    )}
                  </div>
                </ResultSection>
              )}

              <button
                onClick={onClose}
                className="w-full py-3 rounded-2xl bg-rhozly-surface-lowest border border-rhozly-outline/20 text-sm font-bold text-rhozly-on-surface/60 hover:bg-rhozly-surface-low transition-all"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function ResultSection({
  icon, title, sectionKey, collapsed, onToggle, accent, children,
}: {
  icon: React.ReactNode;
  title: string;
  sectionKey: string;
  collapsed: Record<string, boolean>;
  onToggle: (k: string) => void;
  accent?: "red";
  children: React.ReactNode;
}) {
  const isCollapsed = collapsed[sectionKey] ?? false;
  return (
    <div className={`rounded-2xl border overflow-hidden ${accent === "red" ? "border-red-200 bg-red-50/30" : "border-rhozly-outline/10 bg-rhozly-surface-lowest"}`}>
      <button
        onClick={() => onToggle(sectionKey)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-black/[0.02] transition-colors"
      >
        <div className={`flex items-center gap-2 font-black text-sm ${accent === "red" ? "text-red-700" : "text-rhozly-on-surface"}`}>
          {icon}{title}
        </div>
        {isCollapsed ? <ChevronDown size={16} className="text-rhozly-on-surface/30" /> : <ChevronUp size={16} className="text-rhozly-on-surface/30" />}
      </button>
      {!isCollapsed && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

function QuestionInput({
  question, value, onChange,
}: {
  question: ScanQuestion;
  value: string;
  onChange: (val: string) => void;
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-bold text-rhozly-on-surface/70">{question.question}</label>
      {question.type === "select" && question.options && (
        <div className="flex flex-wrap gap-2">
          {question.options.map((opt) => (
            <button
              key={opt}
              onClick={() => onChange(value === opt ? "" : opt)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                value === opt
                  ? "bg-rhozly-primary text-white"
                  : "bg-rhozly-surface-lowest border border-rhozly-outline/20 text-rhozly-on-surface/60 hover:border-rhozly-primary/30"
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
      {question.type === "yesno" && (
        <div className="flex gap-2">
          {["Yes", "No"].map((opt) => (
            <button
              key={opt}
              onClick={() => onChange(value === opt ? "" : opt)}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
                value === opt
                  ? "bg-rhozly-primary text-white"
                  : "bg-rhozly-surface-lowest border border-rhozly-outline/20 text-rhozly-on-surface/60 hover:border-rhozly-primary/30"
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
      {question.type === "text" && (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Type here..."
          className="w-full px-4 py-2 rounded-xl border border-rhozly-outline/20 bg-white text-sm focus:outline-none focus:border-rhozly-primary/50"
        />
      )}
    </div>
  );
}

function LinkAilmentFromScan({
  homeId, pest, scanId, areaId,
}: {
  homeId: string;
  pest: PestDisease;
  scanId: string;
  areaId: string;
}) {
  const [linked, setLinked] = useState(false);
  const [linking, setLinking] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [ailments, setAilments] = useState<any[]>([]);
  const [loadingAilments, setLoadingAilments] = useState(false);

  const loadAilments = async () => {
    if (ailments.length > 0) { setShowPicker(true); return; }
    setLoadingAilments(true);
    const { data } = await supabase
      .from("ailments")
      .select("id, name, type")
      .eq("home_id", homeId)
      .in("type", ["pest", "disease"])
      .eq("is_archived", false)
      .order("name");
    setAilments(data ?? []);
    setLoadingAilments(false);
    setShowPicker(true);
  };

  const handleLink = async (ailmentId: string) => {
    setLinking(true);
    setShowPicker(false);
    try {
      await supabase.from("area_scan_ailments").insert({
        area_scan_id: scanId,
        ailment_id: ailmentId,
        notes: pest.notes,
        severity: pest.severity,
      });
      logEvent(EVENT.SCAN_AILMENT_LINKED, {
        area_id: areaId,
        ailment_name: pest.name,
        severity: pest.severity,
      });
      setLinked(true);
      toast.success(`${pest.name} linked to watchlist.`);
    } catch {
      toast.error("Could not link ailment.");
    } finally {
      setLinking(false);
    }
  };

  if (linked) {
    return (
      <p className="text-xs font-bold flex items-center gap-1 text-green-700">
        <CheckCircle2 size={12} /> Linked to watchlist
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <button
        onClick={loadAilments}
        disabled={linking || loadingAilments}
        className="text-xs font-bold underline underline-offset-2 opacity-70 hover:opacity-100 transition-opacity disabled:opacity-40"
      >
        {linking || loadingAilments ? "Working..." : "Link to watchlist →"}
      </button>
      {showPicker && (
        <div className="bg-white rounded-xl border border-rhozly-outline/20 shadow-lg p-3 space-y-1 max-h-40 overflow-y-auto">
          <p className="text-xs font-black text-rhozly-on-surface/50 uppercase tracking-widest mb-2">Select ailment</p>
          {ailments.length === 0 && (
            <p className="text-xs text-rhozly-on-surface/40 py-2 text-center">No ailments in watchlist yet.</p>
          )}
          {ailments.map((a) => (
            <button
              key={a.id}
              onClick={() => handleLink(a.id)}
              className="w-full text-left text-xs font-bold px-3 py-2 rounded-lg hover:bg-rhozly-primary/10 text-rhozly-on-surface transition-colors"
            >
              {a.name}
            </button>
          ))}
          <button
            onClick={() => setShowPicker(false)}
            className="w-full text-xs text-rhozly-on-surface/40 pt-1 hover:text-rhozly-on-surface transition-colors"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
