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

interface NewPlanFormProps {
  homeId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function NewPlanForm({
  homeId,
  onClose,
  onSuccess,
}: NewPlanFormProps) {
  const [step, setStep] = useState(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [existingAreas, setExistingAreas] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    planName: "",
    description: "",
    aesthetic: "Natural",
    timeline: "Start Immediately",
    targetArea: "new",
    locationSize: "",
    sunlight: "Full Sun",
    medium: "Standard Soil",
    inclusivePlants: "",
    exclusivePlants: "",
    wildlife: "",
    difficulty: "Beginner",
    maintenance: "Low",
    considerations: "",
  });

  // 🚀 FIXED: Lock background scrolling when modal is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "unset";
    };
  }, []);

  useEffect(() => {
    const fetchAreas = async () => {
      // 🚀 FIXED: Correctly querying areas through locations for the dropdown
      const { data } = await supabase
        .from("areas")
        .select("id, name, locations!inner(home_id)")
        .eq("locations.home_id", homeId);
      if (data) setExistingAreas(data);
    };
    fetchAreas();
  }, [homeId]);

  const handleInputChange = (e: any) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleGeneratePlan = async () => {
    if (!formData.planName || !formData.description) {
      return toast.error("Please provide a name and description.");
    }

    setIsGenerating(true);
    const toastId = toast.loading("The AI Architect is designing your plan...");

    try {
      const { data, error } = await supabase.functions.invoke(
        "generate-landscape-plan",
        {
          body: { formData, homeId },
        },
      );

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const { error: insertError } = await supabase.from("plans").insert({
        home_id: homeId,
        name: formData.planName,
        description: formData.description,
        status: "Draft",
        ai_blueprint: data.blueprint,
        cover_image_url: data.cover_image_url,
      });

      if (insertError) throw insertError;

      toast.success("Blueprint Generated Successfully!", { id: toastId });
      onSuccess();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to generate plan.", { id: toastId });
    } finally {
      setIsGenerating(false);
    }
  };

  // 🚀 FIXED: Added safety check for server-side rendering
  if (typeof document === "undefined") return null;

  // 🚀 FIXED: Portaled to document.body, improved mobile padding and max-width constraints
  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 sm:p-6 bg-rhozly-bg/95 backdrop-blur-sm animate-in fade-in zoom-in-95">
      <div
        className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl border border-rhozly-outline/10 flex flex-col max-h-[100dvh] sm:max-h-[90vh] overflow-hidden relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-rhozly-outline/10 flex justify-between items-center bg-rhozly-surface-lowest shrink-0">
          <div>
            <h2 className="text-xl sm:text-2xl font-black flex items-center gap-2 text-rhozly-on-surface">
              <Sparkles className="text-rhozly-primary shrink-0" size={24} />
              <span className="truncate">New Project</span>
            </h2>
            <p className="text-[10px] sm:text-xs font-bold text-rhozly-on-surface/50 uppercase tracking-widest mt-1">
              Step {step} of 3
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isGenerating}
            className="p-2.5 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors shrink-0 ml-2"
          >
            <X size={20} className="text-gray-600" />
          </button>
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
                <label className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 ml-1">
                  Project Name *
                </label>
                <input
                  name="planName"
                  value={formData.planName}
                  onChange={handleInputChange}
                  placeholder="e.g., Wildlife Balcony Pond"
                  className="w-full p-4 bg-rhozly-surface-low rounded-2xl outline-none font-bold focus:ring-2 focus:ring-rhozly-primary/20 border border-transparent transition-all"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 ml-1">
                  Brief Description *
                </label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  rows={3}
                  placeholder="What are we building? Who is it for?"
                  className="w-full p-4 bg-rhozly-surface-low rounded-2xl outline-none font-bold resize-none focus:ring-2 focus:ring-rhozly-primary/20 border border-transparent transition-all"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 ml-1">
                    Aesthetic
                  </label>
                  <select
                    name="aesthetic"
                    value={formData.aesthetic}
                    onChange={handleInputChange}
                    className="w-full p-4 bg-rhozly-surface-low rounded-2xl font-bold outline-none border border-transparent focus:ring-2 focus:ring-rhozly-primary/20 transition-all"
                  >
                    <option>Natural / Wild</option>
                    <option>Modern Minimalist</option>
                    <option>Cottage Garden</option>
                    <option>Tropical</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 ml-1">
                    Timeline
                  </label>
                  <select
                    name="timeline"
                    value={formData.timeline}
                    onChange={handleInputChange}
                    className="w-full p-4 bg-rhozly-surface-low rounded-2xl font-bold outline-none border border-transparent focus:ring-2 focus:ring-rhozly-primary/20 transition-all"
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

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 ml-1">
                  Target Area
                </label>
                <select
                  name="targetArea"
                  value={formData.targetArea}
                  onChange={handleInputChange}
                  className="w-full p-4 bg-rhozly-surface-low rounded-2xl font-bold outline-none border border-transparent focus:ring-2 focus:ring-blue-500/20 transition-all"
                >
                  <option value="new">✨ Create New Area</option>
                  {existingAreas.map((a) => (
                    <option key={a.id} value={a.name}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>

              {formData.targetArea === "new" && (
                <>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 ml-1">
                      Estimated Size *
                    </label>
                    <input
                      name="locationSize"
                      value={formData.locationSize}
                      onChange={handleInputChange}
                      placeholder="e.g., 10ft x 10ft, or 'A small windowsill'"
                      className="w-full p-4 bg-rhozly-surface-low rounded-2xl outline-none font-bold focus:ring-2 focus:ring-blue-500/20 border border-transparent transition-all"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 ml-1">
                        Sunlight
                      </label>
                      <select
                        name="sunlight"
                        value={formData.sunlight}
                        onChange={handleInputChange}
                        className="w-full p-4 bg-rhozly-surface-low rounded-2xl font-bold outline-none border border-transparent focus:ring-2 focus:ring-blue-500/20 transition-all"
                      >
                        <option>Full Sun</option>
                        <option>Part Shade</option>
                        <option>Full Shade</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 ml-1">
                        Medium
                      </label>
                      <select
                        name="medium"
                        value={formData.medium}
                        onChange={handleInputChange}
                        className="w-full p-4 bg-rhozly-surface-low rounded-2xl font-bold outline-none border border-transparent focus:ring-2 focus:ring-blue-500/20 transition-all"
                      >
                        <option>Standard Soil</option>
                        <option>Raised Bed Mix</option>
                        <option>Aquatic / Water</option>
                        <option>Pots / Containers</option>
                      </select>
                    </div>
                  </div>
                </>
              )}
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
                  <label className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 ml-1">
                    Must Include
                  </label>
                  <input
                    name="inclusivePlants"
                    value={formData.inclusivePlants}
                    onChange={handleInputChange}
                    placeholder="e.g., Lavender, Ferns"
                    className="w-full p-4 bg-rhozly-surface-low rounded-2xl outline-none font-bold text-sm focus:ring-2 focus:ring-green-500/20 border border-transparent transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 ml-1">
                    Do NOT Include
                  </label>
                  <input
                    name="exclusivePlants"
                    value={formData.exclusivePlants}
                    onChange={handleInputChange}
                    placeholder="e.g., Mint, Ivy"
                    className="w-full p-4 bg-rhozly-surface-low rounded-2xl outline-none font-bold text-sm focus:ring-2 focus:ring-red-500/20 border border-transparent transition-all"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 ml-1">
                  Wildlife Goals
                </label>
                <input
                  name="wildlife"
                  value={formData.wildlife}
                  onChange={handleInputChange}
                  placeholder="e.g., Attract Bees, Frogs"
                  className="w-full p-4 bg-rhozly-surface-low rounded-2xl outline-none font-bold focus:ring-2 focus:ring-green-500/20 border border-transparent transition-all"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 ml-1">
                    Difficulty
                  </label>
                  <select
                    name="difficulty"
                    value={formData.difficulty}
                    onChange={handleInputChange}
                    className="w-full p-4 bg-rhozly-surface-low rounded-2xl font-bold outline-none border border-transparent focus:ring-2 focus:ring-green-500/20 transition-all"
                  >
                    <option>Beginner</option>
                    <option>Intermediate</option>
                    <option>Expert</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 ml-1">
                    Maintenance
                  </label>
                  <select
                    name="maintenance"
                    value={formData.maintenance}
                    onChange={handleInputChange}
                    className="w-full p-4 bg-rhozly-surface-low rounded-2xl font-bold outline-none border border-transparent focus:ring-2 focus:ring-green-500/20 transition-all"
                  >
                    <option>Low (Set & Forget)</option>
                    <option>Average (Weekly)</option>
                    <option>High (Daily Tinkering)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 ml-1 flex items-center gap-1">
                  <ShieldAlert size={12} /> Special Considerations
                </label>
                <input
                  name="considerations"
                  value={formData.considerations}
                  onChange={handleInputChange}
                  placeholder="e.g., Must be Dog Safe, Drought Tolerant"
                  className="w-full p-4 bg-rhozly-surface-low rounded-2xl outline-none font-bold focus:ring-2 focus:ring-amber-500/20 border border-transparent transition-all"
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
              className="w-full sm:w-auto px-6 py-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-2xl font-black transition-colors flex items-center justify-center gap-2"
            >
              <ChevronLeft size={20} /> Back
            </button>
          )}

          {step < 3 ? (
            <button
              onClick={() => setStep(step + 1)}
              className="flex-1 py-4 bg-rhozly-primary hover:bg-rhozly-primary/90 text-white rounded-2xl font-black shadow-lg transition-colors flex items-center justify-center gap-2"
            >
              Next Step <ChevronRight size={20} />
            </button>
          ) : (
            <button
              onClick={handleGeneratePlan}
              disabled={isGenerating}
              className="flex-1 py-4 bg-rhozly-primary hover:bg-rhozly-primary/90 text-white rounded-2xl font-black shadow-lg transition-all active:scale-[0.98] flex items-center justify-center gap-2"
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
