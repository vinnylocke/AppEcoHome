import React, { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
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
} from "lucide-react";
import toast from "react-hot-toast";

interface ManualPlantCreationProps {
  initialData?: any;
  onSave?: (data: any) => void;
  onCancel?: () => void;
  isSaving?: boolean;
  submitLabel?: string;
  isReadOnly?: boolean; // 🚀 NEW: Locks the form
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
  submitLabel = "Save to Shed",
  isReadOnly = false, // 🚀 Default is false so your manual flow works normally
}: ManualPlantCreationProps) {
  const [activeSection, setActiveSection] = useState<string | null>("basics");
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    common_name: "",
    thumbnail_url: "",
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
    flowering_season: "",
    harvest_season: "",
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
  });

  useEffect(() => {
    if (initialData) {
      setFormData({
        ...formData,
        ...initialData,
        watering_min_days: initialData.watering_min_days?.toString() || "",
        watering_max_days: initialData.watering_max_days?.toString() || "",
      });
    }
  }, [initialData]);

  const handleInputChange = (e: any) => {
    if (isReadOnly) return;
    const { name, value, type, checked } = e.target;
    if (name === "common_name" && errors.common_name) {
      setErrors((prev) => ({ ...prev, common_name: "" }));
    }
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
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

      setFormData((prev) => ({ ...prev, thumbnail_url: publicUrl }));
      toast.success("Image uploaded!");
    } catch (err: any) {
      toast.error("Failed to upload image.");
    } finally {
      setUploading(false);
    }
  };

  const toggleArrayItem = (field: keyof typeof formData, value: string) => {
    if (isReadOnly) return;
    setFormData((prev) => {
      const current = prev[field] as string[];
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

    onSave({
      ...formData,
      watering_min_days: isNaN(min) ? null : min,
      watering_max_days: isNaN(max) ? null : max,
    });
  };

  const MultiSelect = ({ label, field, options, icon: Icon }: any) => (
    <div className="space-y-2 relative">
      <label className="text-[10px] font-black uppercase text-rhozly-on-surface/40 ml-1 flex items-center gap-2">
        {Icon && <Icon size={12} />} {label}
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
          {activeSection === "basics" && (
            <div className="p-2 space-y-6 animate-in slide-in-from-top-2">
              {/* IMAGE UPLOAD SLOT */}
              <div className="flex flex-col items-center justify-center gap-4">
                <div
                  onClick={() => !isReadOnly && fileInputRef.current?.click()}
                  className={`relative w-40 h-40 rounded-[2.5rem] bg-rhozly-surface-low border-2 border-dashed border-rhozly-outline/20 overflow-hidden group transition-all ${!isReadOnly ? "cursor-pointer hover:border-rhozly-primary/40" : ""}`}
                >
                  {formData.thumbnail_url || formData.image_url ? (
                    <>
                      <img
                        src={formData.thumbnail_url || formData.image_url}
                        className="w-full h-full object-cover"
                        alt="Preview"
                      />
                      {!isReadOnly && (
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white text-[10px] font-black uppercase tracking-widest">
                          Change Photo
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
                      {!isReadOnly && (
                        <span className="text-[10px] font-black uppercase mt-2">
                          Add Photo
                        </span>
                      )}
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
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-end px-1">
                  <label
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
            </div>
          )}
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
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-rhozly-on-surface/40 ml-1">
                    Flowering
                  </label>
                  <select
                    name="flowering_season"
                    value={formData.flowering_season || ""}
                    onChange={handleInputChange}
                    disabled={isReadOnly}
                    className={`w-full p-4 bg-rhozly-surface-low rounded-2xl font-bold border border-rhozly-outline/10 text-sm ${isReadOnly ? "opacity-80 appearance-none" : ""}`}
                  >
                    <option value="">Select...</option>
                    {SEASON_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-rhozly-on-surface/40 ml-1">
                    Harvest
                  </label>
                  <select
                    name="harvest_season"
                    value={formData.harvest_season || ""}
                    onChange={handleInputChange}
                    disabled={isReadOnly}
                    className={`w-full p-4 bg-rhozly-surface-low rounded-2xl font-bold border border-rhozly-outline/10 text-sm ${isReadOnly ? "opacity-80 appearance-none" : ""}`}
                  >
                    <option value="">Select...</option>
                    {SEASON_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
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
              <div className="space-y-4">
                <label className="text-[10px] font-black uppercase text-rhozly-on-surface/40 ml-1">
                  Watering Interval (Days)
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
                      className={`w-full p-4 bg-rhozly-surface-low rounded-2xl outline-none border border-rhozly-outline/10 font-bold ${isReadOnly ? "opacity-80" : ""}`}
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
                      className={`w-full p-4 bg-rhozly-surface-low rounded-2xl outline-none border border-rhozly-outline/10 font-bold ${isReadOnly ? "opacity-80" : ""}`}
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black opacity-20 uppercase">
                      Max
                    </span>
                  </div>
                </div>
              </div>
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
            <div className="p-2 grid grid-cols-2 gap-4 animate-in slide-in-from-top-2">
              <Toggle
                name="flowers"
                label="Flowers"
                checked={formData.flowers}
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
                name="indoor"
                label="Indoor"
                checked={formData.indoor}
                onChange={handleInputChange}
                isReadOnly={isReadOnly}
              />
              <Toggle
                name="is_toxic_pets"
                label="Toxic (Pets)"
                checked={formData.is_toxic_pets}
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
                label="Culinary"
                checked={formData.cuisine}
                onChange={handleInputChange}
                isReadOnly={isReadOnly}
              />
            </div>
          )}
        </div>

        {/* 🚀 HIDDEN IN READ-ONLY MODE */}
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
              disabled={isSaving}
              className="flex-[2] py-4 bg-rhozly-primary text-white rounded-2xl font-black shadow-lg flex items-center justify-center gap-2"
            >
              {isSaving ? (
                <Loader2 className="animate-spin" size={20} />
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
      className={`flex items-center justify-between p-4 bg-rhozly-surface-low rounded-2xl border border-rhozly-outline/5 ${isReadOnly ? "opacity-80 cursor-default" : "cursor-pointer"}`}
    >
      <span className="text-[10px] font-black uppercase tracking-tight text-rhozly-on-surface/60">
        {label}
      </span>
      <input
        type="checkbox"
        name={name}
        checked={checked}
        onChange={onChange}
        disabled={isReadOnly}
        className="w-5 h-5 accent-rhozly-primary disabled:opacity-80"
      />
    </label>
  );
}
