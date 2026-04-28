import React, { useEffect, useState, useCallback } from "react";
import { Beaker, Sun, Droplets, FlaskConical, Layers, Zap, CheckCircle } from "lucide-react";

import { usePlantDoctor } from "../context/PlantDoctorContext";

interface AreaAdvancedFieldsProps {
  data: any;
  onChange: (fields: any) => void;
}

interface ValidationErrors {
  medium_ph?: string;
  light_intensity_lux?: string;
}

export default function AreaAdvancedFields({
  data,
  onChange,
}: AreaAdvancedFieldsProps) {
  const { setPageContext } = usePlantDoctor();
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [savedField, setSavedField] = useState<string | null>(null);

  const validate = useCallback(
    (name: string, value: string): string | undefined => {
      if (name === "medium_ph") {
        const num = parseFloat(value);
        if (value !== "" && (isNaN(num) || num < 0 || num > 14)) {
          return "pH must be between 0 and 14";
        }
      }
      if (name === "light_intensity_lux") {
        const num = parseFloat(value);
        if (value !== "" && (isNaN(num) || num < 0 || num > 200000)) {
          return "Lux must be between 0 and 200,000";
        }
      }
      return undefined;
    },
    [],
  );

  const flashSaved = useCallback((name: string) => {
    setSavedField(name);
    const t = window.setTimeout(() => setSavedField(null), 1500);
    return () => window.clearTimeout(t);
  }, []);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value, type } = e.target;

    if (type === "number") {
      const error = validate(name, value);
      setErrors((prev) => ({ ...prev, [name]: error }));
      if (!error && value !== "") {
        flashSaved(name);
        onChange({ [name]: parseFloat(value) });
      } else if (value === "") {
        onChange({ [name]: null });
      }
    } else {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
      flashSaved(name);
      onChange({ [name]: value });
    }
  };

  useEffect(() => {
    setPageContext({
      action: "Editing Advanced Area Environmental Settings",
      currentSettings: {
        growingMedium: data.growing_medium || "Not set",
        mediumTexture: data.medium_texture || "Not set",
        pHLevel: data.medium_ph ? `${data.medium_ph}` : "Not set",
        peakLightLux: data.light_intensity_lux
          ? `${data.light_intensity_lux} lux`
          : "Not set",
        waterMovement: data.water_movement || "Not set",
        nutrientSource: data.nutrient_source || "Not set",
      },
    });
  }, [data, setPageContext]);

  const labelClass =
    "flex items-center gap-2 text-xs font-black uppercase text-rhozly-on-surface/40 ml-1";

  const selectClass =
    "w-full p-4 bg-rhozly-surface-low rounded-2xl font-bold border border-rhozly-outline/10 " +
    "focus:ring-2 focus:ring-rhozly-primary/20 focus:border-rhozly-primary " +
    "hover:border-rhozly-outline/30 hover:bg-rhozly-surface transition-colors duration-150 " +
    "appearance-none cursor-pointer pr-10";

  const inputClass = (name: string) =>
    "w-full p-4 bg-rhozly-surface-low rounded-2xl font-bold border " +
    (errors[name as keyof ValidationErrors]
      ? "border-red-400 focus:ring-2 focus:ring-red-300 focus:border-red-400"
      : "border-rhozly-outline/10 focus:ring-2 focus:ring-rhozly-primary/20 focus:border-rhozly-primary") +
    " hover:border-rhozly-outline/30 hover:bg-rhozly-surface transition-colors duration-150";

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-500">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 1. Growing Medium */}
        <div className="space-y-2">
          <label className={labelClass}>
            <Layers size={14} /> Growing Medium
          </label>
          <div className="relative">
            <select
              name="growing_medium"
              value={data.growing_medium || ""}
              onChange={handleChange}
              className={selectClass}
            >
              <option value="">Select Medium...</option>
              <option value="Mineral Soil">Mineral Soil (Natural earth)</option>
              <option value="Soilless Mix">Soilless Mix (Peat/Coco)</option>
              <option value="Aggregates">Aggregates (Gravel/Clay)</option>
              <option value="Liquid">Liquid (Hydroponics)</option>
              <option value="Air/Mist">Air/Mist (Aeroponics)</option>
            </select>
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-rhozly-on-surface/40">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            {savedField === "growing_medium" && (
              <span className="absolute right-9 top-1/2 -translate-y-1/2 text-green-500">
                <CheckCircle size={14} />
              </span>
            )}
          </div>
        </div>

        {/* 2. Texture */}
        <div className="space-y-2">
          <label className={labelClass}>
            <Zap size={14} /> Medium Texture
          </label>
          <div className="relative">
            <select
              name="medium_texture"
              value={data.medium_texture || ""}
              onChange={handleChange}
              className={selectClass}
            >
              <option value="">Select Texture...</option>
              <option value="Fine">Fine (Silt/Clay)</option>
              <option value="Medium">Medium (Loam/Mix)</option>
              <option value="Coarse">Coarse (Gravel/Perlite)</option>
              <option value="Open">Open (Water/Large Stones)</option>
            </select>
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-rhozly-on-surface/40">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            {savedField === "medium_texture" && (
              <span className="absolute right-9 top-1/2 -translate-y-1/2 text-green-500">
                <CheckCircle size={14} />
              </span>
            )}
          </div>
        </div>

        {/* 3. pH Level */}
        <div className="space-y-2">
          <label className={labelClass}>
            <FlaskConical size={14} /> Medium pH
          </label>
          <div className="relative">
            <input
              type="number"
              step="0.1"
              min="0"
              max="14"
              name="medium_ph"
              value={data.medium_ph || ""}
              onChange={handleChange}
              placeholder="e.g. 6.5"
              aria-describedby={errors.medium_ph ? "medium_ph_error" : undefined}
              className={inputClass("medium_ph")}
            />
            {savedField === "medium_ph" && !errors.medium_ph && (
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-green-500">
                <CheckCircle size={14} />
              </span>
            )}
          </div>
          {errors.medium_ph && (
            <p id="medium_ph_error" className="text-xs text-red-500 ml-1 font-semibold">
              {errors.medium_ph}
            </p>
          )}
          <p className="text-xs text-rhozly-on-surface/30 ml-1">Valid range: 0 – 14</p>
        </div>

        {/* 4. Lux */}
        <div className="space-y-2">
          <label className={labelClass}>
            <Sun size={14} /> Peak Light (Lux)
          </label>
          <div className="relative">
            <input
              type="number"
              min="0"
              max="200000"
              name="light_intensity_lux"
              value={data.light_intensity_lux || ""}
              onChange={handleChange}
              placeholder="e.g. 5000"
              aria-describedby={errors.light_intensity_lux ? "light_intensity_lux_error" : undefined}
              className={inputClass("light_intensity_lux")}
            />
            {savedField === "light_intensity_lux" && !errors.light_intensity_lux && (
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-green-500">
                <CheckCircle size={14} />
              </span>
            )}
          </div>
          {errors.light_intensity_lux && (
            <p id="light_intensity_lux_error" className="text-xs text-red-500 ml-1 font-semibold">
              {errors.light_intensity_lux}
            </p>
          )}
          <p className="text-xs text-rhozly-on-surface/30 ml-1">Typical range: 1,000 – 100,000 lux</p>
        </div>

        {/* 5. Water Movement */}
        <div className="space-y-2">
          <label className={labelClass}>
            <Droplets size={14} /> Water Movement
          </label>
          <div className="relative">
            <select
              name="water_movement"
              value={data.water_movement || ""}
              onChange={handleChange}
              className={selectClass}
            >
              <option value="">Select Flow...</option>
              <option value="Well-Drained">Well-Drained</option>
              <option value="Low-Drained">Low-Drained (Pools)</option>
              <option value="Recirculating">Recirculating (Pump)</option>
              <option value="Static">Static / Deep Water</option>
            </select>
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-rhozly-on-surface/40">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            {savedField === "water_movement" && (
              <span className="absolute right-9 top-1/2 -translate-y-1/2 text-green-500">
                <CheckCircle size={14} />
              </span>
            )}
          </div>
        </div>

        {/* 6. Nutrient Source */}
        <div className="space-y-2">
          <label className={labelClass}>
            <Beaker size={14} /> Nutrient Source
          </label>
          <div className="relative">
            <select
              name="nutrient_source"
              value={data.nutrient_source || ""}
              onChange={handleChange}
              className={selectClass}
            >
              <option value="">Select Source...</option>
              <option value="Organic Breakdown">Organic (Compost)</option>
              <option value="Synthetic">Synthetic / Salts</option>
              <option value="Biowaste">Biowaste (Fish/Aqua)</option>
            </select>
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-rhozly-on-surface/40">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            {savedField === "nutrient_source" && (
              <span className="absolute right-9 top-1/2 -translate-y-1/2 text-green-500">
                <CheckCircle size={14} />
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
