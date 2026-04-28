import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  X,
  MapPin,
  Hash,
  Sprout,
  Calendar,
  Check,
  Loader2,
  Info,
  Navigation,
  Sparkles,
  BrainCircuit,
  CloudSun,
} from "lucide-react";
import toast from "react-hot-toast";
import { supabase } from "../lib/supabase";
import { usePlantDoctor } from "../context/PlantDoctorContext";
import { AutomationEngine } from "../lib/automationEngine"; // 🚀 IMPORT THE ENGINE

interface PlantAssignmentModalProps {
  plant: any;
  locations: any[];
  onAssign: (data: any) => Promise<void>; // 🚀 Made this async so we can await it
  onClose: () => void;
  isAssigning: boolean;
  homeId: string;
}

const GROWTH_STATES = [
  "Germination",
  "Seedling",
  "Vegetative",
  "Budding/Pre-Flowering",
  "Flowering/Bloom",
  "Fruiting/Pollination",
  "Ripening/Maturity",
  "Senescence",
];

const PROPAGATION_OPTIONS = [
  "Seed",
  "Cuttings",
  "Division",
  "Layering",
  "Grafting",
];

export default function PlantAssignmentModal({
  plant,
  locations,
  onAssign,
  onClose,
  isAssigning,
  homeId,
}: PlantAssignmentModalProps) {
  const { setPageContext } = usePlantDoctor();

  const [step, setStep] = useState<1 | 2>(1);
  const [selectedLoc, setSelectedLoc] = useState("");

  const [formData, setFormData] = useState({
    areaId: "",
    quantity: 1,
    isPlanted: false,
    plantedDate: new Date().toISOString().split("T")[0],
    isEstablished: false,
    growthState: "Vegetative",
  });

  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<any>(null);
  const [selectedSchedules, setSelectedSchedules] = useState<string[]>([]);
  const [isProcessingLocal, setIsProcessingLocal] = useState(false); // Local loading state for the engine
  const [isStepTransitioning, setIsStepTransitioning] = useState(false); // Loading state for step transitions
  const [focusedScheduleIndex, setFocusedScheduleIndex] = useState(0); // For roving tabindex

  const availableAreas = selectedLoc
    ? locations.find((l) => l.id === selectedLoc)?.areas || []
    : [];

  useEffect(() => {
    const locObj = locations.find((l) => l.id === selectedLoc);
    const areaObj = availableAreas.find((a: any) => a.id === formData.areaId);

    setPageContext({
      action: "Assigning Plant to Garden",
      currentStep: step,
      plantSpecies: plant.common_name,
      assignmentDetails: {
        location: locObj?.name || "Unselected",
        area: areaObj?.name || "Unselected",
        quantity: formData.quantity,
        isAlreadyPlanted: formData.isPlanted,
        growthState: formData.growthState,
        isEstablished: formData.isEstablished,
      },
      smartScheduleContext: aiResult
        ? {
            assessment: aiResult.personalized_assessment,
            suggestedMethods: aiResult.schedules?.map((s: any) => s.method),
            userSelectedMethods: selectedSchedules,
          }
        : null,
    });

    return () => setPageContext(null);
  }, [
    step,
    selectedLoc,
    formData,
    aiResult,
    selectedSchedules,
    plant.common_name,
    locations,
    availableAreas,
    setPageContext,
  ]);

  useEffect(() => {
    setFocusedScheduleIndex(0);
  }, [aiResult]);

  const handleNext = () => {
    if (!formData.areaId) return;
    setIsStepTransitioning(true);
    setTimeout(() => {
      setStep(2);
      setIsStepTransitioning(false);
    }, 300);
  };

  const handleSmartSchedule = async () => {
    setIsAiLoading(true);

    try {
      const { data: cacheRecord } = await supabase
        .from("ai_schedule_cache")
        .select("schedule_data, updated_at")
        .eq("plant_id", plant.id)
        .eq("area_id", formData.areaId)
        .maybeSingle();

      let priorSchedule: any = null;
      if (cacheRecord) {
        const cacheAgeMs =
          new Date().getTime() - new Date(cacheRecord.updated_at).getTime();
        const hoursOld = cacheAgeMs / (1000 * 60 * 60);

        if (hoursOld < 24) {
          setAiResult(cacheRecord.schedule_data);
          if (cacheRecord.schedule_data.schedules?.length > 0) {
            setSelectedSchedules([
              cacheRecord.schedule_data.schedules[0].method,
            ]);
          }
          toast.success("Loaded saved smart schedule!");
          setIsAiLoading(false);
          return;
        }
        // Stale cache — pass to edge function so AI can refine rather than start cold
        priorSchedule = cacheRecord.schedule_data;
      }

      const { data: homeData, error: homeError } = await supabase
        .from("homes")
        .select("address")
        .eq("id", homeId)
        .single();

      if (homeError || !homeData?.address) {
        toast.error("Please set your Home's postcode in settings first!");
        setIsAiLoading(false);
        return;
      }

      const selectedAreaObj = availableAreas.find(
        (a: any) => a.id === formData.areaId,
      );

      const { data: aiData, error } = await supabase.functions.invoke(
        "smart-plant-scheduler",
        {
          body: {
            plantName: plant.common_name,
            areaDetails: selectedAreaObj,
            address: homeData.address,
            availableMethods: plant.propagation?.length > 0 ? plant.propagation : PROPAGATION_OPTIONS,
            homeId,
            priorSchedule,
          },
        },
      );

      if (error) {
        const realError = await error.context?.json().catch(() => null);
        throw new Error(realError?.error || error.message);
      }

      const viableSchedules =
        aiData.schedules?.filter((s: any) => s.is_viable) || [];
      aiData.schedules = viableSchedules;

      await supabase.from("ai_schedule_cache").upsert(
        {
          plant_id: plant.id,
          area_id: formData.areaId,
          schedule_data: aiData,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "plant_id, area_id" },
      );

      setAiResult(aiData);

      if (viableSchedules.length > 0) {
        setSelectedSchedules([viableSchedules[0].method]);
      }

      toast.success("AI generated a fresh planting schedule!");
    } catch (error: any) {
      console.error("AI Schedule Error:", error);
      toast.error(`Failed: ${error.message}`);
    } finally {
      setIsAiLoading(false);
    }
  };

  const toggleScheduleSelection = (method: string) => {
    setSelectedSchedules((prev) =>
      prev.includes(method)
        ? prev.filter((m) => m !== method)
        : [...prev, method],
    );
  };

  const handleSubmit = async () => {
    setIsProcessingLocal(true);
    try {
      const finalSchedules =
        aiResult?.schedules?.filter((s: any) =>
          selectedSchedules.includes(s.method),
        ) || [];

      const createdItems = await onAssign({
        ...formData,
        status: formData.isPlanted ? "Planted" : "Unplanted",
        smartSchedules: finalSchedules,
      });

      if (formData.isPlanted && createdItems && createdItems.length > 0) {
        const baseDateStr = formData.isEstablished
          ? new Date().toISOString().split("T")[0]
          : formData.plantedDate;
        await AutomationEngine.applyPlantedAutomations(
          createdItems,
          formData.areaId,
          baseDateStr,
        );
      }

      toast.success(`${plant.common_name} assigned successfully!`);
    } catch (e: any) {
      console.error(e);
      const message = e?.message || "Something went wrong. Please try again.";
      toast.error(message, {
        duration: 6000,
        id: "assignment-error",
      });
      toast(
        (t) => (
          <span className="text-sm font-bold">
            {message}{" "}
            <button
              onClick={() => {
                toast.dismiss(t.id);
                handleSubmit();
              }}
              className="underline ml-1"
            >
              Retry
            </button>
          </span>
        ),
        { id: "assignment-retry", duration: 8000 },
      );
    } finally {
      setIsProcessingLocal(false);
    }
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-rhozly-bg/95 backdrop-blur-xl animate-in fade-in duration-300">
      <div className="bg-rhozly-surface-lowest w-full max-w-lg max-h-[90vh] overflow-y-auto custom-scrollbar rounded-3xl p-8 shadow-2xl border border-rhozly-outline/20 relative">
        <div
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
        >
          Step {step} of 2: {step === 1 ? "Select location and area" : "Planting details"}
        </div>
        <div className="flex justify-between items-start mb-8 relative z-10">
          <div>
            <h3 className="text-3xl font-black text-rhozly-on-surface">
              Assign Plant
            </h3>
            <p className="text-sm font-bold text-rhozly-primary uppercase tracking-widest mt-1">
              {plant.common_name}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close assignment modal"
            className="p-3 bg-rhozly-surface-low rounded-2xl hover:scale-110 transition-transform"
          >
            <X size={24} />
          </button>
        </div>

        {step === 1 && (
          <div className="space-y-6 animate-in slide-in-from-right-4 relative z-10">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-[10px] font-black uppercase text-rhozly-on-surface/40 ml-1">
                  <MapPin size={14} /> 1. Location
                </label>
                <select
                  value={selectedLoc}
                  onChange={(e) => {
                    setSelectedLoc(e.target.value);
                    setFormData({ ...formData, areaId: "" });
                  }}
                  className="w-full p-4 bg-rhozly-surface-low rounded-2xl font-bold border border-transparent focus:border-rhozly-primary outline-none cursor-pointer text-sm"
                >
                  <option value="">Select location...</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-3">
                <label className="flex items-center gap-2 text-[10px] font-black uppercase text-rhozly-on-surface/40 ml-1">
                  <Navigation size={14} /> 2. Area *
                </label>
                <select
                  value={formData.areaId}
                  onChange={(e) =>
                    setFormData({ ...formData, areaId: e.target.value })
                  }
                  disabled={!selectedLoc}
                  className="w-full p-4 bg-rhozly-surface-low rounded-2xl font-bold border border-transparent focus:border-rhozly-primary outline-none disabled:opacity-50 cursor-pointer text-sm"
                >
                  <option value="">
                    {selectedLoc ? "Select area..." : "Select location first"}
                  </option>
                  {availableAreas.map((area: any) => (
                    <option key={area.id} value={area.id}>
                      {area.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-3">
              <label className="flex items-center gap-2 text-[10px] font-black uppercase text-rhozly-on-surface/40 ml-1">
                <Hash size={14} /> Quantity
              </label>
              <div className="flex items-center justify-between bg-rhozly-surface-low p-2 rounded-2xl">
                <button
                  onClick={() =>
                    setFormData((p) => ({
                      ...p,
                      quantity: Math.max(1, p.quantity - 1),
                    }))
                  }
                  className="w-14 h-14 bg-white rounded-xl shadow-sm font-black text-2xl hover:bg-rhozly-primary hover:text-white transition-colors"
                >
                  -
                </button>
                <span className="text-3xl font-black font-display">
                  {formData.quantity}
                </span>
                <button
                  onClick={() =>
                    setFormData((p) => ({ ...p, quantity: p.quantity + 1 }))
                  }
                  className="w-14 h-14 bg-white rounded-xl shadow-sm font-black text-2xl hover:bg-rhozly-primary hover:text-white transition-colors"
                >
                  +
                </button>
              </div>
            </div>

            <button
              onClick={handleNext}
              disabled={!formData.areaId || isStepTransitioning}
              aria-label="Proceed to planting details"
              className="w-full py-5 mt-4 bg-rhozly-primary text-white rounded-2xl font-black text-lg shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:scale-[1.02] active:scale-95"
            >
              {isStepTransitioning ? (
                <>
                  <Loader2 className="animate-spin" size={24} /> Loading...
                </>
              ) : (
                "Next: Planting Details"
              )}
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6 animate-in slide-in-from-right-4 relative z-10">
            <div className="p-1 bg-rhozly-surface-low rounded-2xl flex">
              <button
                onClick={() => setFormData({ ...formData, isPlanted: false })}
                className={`flex-1 py-3 rounded-xl font-black text-sm transition-all ${!formData.isPlanted ? "bg-white text-rhozly-primary shadow-sm" : "text-rhozly-on-surface/40 hover:text-rhozly-on-surface"}`}
              >
                Unplanted (In Shed)
              </button>
              <button
                onClick={() => {
                  setFormData({ ...formData, isPlanted: true });
                  setAiResult(null);
                }}
                className={`flex-1 py-3 rounded-xl font-black text-sm transition-all ${formData.isPlanted ? "bg-white text-rhozly-primary shadow-sm" : "text-rhozly-on-surface/40 hover:text-rhozly-on-surface"}`}
              >
                Already Planted
              </button>
            </div>

            {!formData.isPlanted && (
              <div className="space-y-4 animate-in fade-in zoom-in-95">
                {!aiResult ? (
                  <div className="bg-rhozly-surface-low p-6 rounded-3xl border border-rhozly-outline/10 shadow-sm text-center">
                    <CloudSun
                      className="mx-auto text-rhozly-primary mb-3"
                      size={32}
                    />
                    <h4 className="text-sm font-black text-rhozly-on-surface uppercase tracking-widest mb-2">
                      Smart Schedule
                    </h4>
                    <p className="text-xs font-bold text-rhozly-on-surface/60 mb-6 leading-relaxed">
                      Use AI and a live 14-day weather forecast to determine the
                      best propagation methods and perfect days to plant this{" "}
                      {plant.common_name}.
                    </p>
                    <button
                      onClick={handleSmartSchedule}
                      disabled={isAiLoading}
                      className="w-full py-4 bg-rhozly-primary text-white rounded-2xl font-black shadow-lg shadow-rhozly-primary/20 flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50"
                    >
                      {isAiLoading ? (
                        <>
                          <Loader2 className="animate-spin" size={20} />{" "}
                          Analyzing Area...
                        </>
                      ) : (
                        <>
                          <Sparkles size={20} /> Generate Schedule
                        </>
                      )}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="bg-rhozly-surface-lowest p-5 rounded-3xl border border-rhozly-outline/10 shadow-sm relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-1 h-full bg-rhozly-primary rounded-l-3xl" />
                      <div className="flex items-center gap-2 text-rhozly-primary mb-2">
                        <BrainCircuit size={18} />
                        <span className="text-[10px] font-black uppercase tracking-widest">
                          Site Analysis
                        </span>
                      </div>
                      <p className="text-[11px] font-bold text-rhozly-on-surface/80 leading-relaxed">
                        {aiResult.personalized_assessment}
                      </p>
                    </div>

                    <div className="space-y-3">
                      <p className="text-[10px] font-black uppercase text-rhozly-on-surface/40 ml-1">
                        Select Methods to Schedule
                      </p>
                      {aiResult.schedules.length === 0 && (
                        <p className="text-xs text-red-500 font-bold p-4 bg-red-50 rounded-xl">
                          No viable methods found for this environment.
                        </p>
                      )}
                      {aiResult.schedules.map((schedule: any, index: number) => (
                        <div
                          key={schedule.method}
                          role="option"
                          aria-selected={selectedSchedules.includes(schedule.method)}
                          tabIndex={focusedScheduleIndex === index ? 0 : -1}
                          onClick={() =>
                            toggleScheduleSelection(schedule.method)
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              toggleScheduleSelection(schedule.method);
                            } else if (e.key === "ArrowDown") {
                              e.preventDefault();
                              const nextIndex = Math.min(index + 1, aiResult.schedules.length - 1);
                              setFocusedScheduleIndex(nextIndex);
                              (e.currentTarget.nextElementSibling as HTMLElement)?.focus();
                            } else if (e.key === "ArrowUp") {
                              e.preventDefault();
                              const prevIndex = Math.max(index - 1, 0);
                              setFocusedScheduleIndex(prevIndex);
                              (e.currentTarget.previousElementSibling as HTMLElement)?.focus();
                            }
                          }}
                          onFocus={() => setFocusedScheduleIndex(index)}
                          className={`p-4 rounded-2xl border transition-all cursor-pointer flex gap-4 ${
                            selectedSchedules.includes(schedule.method)
                              ? "bg-rhozly-surface-low border-rhozly-primary/30 shadow-sm"
                              : "bg-rhozly-surface-lowest border-rhozly-outline/10 hover:border-rhozly-primary/30"
                          }`}
                        >
                          <div className="pt-1">
                            <div
                              className={`w-5 h-5 rounded flex items-center justify-center border transition-colors ${
                                selectedSchedules.includes(schedule.method)
                                  ? "bg-rhozly-primary border-rhozly-primary text-white"
                                  : "border-rhozly-outline/30 bg-rhozly-surface-lowest"
                              }`}
                            >
                              {selectedSchedules.includes(schedule.method) && (
                                <Check size={14} strokeWidth={4} />
                              )}
                            </div>
                          </div>
                          <div className="flex-1">
                            <div className="flex justify-between items-center mb-1">
                              <span className="font-black text-sm text-rhozly-on-surface">
                                {schedule.method}
                              </span>
                              <span className="text-[10px] font-bold text-rhozly-primary bg-rhozly-surface-low px-2 py-1 rounded-md">
                                {schedule.phases.length} Tasks
                              </span>
                            </div>
                            <p className="text-[10px] font-bold text-rhozly-on-surface/60 line-clamp-2 leading-relaxed mb-3">
                              {schedule.reasoning}
                            </p>

                            <div className="space-y-2 mt-2 pt-2 border-t border-rhozly-outline/10">
                              {schedule.phases.map((phase: any, i: number) => (
                                <div
                                  key={i}
                                  className="flex justify-between items-center bg-rhozly-surface-lowest/60 px-3 py-3 rounded-lg min-h-[44px]"
                                >
                                  <span className="text-[10px] font-black text-rhozly-on-surface">
                                    {phase.phase_name}
                                  </span>
                                  <span className="text-[10px] font-bold text-rhozly-primary">
                                    {phase.recommended_date}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {formData.isPlanted && (
              <div className="space-y-6 p-6 bg-rhozly-surface-low rounded-3xl animate-in zoom-in-95 border border-rhozly-outline/5">
                <div className="space-y-3">
                  <label className="flex items-center justify-between text-[10px] font-black uppercase text-rhozly-on-surface/60">
                    <div className="flex items-center gap-2">
                      <Calendar size={14} /> Date Planted
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer bg-white px-3 py-1.5 rounded-lg border border-rhozly-outline/10">
                      <input
                        type="checkbox"
                        checked={formData.isEstablished}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            isEstablished: e.target.checked,
                          })
                        }
                        className="accent-rhozly-primary"
                      />
                      <span className="text-[9px] tracking-widest text-rhozly-primary">
                        Already Established?
                      </span>
                    </label>
                  </label>
                  {!formData.isEstablished ? (
                    <input
                      type="date"
                      value={formData.plantedDate}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          plantedDate: e.target.value,
                        })
                      }
                      className="w-full p-4 bg-white rounded-xl font-bold border border-transparent focus:border-rhozly-primary outline-none"
                    />
                  ) : (
                    <div className="w-full p-4 bg-white/50 rounded-xl border border-dashed border-rhozly-outline/20 text-center opacity-60">
                      <p className="text-xs font-bold flex items-center justify-center gap-2">
                        <Info size={14} /> Date unknown
                      </p>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <label className="flex items-center gap-2 text-[10px] font-black uppercase text-rhozly-on-surface/40 ml-1">
                    <Sprout size={14} /> Current Growth State
                  </label>
                  <select
                    value={formData.growthState}
                    onChange={(e) =>
                      setFormData({ ...formData, growthState: e.target.value })
                    }
                    className="w-full p-4 bg-white rounded-xl font-bold border border-transparent focus:border-rhozly-primary outline-none cursor-pointer text-sm"
                  >
                    {GROWTH_STATES.map((state) => (
                      <option key={state} value={state}>
                        {state}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <div className="flex gap-4 pt-4">
              <button
                onClick={() => setStep(1)}
                aria-label="Go back to location selection"
                className="px-6 py-5 rounded-2xl font-black text-rhozly-on-surface/40 hover:bg-rhozly-surface-low transition-all"
              >
                Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={
                  isAssigning ||
                  isProcessingLocal ||
                  (!formData.isPlanted &&
                    aiResult &&
                    selectedSchedules.length === 0)
                }
                aria-label="Confirm plant assignment"
                className="flex-1 py-5 bg-rhozly-primary text-white rounded-2xl font-black text-lg shadow-xl shadow-rhozly-primary/20 flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
              >
                {isAssigning || isProcessingLocal ? (
                  <Loader2 className="animate-spin" size={24} />
                ) : (
                  <>
                    <Check size={24} /> Confirm Assignment
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
