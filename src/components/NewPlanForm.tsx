import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../lib/supabase";
import {
  Loader2,
  X,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  MapPin,
  Leaf,
  ShieldAlert,
} from "lucide-react";
import toast from "react-hot-toast";
import { saveInitialPromptMemory } from "../lib/plannerMemory";

interface NewPlanFormProps {
  homeId: string;
  onClose: () => void;
  onSuccess: () => void;
}

const SUNLIGHT_OPTIONS = [
  { value: "full sun", label: "Full Sun" },
  { value: "part sun", label: "Part Sun" },
  { value: "part shade", label: "Part Shade" },
  { value: "filtered shade", label: "Filtered Shade" },
  { value: "full shade", label: "Full Shade" },
];


export default function NewPlanForm({
  homeId,
  onClose,
  onSuccess,
}: NewPlanFormProps) {
  const [step, setStep] = useState(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errors, setErrors] = useState({
    planName: "",
    description: "",
    width: "",
    length: "",
  });

  const [formData, setFormData] = useState({
    planName: "",
    description: "",
    aesthetic: "Natural",
    timeline: "Start Immediately",
    unit: "m",
    width: "",
    length: "",
    depth: "",
    sunlight: "full sun",
    medium: "Standard Soil",
    inclusivePlants: "",
    exclusivePlants: "",
    wildlife: "",
    difficulty: "Beginner",
    maintenance: "Low",
    considerations: "",
  });

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "unset";
    };
  }, []);

  const handleInputChange = (e: any) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    // Clear error for this field when user types
    if (errors[name as keyof typeof errors]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const handleGeneratePlan = async () => {
    const newErrors = {
      planName: !formData.planName ? "Project name is required" : "",
      description: !formData.description ? "Description is required" : "",
      width: !formData.width ? "Width is required" : "",
      length: !formData.length ? "Length is required" : "",
    };

    setErrors(newErrors);

    if (Object.values(newErrors).some((err) => err)) {
      toast.error("Please fill in all required fields.");
      return;
    }

    setIsGenerating(true);
    const toastId = toast.loading("The AI Architect is designing your plan...");

    try {
      const payloadData = {
        ...formData,
        height: `${formData.length}${formData.unit}`,
        width: `${formData.width}${formData.unit}`,
        depth: formData.depth ? `${formData.depth}${formData.unit}` : "N/A",
      };

      const { data, error } = await supabase.functions.invoke(
        "generate-landscape-plan",
        {
          body: { formData: payloadData, homeId },
        },
      );

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const { data: newPlan, error: insertError } = await supabase
        .from("plans")
        .insert({
          home_id: homeId,
          name: formData.planName,
          description: formData.description,
          status: "Draft",
          ai_blueprint: data.blueprint,
          cover_image_url: data.cover_image_url,
        })
        .select("id")
        .single();

      if (insertError) throw insertError;

      // Fire-and-forget: log the event and save structured preferences extracted
      // directly from the form fields (no AI needed — form is already structured).
      saveInitialPromptMemory(homeId, newPlan.id, payloadData);

      toast.success("Blueprint Generated Successfully!", { id: toastId });
      onSuccess();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to generate plan.", { id: toastId });
    } finally {
      setIsGenerating(false);
    }
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    // 🚀 FIX: Removed the zoom-in-95 from the wrapper to prevent viewport clipping
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 sm:p-6 bg-rhozly-bg/95 backdrop-blur-sm animate-in fade-in">
      <div
        // 🚀 FIX: Added the zoom animation directly to the modal box
        className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl border border-rhozly-outline/10 flex flex-col max-h-[100dvh] sm:max-h-[90vh] overflow-hidden relative animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-rhozly-outline/10 bg-rhozly-surface-lowest shrink-0">
          <div className="flex justify-between items-start mb-3">
            <h2 className="text-xl sm:text-2xl font-black flex items-center gap-2 text-rhozly-on-surface">
              <Sparkles className="text-rhozly-primary shrink-0" size={24} />
              <span className="truncate">New Project</span>
            </h2>
            <button
              onClick={onClose}
              disabled={isGenerating}
              className="p-2.5 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors shrink-0 ml-2"
              aria-label="Close dialog"
            >
              <X size={20} className="text-gray-600" />
            </button>
          </div>

          {/* Progress Indicator */}
          <div className="flex items-center gap-2" role="navigation" aria-label="Form progress">
            <div className="flex items-center gap-2 flex-1">
              {[1, 2, 3].map((stepNum) => (
                <div
                  key={stepNum}
                  className="flex items-center gap-2 flex-1"
                >
                  <div
                    className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-black transition-colors ${
                      stepNum === step
                        ? "bg-rhozly-primary text-white"
                        : stepNum < step
                        ? "bg-green-500 text-white"
                        : "bg-gray-200 text-gray-400"
                    }`}
                    aria-current={stepNum === step ? "step" : undefined}
                  >
                    {stepNum}
                    <span className="sr-only">
                      Step {stepNum}:{" "}
                      {stepNum === 1 ? "The Vision" : stepNum === 2 ? "The Environment" : "Preferences & Rules"}
                      {stepNum < step ? " (completed)" : stepNum === step ? " (current)" : ""}
                    </span>
                  </div>
                  {stepNum < 3 && (
                    <div
                      className={`h-1 flex-1 rounded-full transition-colors ${
                        stepNum < step ? "bg-green-500" : "bg-gray-200"
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Scrollable Form Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 custom-scrollbar bg-white">
          {step === 1 && (
            <div className="space-y-5 animate-in slide-in-from-right-4">
              <div className="flex items-center gap-2 mb-2 text-rhozly-primary border-b border-rhozly-outline/5 pb-3">
                <Sparkles size={20} />{" "}
                <h3 className="font-black text-lg">The Vision</h3>
              </div>

              <div className="space-y-2">
                <label htmlFor="planName" className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 ml-1">
                  Project Name *
                </label>
                {/* 🚀 FIX: Enforced text-base on all mobile inputs */}
                <input
                  id="planName"
                  name="planName"
                  value={formData.planName}
                  onChange={handleInputChange}
                  placeholder="e.g., Wildlife Balcony Pond"
                  className={`w-full p-4 bg-rhozly-surface-low rounded-2xl outline-none font-bold text-base focus:ring-2 focus:ring-rhozly-primary/20 border transition-all ${
                    errors.planName ? "border-red-500" : "border-transparent"
                  }`}
                  aria-invalid={!!errors.planName}
                  aria-describedby={errors.planName ? "planName-error" : undefined}
                />
                {errors.planName && (
                  <p id="planName-error" className="text-xs font-bold text-red-600 ml-1 mt-1">
                    {errors.planName}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <label htmlFor="description" className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 ml-1">
                  Brief Description *
                </label>
                <textarea
                  id="description"
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  rows={3}
                  placeholder="What are we building? Who is it for?"
                  className={`w-full p-4 bg-rhozly-surface-low rounded-2xl outline-none font-bold text-base resize-none focus:ring-2 focus:ring-rhozly-primary/20 border transition-all ${
                    errors.description ? "border-red-500" : "border-transparent"
                  }`}
                  aria-invalid={!!errors.description}
                  aria-describedby={errors.description ? "description-error" : undefined}
                />
                {errors.description && (
                  <p id="description-error" className="text-xs font-bold text-red-600 ml-1 mt-1">
                    {errors.description}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <label htmlFor="aesthetic" className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 ml-1">
                    Aesthetic
                  </label>
                  <select
                    id="aesthetic"
                    name="aesthetic"
                    value={formData.aesthetic}
                    onChange={handleInputChange}
                    className="w-full p-4 bg-rhozly-surface-low rounded-2xl font-bold text-base outline-none border border-transparent focus:ring-2 focus:ring-rhozly-primary/20 transition-all"
                  >
                    <option>Natural / Wild</option>
                    <option>Modern Minimalist</option>
                    <option>Cottage Garden</option>
                    <option>Tropical</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label htmlFor="timeline" className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 ml-1">
                    Timeline
                  </label>
                  <select
                    id="timeline"
                    name="timeline"
                    value={formData.timeline}
                    onChange={handleInputChange}
                    className="w-full p-4 bg-rhozly-surface-low rounded-2xl font-bold text-base outline-none border border-transparent focus:ring-2 focus:ring-rhozly-primary/20 transition-all"
                  >
                    <option>Start Immediately</option>
                    <option>Plan for Spring</option>
                    <option>Plan for Autumn</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5 animate-in slide-in-from-right-4">
              <div className="flex items-center gap-2 mb-2 text-blue-500 border-b border-rhozly-outline/5 pb-3">
                <MapPin size={20} />{" "}
                <h3 className="font-black text-lg">The Environment</h3>
              </div>

              <div className="bg-blue-50/50 p-5 rounded-3xl border border-blue-100/50 space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <label htmlFor="unit" className="text-[10px] font-black uppercase text-blue-800/60 tracking-widest">
                    Dimensions
                  </label>
                  <select
                    id="unit"
                    name="unit"
                    value={formData.unit}
                    onChange={handleInputChange}
                    className="ml-auto bg-white border border-blue-200 text-blue-800 text-base sm:text-xs font-black p-2 sm:p-1.5 rounded-lg outline-none cursor-pointer focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="m">Meters (m)</option>
                    <option value="cm">Centimeters (cm)</option>
                    <option value="ft">Feet (ft)</option>
                    <option value="in">Inches (in)</option>
                  </select>
                </div>

                {/* 🚀 FIX: Stacks dimensions on mobile so they don't blow out the screen width */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label htmlFor="width" className="text-[10px] font-bold text-blue-800/60 block mb-1">
                      Width *
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        id="width"
                        name="width"
                        value={formData.width}
                        onChange={handleInputChange}
                        className={`w-full p-3 pr-8 bg-white rounded-xl border font-bold text-base sm:text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all ${
                          errors.width ? "border-red-500" : "border-blue-200"
                        }`}
                        placeholder="0"
                        aria-invalid={!!errors.width}
                        aria-describedby={errors.width ? "width-error" : undefined}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black text-gray-400" aria-hidden="true">
                        {formData.unit}
                      </span>
                    </div>
                    {errors.width && (
                      <p id="width-error" className="text-xs font-bold text-red-600 mt-1">
                        {errors.width}
                      </p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="length" className="text-[10px] font-bold text-blue-800/60 block mb-1">
                      Length *
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        id="length"
                        name="length"
                        value={formData.length}
                        onChange={handleInputChange}
                        className={`w-full p-3 pr-8 bg-white rounded-xl border font-bold text-base sm:text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all ${
                          errors.length ? "border-red-500" : "border-blue-200"
                        }`}
                        placeholder="0"
                        aria-invalid={!!errors.length}
                        aria-describedby={errors.length ? "length-error" : undefined}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black text-gray-400" aria-hidden="true">
                        {formData.unit}
                      </span>
                    </div>
                    {errors.length && (
                      <p id="length-error" className="text-xs font-bold text-red-600 mt-1">
                        {errors.length}
                      </p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="depth" className="text-[10px] font-bold text-blue-800/60 block mb-1">
                      Depth (Opt.)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        id="depth"
                        name="depth"
                        value={formData.depth}
                        onChange={handleInputChange}
                        className="w-full p-3 pr-8 bg-white rounded-xl border border-blue-200 font-bold text-base sm:text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                        placeholder="0"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black text-gray-400" aria-hidden="true">
                        {formData.unit}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <label htmlFor="sunlight" className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 ml-1">
                    Sunlight
                  </label>
                  <select
                    id="sunlight"
                    name="sunlight"
                    value={formData.sunlight}
                    onChange={handleInputChange}
                    className="w-full p-4 bg-rhozly-surface-low rounded-2xl font-bold text-base outline-none border border-transparent focus:ring-2 focus:ring-blue-500/20 transition-all cursor-pointer"
                  >
                    {SUNLIGHT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label htmlFor="medium" className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 ml-1">
                    Medium
                  </label>
                  <select
                    id="medium"
                    name="medium"
                    value={formData.medium}
                    onChange={handleInputChange}
                    className="w-full p-4 bg-rhozly-surface-low rounded-2xl font-bold text-base outline-none border border-transparent focus:ring-2 focus:ring-blue-500/20 transition-all"
                  >
                    <option>Standard Soil</option>
                    <option>Raised Bed Mix</option>
                    <option>Aquatic / Water</option>
                    <option>Pots / Containers</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5 animate-in slide-in-from-right-4">
              <div className="flex items-center gap-2 mb-2 text-green-600 border-b border-rhozly-outline/5 pb-3">
                <Leaf size={20} />{" "}
                <h3 className="font-black text-lg">Preferences & Rules</h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <label htmlFor="inclusivePlants" className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 ml-1">
                    Must Include
                  </label>
                  <input
                    id="inclusivePlants"
                    name="inclusivePlants"
                    value={formData.inclusivePlants}
                    onChange={handleInputChange}
                    placeholder="e.g., Lavender, Ferns"
                    className="w-full p-4 bg-rhozly-surface-low rounded-2xl outline-none font-bold text-base sm:text-sm focus:ring-2 focus:ring-green-500/20 border border-transparent transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="exclusivePlants" className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 ml-1">
                    Do NOT Include
                  </label>
                  <input
                    id="exclusivePlants"
                    name="exclusivePlants"
                    value={formData.exclusivePlants}
                    onChange={handleInputChange}
                    placeholder="e.g., Mint, Ivy"
                    className="w-full p-4 bg-rhozly-surface-low rounded-2xl outline-none font-bold text-base sm:text-sm focus:ring-2 focus:ring-red-500/20 border border-transparent transition-all"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="wildlife" className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 ml-1">
                  Wildlife Goals
                </label>
                <input
                  id="wildlife"
                  name="wildlife"
                  value={formData.wildlife}
                  onChange={handleInputChange}
                  placeholder="e.g., Attract Bees, Frogs"
                  className="w-full p-4 bg-rhozly-surface-low rounded-2xl outline-none font-bold text-base focus:ring-2 focus:ring-green-500/20 border border-transparent transition-all"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <label htmlFor="difficulty" className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 ml-1">
                    Difficulty
                  </label>
                  <select
                    id="difficulty"
                    name="difficulty"
                    value={formData.difficulty}
                    onChange={handleInputChange}
                    className="w-full p-4 bg-rhozly-surface-low rounded-2xl font-bold text-base outline-none border border-transparent focus:ring-2 focus:ring-green-500/20 transition-all"
                  >
                    <option>Beginner</option>
                    <option>Intermediate</option>
                    <option>Expert</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label htmlFor="maintenance" className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 ml-1">
                    Maintenance
                  </label>
                  <select
                    id="maintenance"
                    name="maintenance"
                    value={formData.maintenance}
                    onChange={handleInputChange}
                    className="w-full p-4 bg-rhozly-surface-low rounded-2xl font-bold text-base outline-none border border-transparent focus:ring-2 focus:ring-green-500/20 transition-all"
                  >
                    <option>Low (Set & Forget)</option>
                    <option>Average (Weekly)</option>
                    <option>High (Daily Tinkering)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="considerations" className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 ml-1 flex items-center gap-1">
                  <ShieldAlert size={12} /> Special Considerations
                </label>
                <input
                  id="considerations"
                  name="considerations"
                  value={formData.considerations}
                  onChange={handleInputChange}
                  placeholder="e.g., Must be Dog Safe, Drought Tolerant"
                  className="w-full p-4 bg-rhozly-surface-low rounded-2xl outline-none font-bold text-base focus:ring-2 focus:ring-amber-500/20 border border-transparent transition-all"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-5 sm:p-6 border-t border-rhozly-outline/10 flex flex-col sm:flex-row gap-3 sm:gap-4 shrink-0 bg-rhozly-surface-lowest">
          {step > 1 && (
            <button
              onClick={() => setStep(step - 1)}
              disabled={isGenerating}
              className="w-full sm:w-auto px-6 py-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-2xl font-black transition-all duration-200 hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
            >
              <ChevronLeft size={20} /> Back
            </button>
          )}

          {step < 3 ? (
            <button
              onClick={() => setStep(step + 1)}
              className="flex-1 py-4 bg-rhozly-primary hover:bg-rhozly-primary/90 text-white rounded-2xl font-black shadow-lg transition-all duration-200 hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
            >
              Next Step <ChevronRight size={20} />
            </button>
          ) : (
            <button
              onClick={handleGeneratePlan}
              disabled={isGenerating}
              className="flex-1 py-4 bg-rhozly-primary hover:bg-rhozly-primary/90 disabled:bg-rhozly-primary/70 text-white rounded-2xl font-black shadow-lg transition-all duration-200 hover:scale-105 active:scale-95 disabled:scale-100 flex items-center justify-center gap-2"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="animate-spin" size={20} /> Architecting
                  Plan...
                </>
              ) : (
                <>
                  <Sparkles size={20} /> Generate Blueprint
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
