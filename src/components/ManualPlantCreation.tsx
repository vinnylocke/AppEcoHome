import React, { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import { normaliseSeasons, normaliseMonths } from "../lib/plantSeasons";
import {
  ChevronDown,
  ChevronUp,
  Leaf,
  Droplets,
  ShieldAlert,
  Sparkles,
  Info,
  Save,
  Loader2,
  Check,
  Scissors,
  Calendar,
  AlertCircle,
  Camera,
  Sun,
  X,
  Tag,
  Globe,
  Pencil,
} from "lucide-react";
import toast from "react-hot-toast";
import WikiImagePicker from "./WikiImagePicker";
import PlantResultThumb from "./PlantResultThumb";
// Wave 22.0006 — hero image opens in-app lightbox (with credit overlay)
// instead of firing the file picker. Change-photo moves to a dedicated
// pencil button at the top-right of the hero.
import { Lightbox, type GalleryImage } from "./DiagnosisImageGallery";
import ImageCredit from "./credit/ImageCredit";

// 🧠 IMPORT THE AI CONTEXT
import { usePlantDoctor } from "../context/PlantDoctorContext";

interface ManualPlantCreationProps {
  initialData?: any;
  onSave?: (data: any) => void;
  onCancel?: () => void;
  isSaving?: boolean;
  submitLabel?: string;
  isReadOnly?: boolean;
  /** Disable the submit until the user actually edits a field (fork-save guard). */
  disableWhenPristine?: boolean;
  /**
   * Wave 7 (D9) — field names from `plants.updated_care_fields` that should
   * render with a yellow "Updated" highlight (the catalogue cron changed them
   * but the user hasn't acknowledged yet).
   */
  highlightedFields?: string[];
  /**
   * Wave 7 (D9) — field names from `plants.overridden_fields` that should
   * render with a purple "Custom" highlight (the user has explicitly edited
   * them away from the catalogue).
   *
   * If a field appears in both lists, "Custom" wins — it's the more
   * permanent state.
   */
  overriddenFields?: string[];
}

const SUNLIGHT_OPTIONS = [
  { value: "full sun", label: "Full Sun" },
  { value: "part sun", label: "Part Sun" },
  { value: "part shade", label: "Part Shade" },
  { value: "filtered shade", label: "Filtered Shade" },
  { value: "full shade", label: "Full Shade" },
];

const CYCLE_OPTIONS = [
  { value: "Perennial", label: "Perennial" },
  { value: "Annual", label: "Annual" },
  { value: "Biannual", label: "Biannual" },
  { value: "Herbaceous Perennial", label: "Herbaceous Perennial" },
];

const PROPAGATION_OPTIONS = [
  "Seed",
  "Bulb",
  "Cuttings",
  "Division",
  "Layering",
  "Grafting",
];
const ATTRACTS_OPTIONS = [
  "Bees",
  "Butterflies",
  "Hummingbirds",
  "Ladybugs",
  "Moths",
];
const MONTH_OPTIONS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const SEASON_OPTIONS = ["Spring", "Summer", "Autumn", "Winter", "Year-round"];

export default function ManualPlantCreation({
  initialData,
  onSave,
  onCancel,
  isSaving,
  submitLabel = "Add to Shed",
  isReadOnly = false,
  disableWhenPristine = false,
  highlightedFields,
  overriddenFields,
}: ManualPlantCreationProps) {
  // Wave 7 (D9) — fast lookup sets + helper to decide a field's highlight
  // state. Overridden wins over highlighted (custom is the more permanent
  // state). Returns { kind: "overridden" | "highlighted", className, badge }
  // or null when the field has no special state.
  const overrideSet = new Set(overriddenFields ?? []);
  const highlightSet = new Set(highlightedFields ?? []);

  function fieldStatus(field: string): { kind: "overridden" | "highlighted"; wrap: string; badge: { label: string; cls: string } } | null {
    if (overrideSet.has(field)) {
      return {
        kind: "overridden",
        wrap: "bg-purple-50/60 border-purple-200 ring-1 ring-purple-200/60",
        badge: { label: "Custom", cls: "bg-purple-100 text-purple-700" },
      };
    }
    if (highlightSet.has(field)) {
      return {
        kind: "highlighted",
        wrap: "bg-amber-50/60 border-amber-200 ring-1 ring-amber-200/60",
        badge: { label: "Updated", cls: "bg-amber-100 text-amber-700" },
      };
    }
    return null;
  }
  const { setPageContext } = usePlantDoctor();

  const [activeSection, setActiveSection] = useState<string | null>("basics");
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  // Pristine/dirty tracking (2026-07-08 — docs/plans/ai-plant-freshness-and-
  // edit-ux-overhaul.md follow-up): after a care-guide Refresh, the modal's
  // only visible action was the copy-on-write "Save as my own copy" submit —
  // one accidental click away from forking the plant off auto-updates. With
  // `disableWhenPristine`, the fork-save stays disabled until the user has
  // actually edited something. Dirty is EVENT-driven (every user mutation
  // goes through `updateForm`) — state-diffing against a baseline raced the
  // initialData sync effect and misread the sync itself as an edit.
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [savedConfirm, setSavedConfirm] = useState(false);
  const [showWikiPicker, setShowWikiPicker] = useState(false);
  // Wave 22.0006 — opens the hero image in the canonical Lightbox so the
  // user sees it full-size + the licence overlay. Edit affordance moves to
  // a dedicated pencil button.
  const [heroLightboxOpen, setHeroLightboxOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropdownContainerRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const [labelsInput, setLabelsInput] = useState("");

  const [formData, setFormData] = useState({
    common_name: "",
    scientific_name: [] as string[],
    thumbnail_url: "",
    image_url: "",
    description: "",
    plant_type: "",
    cycle: "Perennial",
    maintenance: "Low",
    growth_rate: "Medium",
    care_level: "Beginner",
    watering: "Average",
    watering_min_days: "",
    watering_max_days: "",
    sunlight: [] as string[],
    hardiness_min: "",
    hardiness_max: "",
    drought_tolerant: false,
    salt_tolerant: false,
    thorny: false,
    invasive: false,
    tropical: false,
    indoor: false,
    flowers: false,
    flowering_season: [] as string[],
    harvest_season: [] as string[],
    is_edible: false,
    leaf: true,
    edible_leaf: false,
    attracts: [] as string[],
    propagation: [] as string[],
    pruning_month: [] as string[],
    is_toxic_humans: false,
    is_toxic_pets: false,
    medicinal: false,
    cuisine: false,
    labels: [] as string[],
  });

  // Close dropdown on outside click
  useEffect(() => {
    if (!openDropdown) return;
    const handleMouseDown = (e: MouseEvent) => {
      const container = dropdownContainerRefs.current[openDropdown];
      if (container && !container.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [openDropdown]);

  useEffect(() => {
    setPageContext({
      action: isReadOnly
        ? "Viewing Plant Details"
        : "Editing/Creating a Plant Form",
      currentFormData: {
        name: formData.common_name || "Unknown Plant",
        type: formData.plant_type,
        lifecycle: formData.cycle,
        sunlightRequirements: formData.sunlight,
        floweringSeasons: formData.flowering_season,
        harvestSeasons: formData.harvest_season,
        isIndoor: formData.indoor,
        isEdible: formData.is_edible,
      },
    });
    return () => setPageContext(null);
  }, [formData, isReadOnly, setPageContext]);

  useEffect(() => {
    if (initialData) {
      const safeSunlight = Array.isArray(initialData.sunlight)
        ? initialData.sunlight.map((s: string) => s.toLowerCase())
        : [];

      const safeCycle = initialData.cycle
        ? initialData.cycle.charAt(0).toUpperCase() + initialData.cycle.slice(1)
        : formData.cycle;

      // Season/month values arrive in three shapes (array, comma-joined string,
      // or a single string) from different catalogue paths, and sometimes carry
      // American "fall" or mixed casing. Normalise so the MultiSelect renders
      // one canonical chip per value. See src/lib/plantSeasons.ts.
      const safeFlowering = normaliseSeasons(initialData.flowering_season);
      const safeHarvest = normaliseSeasons(initialData.harvest_season);
      const safePruning = normaliseMonths(initialData.pruning_month);

      setFormData((prev) => ({
        ...prev,
        ...initialData,
        cycle: safeCycle,
        sunlight: safeSunlight.length > 0 ? safeSunlight : prev.sunlight,
        flowering_season: safeFlowering,
        harvest_season: safeHarvest,
        pruning_month: safePruning,
        watering_min_days: initialData.watering_min_days?.toString() || "",
        watering_max_days: initialData.watering_max_days?.toString() || "",
        labels: Array.isArray(initialData.labels) ? initialData.labels : [],
      }));
      // The state produced by this sync is "unchanged" — only subsequent
      // user edits (via updateForm) count as dirty.
      setDirty(false);
    }
  }, [initialData]);

  /** Every USER-driven form mutation goes through this — programmatic syncs
   *  call setFormData directly and stay pristine. */
  const updateForm: typeof setFormData = (updater) => {
    setDirty(true);
    setFormData(updater);
  };

  const handleInputChange = (e: any) => {
    if (isReadOnly) return;
    const { name, value, type, checked } = e.target;
    if (name === "common_name" && errors.common_name) {
      setErrors((prev) => ({ ...prev, common_name: "" }));
    }
    updateForm((prev) => {
      const updated = {
        ...prev,
        [name]: type === "checkbox" ? checked : value,
      };

      // Validate watering min/max relationship inline
      if (name === "watering_min_days" || name === "watering_max_days") {
        const minVal = name === "watering_min_days" ? value : prev.watering_min_days;
        const maxVal = name === "watering_max_days" ? value : prev.watering_max_days;
        const minNum = parseInt(minVal);
        const maxNum = parseInt(maxVal);
        if (!isNaN(minNum) && !isNaN(maxNum) && minNum > maxNum) {
          setErrors((e) => ({ ...e, watering_range: "Min must be less than or equal to Max" }));
        } else {
          setErrors((e) => {
            const next = { ...e };
            delete next.watering_range;
            return next;
          });
        }
      }

      return updated;
    });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isReadOnly) return;
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      return toast.error("Image must be under 5MB");
    }

    setUploading(true);
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `plant-photos/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("plant-images")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("plant-images").getPublicUrl(filePath);

      updateForm((prev) => ({ ...prev, thumbnail_url: publicUrl }));
      toast.success("Image uploaded!");
    } catch (err: any) {
      toast.error("Failed to upload image.");
    } finally {
      setUploading(false);
    }
  };

  const toggleArrayItem = (field: keyof typeof formData, value: string) => {
    if (isReadOnly) return;
    updateForm((prev) => {
      const current = (prev[field] as string[]) || [];
      return {
        ...prev,
        [field]: current.includes(value)
          ? current.filter((i) => i !== value)
          : [...current, value],
      };
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly || !onSave) return;

    if (!formData.common_name.trim()) {
      setErrors({ common_name: "Required" });
      setActiveSection("basics");
      toast.error("Plant name is mandatory");
      return;
    }

    const min = parseInt(formData.watering_min_days);
    const max = parseInt(formData.watering_max_days);

    if (!isNaN(min) && !isNaN(max) && min > max) {
      setErrors((prev) => ({ ...prev, watering_range: "Min must be less than or equal to Max" }));
      setActiveSection("care");
      toast.error("Watering minimum must not exceed maximum");
      return;
    }

    const ensureArray = (val: any) =>
      Array.isArray(val) ? val : val ? [val] : [];

    // 🚀 THE FIX: We must strip out extraneous form states (like hardiness_min, leaf, etc)
    // and send ONLY the exact columns the Supabase 'plants' table expects.
    const cleanPayload = {
      common_name: formData.common_name,
      scientific_name: ensureArray(formData.scientific_name),
      description: formData.description || null,
      plant_type: formData.plant_type || null,
      cycle: formData.cycle || "Perennial",
      care_level: formData.care_level || "Beginner",
      growth_rate: formData.growth_rate || "Medium",
      maintenance: formData.maintenance || "Low",
      watering_min_days: isNaN(min) ? null : min,
      watering_max_days: isNaN(max) ? null : max,
      sunlight: ensureArray(formData.sunlight),
      flowering_season: ensureArray(formData.flowering_season),
      harvest_season: ensureArray(formData.harvest_season),
      pruning_month: ensureArray(formData.pruning_month),
      propagation: ensureArray(formData.propagation),
      attracts: ensureArray(formData.attracts),
      is_toxic_humans: formData.is_toxic_humans || false,
      is_toxic_pets: formData.is_toxic_pets || false,
      indoor: formData.indoor || false,
      is_edible: formData.is_edible || false,
      drought_tolerant: formData.drought_tolerant || false,
      tropical: formData.tropical || false,
      medicinal: formData.medicinal || false,
      cuisine: formData.cuisine || false,
      thumbnail_url: formData.thumbnail_url || formData.image_url || "",
      labels: formData.labels,
    };

    onSave(cleanPayload);

    // Show brief "Saved" confirmation on the submit button
    setSavedConfirm(true);
    setTimeout(() => setSavedConfirm(false), 2000);
  };

  const MultiSelect = ({ label, field, options, icon: Icon }: any) => {
    const status = fieldStatus(field);
    return (
    <div
      className={`space-y-2 relative ${status ? `rounded-2xl border p-3 ${status.wrap}` : ""}`}
      data-field={field}
      data-field-status={status?.kind ?? undefined}
      ref={(el) => { dropdownContainerRefs.current[field] = el; }}
    >
      <label className="text-[10px] font-black uppercase text-rhozly-on-surface/40 ml-1 flex items-center gap-2">
        {Icon && <Icon size={12} />} {label}
        {status && (
          <span
            data-testid={`form-field-${status.kind}-${field}`}
            className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md ${status.badge.cls}`}
          >
            {status.badge.label}
          </span>
        )}
      </label>
      <button
        type="button"
        disabled={isReadOnly}
        onClick={() => setOpenDropdown(openDropdown === field ? null : field)}
        className={`w-full p-4 bg-rhozly-surface-low rounded-2xl border border-rhozly-outline/10 flex items-center justify-between font-bold text-sm ${isReadOnly ? "opacity-80 cursor-default" : ""}`}
      >
        <div className="flex flex-wrap gap-1">
          {(formData[field as keyof typeof formData] as string[])?.length >
          0 ? (
            (formData[field as keyof typeof formData] as string[]).map(
              (val) => (
                <span
                  key={val}
                  className="bg-rhozly-primary text-white text-[9px] px-2 py-0.5 rounded-lg uppercase tracking-tighter"
                >
                  {val}
                </span>
              ),
            )
          ) : (
            <span className="opacity-40 italic">Select...</span>
          )}
        </div>
        {!isReadOnly && (
          <ChevronDown
            className={`transition-transform ${openDropdown === field ? "rotate-180" : ""}`}
            size={16}
          />
        )}
      </button>
      {openDropdown === field && !isReadOnly && (
        <div className="absolute z-50 w-full mt-2 bg-white rounded-2xl shadow-2xl border border-rhozly-outline/10 overflow-hidden py-1 max-h-60 overflow-y-auto">
          {options.map((opt: any) => {
            const val = typeof opt === "string" ? opt : opt.value;
            const label = typeof opt === "string" ? opt : opt.label;
            const isSelected = (
              formData[field as keyof typeof formData] as string[]
            )?.includes(val);
            return (
              <button
                key={val}
                type="button"
                onClick={() => toggleArrayItem(field as any, val)}
                className="w-full flex items-center justify-between p-4 hover:bg-rhozly-primary/5 transition-colors"
              >
                <span
                  className={`text-sm font-bold ${isSelected ? "text-rhozly-primary" : "text-rhozly-on-surface/60"}`}
                >
                  {label}
                </span>
                {isSelected && (
                  <Check size={16} className="text-rhozly-primary" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
    );
  };

  const SectionHeader = ({ id, title, icon: Icon }: any) => {
    const hasError = id === "basics" && errors.common_name;
    return (
      <button
        type="button"
        onClick={() => setActiveSection(activeSection === id ? null : id)}
        className={`w-full flex items-center justify-between p-5 rounded-2xl transition-all ${activeSection === id ? "bg-rhozly-primary text-white shadow-lg" : hasError ? "bg-red-50 text-red-500 border border-red-200" : "bg-rhozly-surface-low text-rhozly-on-surface hover:bg-rhozly-surface-mid"}`}
      >
        <div className="flex items-center gap-3">
          <Icon size={20} />
          <span className="font-black uppercase tracking-widest text-xs">
            {title}
          </span>
          {hasError && <AlertCircle size={14} className="animate-pulse" />}
        </div>
        {activeSection === id ? (
          <ChevronUp size={20} />
        ) : (
          <ChevronDown size={20} />
        )}
      </button>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* IDENTITY SECTION */}
        <div className="space-y-4">
          <SectionHeader id="basics" title="Identity & Basics" icon={Info} />
          {activeSection === "basics" && (() => {
            // Wave 22.0006 — split the hero behaviour:
            //   • Image present (read-only OR edit) → tap opens the Lightbox.
            //   • Edit mode + image present       → small pencil button at
            //                                       top-right fires the file
            //                                       picker; the tile-wide
            //                                       "Change Photo" overlay
            //                                       is gone.
            //   • Edit mode + no image            → tap opens the file picker
            //                                       (the empty-state pattern
            //                                       is unchanged).
            const heroUrl: string | null = formData.thumbnail_url || formData.image_url || null;
            const heroCredit = (initialData as any)?.image_credit ?? (formData as any)?.image_credit ?? null;
            const heroHasImage = !!heroUrl;
            const heroLightboxImages: GalleryImage[] = heroHasImage ? [{
              id: "hero",
              thumb_url: heroUrl!,
              full_url: heroUrl!,
              alt: formData.common_name || "Plant",
              source: "stored",
              image_credit: heroCredit ?? undefined,
            }] : [];
            const onHeroClick = () => {
              if (heroHasImage) setHeroLightboxOpen(true);
              else if (!isReadOnly) fileInputRef.current?.click();
            };
            return (
            <div className="p-2 space-y-6 animate-in slide-in-from-top-2">
              <div className="flex flex-col items-center justify-center gap-4">
                <div
                  onClick={onHeroClick}
                  className={`relative w-40 h-40 rounded-[2.5rem] bg-rhozly-surface-low border-2 border-dashed border-rhozly-outline/20 overflow-hidden group transition-all ${heroHasImage || !isReadOnly ? "cursor-pointer hover:border-rhozly-primary/40" : ""}`}
                  aria-label={heroHasImage ? "Open photo full-size" : "Add a photo"}
                >
                  {isReadOnly ? (
                    <div className="w-full h-full flex items-center justify-center text-rhozly-on-surface/30">
                      <PlantResultThumb
                        name={formData.common_name || "plant"}
                        url={heroUrl}
                        iconSize={32}
                        credit={heroCredit}
                      />
                    </div>
                  ) : heroHasImage ? (
                    <>
                      <img
                        src={heroUrl!}
                        className="w-full h-full object-cover"
                        alt={formData.common_name || "Plant"}
                      />
                      {/* Wave 22.0006 — pencil button. Stops propagation so
                          tapping it doesn't also open the Lightbox. */}
                      <button
                        type="button"
                        data-testid="plant-hero-change-photo"
                        onClick={(e) => {
                          e.stopPropagation();
                          fileInputRef.current?.click();
                        }}
                        aria-label="Change photo"
                        title="Change photo"
                        className="absolute top-2 right-2 w-9 h-9 min-w-[36px] min-h-[36px] rounded-full bg-white/90 backdrop-blur shadow-md text-rhozly-on-surface/70 hover:text-rhozly-primary hover:bg-white flex items-center justify-center transition-colors"
                      >
                        <Pencil size={14} />
                      </button>
                      {heroCredit && (
                        <div className="absolute bottom-2 left-2" onClick={(e) => e.stopPropagation()}>
                          <ImageCredit credit={heroCredit} variant="badge-only" />
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-rhozly-on-surface/30">
                      {uploading ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <Camera size={32} />
                      )}
                      <span className="text-[10px] font-black uppercase mt-2">
                        Add Photo
                      </span>
                    </div>
                  )}
                </div>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImageUpload}
                  accept="image/*"
                  className="hidden"
                />
                {!isReadOnly && (
                  <button
                    type="button"
                    data-testid="wiki-image-search-btn"
                    onClick={() => setShowWikiPicker(true)}
                    className="flex items-center gap-1.5 text-[11px] font-black text-rhozly-on-surface/40 hover:text-rhozly-primary transition-colors"
                  >
                    <Globe size={13} />
                    Search Wikipedia
                  </button>
                )}
              </div>

              {showWikiPicker && (
                <WikiImagePicker
                  plantName={formData.common_name || "plant"}
                  onSelect={(url) => {
                    updateForm((prev) => ({ ...prev, thumbnail_url: url }));
                    setShowWikiPicker(false);
                    toast.success("Image set from Wikipedia!");
                  }}
                  onClose={() => setShowWikiPicker(false)}
                />
              )}

              <div className="space-y-2">
                <div className="flex justify-between items-end px-1">
                  <label
                    htmlFor="common_name_input"
                    className={`text-[10px] font-black uppercase ${errors.common_name ? "text-red-500" : "text-rhozly-on-surface/40"}`}
                  >
                    Common Name *
                  </label>
                  {errors.common_name && (
                    <span className="text-[9px] font-bold text-red-500 uppercase tracking-tighter">
                      Mandatory Field
                    </span>
                  )}
                </div>
                <input
                  id="common_name_input"
                  data-testid="plant-common-name-input"
                  name="common_name"
                  value={formData.common_name}
                  onChange={handleInputChange}
                  disabled={isReadOnly}
                  placeholder="e.g. Ground Plum"
                  className={`w-full p-4 rounded-2xl outline-none border transition-all font-bold ${errors.common_name ? "bg-red-50 border-red-300" : "bg-rhozly-surface-low border-rhozly-outline/10 focus:border-rhozly-primary/30"} ${isReadOnly ? "opacity-80" : ""}`}
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-rhozly-on-surface/40 ml-1">
                  Description
                </label>
                <textarea
                  name="description"
                  rows={3}
                  value={formData.description || ""}
                  onChange={handleInputChange}
                  disabled={isReadOnly}
                  className={`w-full p-4 bg-rhozly-surface-low rounded-2xl outline-none border border-rhozly-outline/10 font-bold resize-none ${isReadOnly ? "opacity-80" : ""}`}
                />
              </div>

              {!isReadOnly && (
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-rhozly-on-surface/40 ml-1 flex items-center gap-2">
                    <Tag size={12} /> Guide Labels
                  </label>
                  <div
                    data-testid="plant-labels-input"
                    className="p-3 bg-rhozly-surface-low rounded-2xl border border-rhozly-outline/10 min-h-[52px]"
                  >
                    {(formData.labels as string[]).length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {(formData.labels as string[]).map((lbl) => (
                          <span
                            key={lbl}
                            data-testid={`plant-label-chip-${lbl}`}
                            className="flex items-center gap-1 bg-rhozly-primary/10 text-rhozly-primary text-[10px] font-black px-2.5 py-1 rounded-lg"
                          >
                            {lbl}
                            <button
                              type="button"
                              onClick={() =>
                                updateForm((prev) => ({
                                  ...prev,
                                  labels: (prev.labels as string[]).filter(
                                    (l) => l !== lbl,
                                  ),
                                }))
                              }
                              aria-label={`Remove label ${lbl}`}
                              className="hover:opacity-60 transition-opacity"
                            >
                              <X size={10} />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    <input
                      type="text"
                      value={labelsInput}
                      onChange={(e) => setLabelsInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === ",") {
                          e.preventDefault();
                          const val = labelsInput.trim().replace(/,$/, "");
                          if (
                            val &&
                            !(formData.labels as string[]).includes(val)
                          ) {
                            updateForm((prev) => ({
                              ...prev,
                              labels: [...(prev.labels as string[]), val],
                            }));
                          }
                          setLabelsInput("");
                        }
                        if (
                          e.key === "Backspace" &&
                          !labelsInput &&
                          (formData.labels as string[]).length > 0
                        ) {
                          updateForm((prev) => ({
                            ...prev,
                            labels: (prev.labels as string[]).slice(0, -1),
                          }));
                        }
                      }}
                      onBlur={() => {
                        const val = labelsInput.trim().replace(/,$/, "");
                        if (
                          val &&
                          !(formData.labels as string[]).includes(val)
                        ) {
                          updateForm((prev) => ({
                            ...prev,
                            labels: [...(prev.labels as string[]), val],
                          }));
                        }
                        setLabelsInput("");
                      }}
                      placeholder={
                        (formData.labels as string[]).length === 0
                          ? "Type a label and press Enter..."
                          : "Add another label..."
                      }
                      className="w-full text-sm font-bold bg-transparent outline-none placeholder:opacity-30 placeholder:font-normal"
                    />
                  </div>
                  <p className="text-[10px] font-bold text-rhozly-on-surface/30 ml-1">
                    Labels link this plant to relevant guides (e.g. Vegetable, Pruning).
                  </p>
                </div>
              )}

              {/* Wave 22.0006 — in-app lightbox for the hero photo. */}
              {heroLightboxOpen && heroLightboxImages.length > 0 && (
                <Lightbox
                  images={heroLightboxImages}
                  startIndex={0}
                  onClose={() => setHeroLightboxOpen(false)}
                />
              )}
            </div>
          );
          })()}
        </div>

        {/* GROWTH SECTION */}
        <div className="space-y-4">
          <SectionHeader
            id="growth"
            title="Growth & Classification"
            icon={Leaf}
          />
          {activeSection === "growth" && (
            <div className="p-2 grid grid-cols-1 sm:grid-cols-2 gap-4 animate-in slide-in-from-top-2">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-rhozly-on-surface/40 ml-1">
                  Cycle
                </label>
                <select
                  name="cycle"
                  value={formData.cycle || ""}
                  onChange={handleInputChange}
                  disabled={isReadOnly}
                  className={`w-full p-4 bg-rhozly-surface-low rounded-2xl font-bold border border-rhozly-outline/10 ${isReadOnly ? "opacity-80 appearance-none" : ""}`}
                >
                  {/* Render the stored value even if it doesn't match
                      a canonical option (AI sometimes returns "biennial"
                      vs our "Biannual", or makes up new descriptors).
                      Without this the <select> shows blank even though
                      the data is on the row. */}
                  {formData.cycle &&
                    !CYCLE_OPTIONS.some((opt) => opt.value === formData.cycle) && (
                      <option value={formData.cycle}>{formData.cycle}</option>
                    )}
                  {CYCLE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-rhozly-on-surface/40 ml-1">
                  Plant Type
                </label>
                <select
                  name="plant_type"
                  value={formData.plant_type || ""}
                  onChange={handleInputChange}
                  disabled={isReadOnly}
                  className={`w-full p-4 bg-rhozly-surface-low rounded-2xl font-bold border border-rhozly-outline/10 ${isReadOnly ? "opacity-80 appearance-none" : ""}`}
                >
                  <option value="">Select...</option>
                  {/* Same dynamic-option trick as Cycle above — show
                      whatever's stored even if it's outside our short
                      canonical list (Herb / Succulent / Climber etc). */}
                  {formData.plant_type &&
                    !["Shrub", "Tree", "Flower", "Vegetable", "Houseplant"].includes(
                      formData.plant_type,
                    ) && (
                      <option value={formData.plant_type}>{formData.plant_type}</option>
                    )}
                  <option value="Shrub">Shrub</option>
                  <option value="Tree">Tree</option>
                  <option value="Flower">Flower</option>
                  <option value="Vegetable">Vegetable</option>
                  <option value="Houseplant">Houseplant</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* PHENOLOGY & REPRODUCTION */}
        <div className="space-y-4">
          <SectionHeader
            id="phenology"
            title="Seasons & Propagation"
            icon={Calendar}
          />
          {activeSection === "phenology" && (
            <div className="p-2 space-y-6 animate-in slide-in-from-top-2">
              <MultiSelect
                label="Flowering Seasons"
                field="flowering_season"
                options={SEASON_OPTIONS}
                icon={Sun}
                isReadOnly={isReadOnly}
              />
              <MultiSelect
                label="Harvest Seasons"
                field="harvest_season"
                options={SEASON_OPTIONS}
                icon={Leaf}
                isReadOnly={isReadOnly}
              />

              <MultiSelect
                label="Pruning Months"
                field="pruning_month"
                options={MONTH_OPTIONS}
                icon={Scissors}
                isReadOnly={isReadOnly}
              />
              <MultiSelect
                label="Propagation Methods"
                field="propagation"
                options={PROPAGATION_OPTIONS}
                icon={Sparkles}
                isReadOnly={isReadOnly}
              />
              <MultiSelect
                label="Attracts Wildlife"
                field="attracts"
                options={ATTRACTS_OPTIONS}
                icon={Sparkles}
                isReadOnly={isReadOnly}
              />
            </div>
          )}
        </div>

        {/* CARE REQUIREMENTS */}
        <div className="space-y-4">
          <SectionHeader id="care" title="Care Requirements" icon={Droplets} />
          {activeSection === "care" && (
            <div className="p-2 space-y-6 animate-in slide-in-from-top-2">
              <MultiSelect
                label="Sunlight Exposure"
                field="sunlight"
                options={SUNLIGHT_OPTIONS}
                icon={Check}
                isReadOnly={isReadOnly}
              />
              {/* Wave 7 (D9) — Watering Interval gets the per-field highlight
                  when either min or max is in updated_care_fields or
                  overridden_fields. Combined under a single banner since they
                  conceptually represent one care setting. */}
              {(() => {
                const wateringStatus =
                  fieldStatus("watering_min_days") ?? fieldStatus("watering_max_days");
                return (
              <div className={`space-y-4 ${wateringStatus ? `rounded-2xl border p-3 ${wateringStatus.wrap}` : ""}`}>
                <label className="text-[10px] font-black uppercase text-rhozly-on-surface/40 ml-1 flex items-center gap-2">
                  Watering Interval (Days)
                  {wateringStatus && (
                    <span
                      data-testid={`form-field-${wateringStatus.kind}-watering`}
                      className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md ${wateringStatus.badge.cls}`}
                    >
                      {wateringStatus.badge.label}
                    </span>
                  )}
                </label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="relative">
                    <input
                      type="number"
                      name="watering_min_days"
                      value={formData.watering_min_days}
                      onChange={handleInputChange}
                      disabled={isReadOnly}
                      placeholder="Min"
                      className={`w-full p-4 bg-rhozly-surface-low rounded-2xl outline-none border font-bold transition-all ${errors.watering_range ? "border-red-300 bg-red-50" : "border-rhozly-outline/10"} ${isReadOnly ? "opacity-80" : ""}`}
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black opacity-20 uppercase">
                      Min
                    </span>
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      name="watering_max_days"
                      value={formData.watering_max_days}
                      onChange={handleInputChange}
                      disabled={isReadOnly}
                      placeholder="Max"
                      className={`w-full p-4 bg-rhozly-surface-low rounded-2xl outline-none border font-bold transition-all ${errors.watering_range ? "border-red-300 bg-red-50" : "border-rhozly-outline/10"} ${isReadOnly ? "opacity-80" : ""}`}
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black opacity-20 uppercase">
                      Max
                    </span>
                  </div>
                </div>
                {errors.watering_range && (
                  <p className="text-[10px] font-bold text-red-500 uppercase tracking-tight flex items-center gap-1 ml-1">
                    <AlertCircle size={11} /> {errors.watering_range}
                  </p>
                )}
              </div>
                );
              })()}
            </div>
          )}
        </div>

        {/* TRAITS & SAFETY */}
        <div className="space-y-4">
          <SectionHeader
            id="traits"
            title="Traits & Safety"
            icon={ShieldAlert}
          />
          {activeSection === "traits" && (
            <div className="p-2 grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-in slide-in-from-top-2">
              <Toggle
                name="indoor"
                label="Indoor"
                checked={formData.indoor}
                onChange={handleInputChange}
                isReadOnly={isReadOnly}
              />
              <Toggle
                name="is_edible"
                label="Edible Fruit"
                checked={formData.is_edible}
                onChange={handleInputChange}
                isReadOnly={isReadOnly}
              />
              <Toggle
                name="drought_tolerant"
                label="Drought Tolerant"
                checked={formData.drought_tolerant}
                onChange={handleInputChange}
                isReadOnly={isReadOnly}
              />
              <Toggle
                name="tropical"
                label="Tropical"
                checked={formData.tropical}
                onChange={handleInputChange}
                isReadOnly={isReadOnly}
              />
              <Toggle
                name="is_toxic_pets"
                label="Toxic to Pets"
                checked={formData.is_toxic_pets}
                onChange={handleInputChange}
                isReadOnly={isReadOnly}
              />
              <Toggle
                name="is_toxic_humans"
                label="Toxic to Humans"
                checked={formData.is_toxic_humans}
                onChange={handleInputChange}
                isReadOnly={isReadOnly}
              />
              <Toggle
                name="medicinal"
                label="Medicinal"
                checked={formData.medicinal}
                onChange={handleInputChange}
                isReadOnly={isReadOnly}
              />
              <Toggle
                name="cuisine"
                label="Culinary Use"
                checked={formData.cuisine}
                onChange={handleInputChange}
                isReadOnly={isReadOnly}
              />
            </div>
          )}
        </div>

        {!isReadOnly && (
          <div className="flex gap-4 pt-8 pb-4">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 py-4 rounded-2xl font-black text-rhozly-on-surface/40 hover:bg-rhozly-surface-low transition-all"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              data-testid="plant-form-save-btn"
              disabled={isSaving || savedConfirm || (disableWhenPristine && !dirty)}
              title={disableWhenPristine && !dirty ? "No changes to save — edit a field first" : undefined}
              className={`flex-[2] py-4 rounded-2xl font-black shadow-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${savedConfirm ? "bg-green-500 text-white" : "bg-rhozly-primary text-white"}`}
            >
              {isSaving ? (
                <Loader2 className="animate-spin" size={20} />
              ) : savedConfirm ? (
                <>
                  <Check size={20} /> Saved
                </>
              ) : (
                <>
                  <Save size={20} /> {submitLabel}
                </>
              )}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}

function Toggle({ name, label, checked, onChange, isReadOnly }: any) {
  return (
    <label
      className={`flex items-center justify-between min-h-[44px] px-4 py-3 bg-rhozly-surface-low rounded-2xl border border-rhozly-outline/5 ${isReadOnly ? "opacity-80 cursor-default" : "cursor-pointer"}`}
    >
      <span className="text-[10px] font-black uppercase tracking-tight text-rhozly-on-surface/60 pr-2">
        {label}
      </span>
      <div className="relative flex-shrink-0">
        <input
          type="checkbox"
          name={name}
          checked={checked}
          onChange={onChange}
          disabled={isReadOnly}
          className="sr-only peer"
        />
        <div className={`w-10 h-6 rounded-full transition-colors ${checked ? "bg-rhozly-primary" : "bg-rhozly-outline/20"} ${isReadOnly ? "opacity-80" : ""}`} />
        <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? "translate-x-4" : "translate-x-0"}`} />
      </div>
    </label>
  );
}
