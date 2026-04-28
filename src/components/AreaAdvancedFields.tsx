import React, { useEffect } from "react";
import { Beaker, Sun, Droplets, FlaskConical, Layers, Zap } from "lucide-react";

// 🧠 IMPORT THE AI CONTEXT
import { usePlantDoctor } from "../context/PlantDoctorContext";

interface AreaAdvancedFieldsProps {
  data: any;
  onChange: (fields: any) => void;
}

export default function AreaAdvancedFields({
  data,
  onChange,
}: AreaAdvancedFieldsProps) {
  // 🧠 GRAB THE SETTER FROM CONTEXT
  const { setPageContext } = usePlantDoctor();

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value, type } = e.target;
    onChange({ [name]: type === "number" ? parseFloat(value) : value });
  };

  // 🧠 LIVE AI SYNC: Update context when the user tweaks advanced area settings
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

    // We DO NOT return a cleanup function here setting it to null!
    // Why? Because this is a sub-component. If we set it to null on unmount,
    // it might wipe out the parent component's context. We just let it update
    // the global state while it is visible on screen.
  }, [data, setPageContext]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-500">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 1. Growing Medium */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-[10px] font-black uppercase text-rhozly-on-surface/40 ml-1">
            <Layers size={14} /> Growing Medium
          </label>
          <select
            name="growing_medium"
            value={data.growing_medium || ""}
            onChange={handleChange}
            className="w-full p-4 bg-rhozly-surface-low rounded-2xl font-bold border border-rhozly-outline/10 focus:ring-2 focus:ring-rhozly-primary/20"
          >
            <option value="">Select Medium...</option>
            <option value="Mineral Soil">Mineral Soil (Natural earth)</option>
            <option value="Soilless Mix">Soilless Mix (Peat/Coco)</option>
            <option value="Aggregates">Aggregates (Gravel/Clay)</option>
            <option value="Liquid">Liquid (Hydroponics)</option>
            <option value="Air/Mist">Air/Mist (Aeroponics)</option>
          </select>
        </div>

        {/* 2. Texture */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-[10px] font-black uppercase text-rhozly-on-surface/40 ml-1">
            <Zap size={14} /> Medium Texture
          </label>
          <select
            name="medium_texture"
            value={data.medium_texture || ""}
            onChange={handleChange}
            className="w-full p-4 bg-rhozly-surface-low rounded-2xl font-bold border border-rhozly-outline/10 focus:ring-2 focus:ring-rhozly-primary/20"
          >
            <option value="">Select Texture...</option>
            <option value="Fine">Fine (Silt/Clay)</option>
            <option value="Medium">Medium (Loam/Mix)</option>
            <option value="Coarse">Coarse (Gravel/Perlite)</option>
            <option value="Open">Open (Water/Large Stones)</option>
          </select>
        </div>

        {/* 3. pH Level */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-[10px] font-black uppercase text-rhozly-on-surface/40 ml-1">
            <FlaskConical size={14} /> Medium pH
          </label>
          <input
            type="number"
            step="0.1"
            name="medium_ph"
            value={data.medium_ph || ""}
            onChange={handleChange}
            placeholder="e.g. 6.5"
            className="w-full p-4 bg-rhozly-surface-low rounded-2xl font-bold border border-rhozly-outline/10 focus:ring-2 focus:ring-rhozly-primary/20 focus:border-rhozly-primary"
          />
        </div>

        {/* 4. Lux */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-[10px] font-black uppercase text-rhozly-on-surface/40 ml-1">
            <Sun size={14} /> Peak Light (Lux)
          </label>
          <input
            type="number"
            name="light_intensity_lux"
            value={data.light_intensity_lux || ""}
            onChange={handleChange}
            placeholder="e.g. 5000"
            className="w-full p-4 bg-rhozly-surface-low rounded-2xl font-bold border border-rhozly-outline/10 focus:ring-2 focus:ring-rhozly-primary/20 focus:border-rhozly-primary"
          />
        </div>

        {/* 5. Water Movement */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-[10px] font-black uppercase text-rhozly-on-surface/40 ml-1">
            <Droplets size={14} /> Water Movement
          </label>
          <select
            name="water_movement"
            value={data.water_movement || ""}
            onChange={handleChange}
            className="w-full p-4 bg-rhozly-surface-low rounded-2xl font-bold border border-rhozly-outline/10 focus:ring-2 focus:ring-rhozly-primary/20"
          >
            <option value="">Select Flow...</option>
            <option value="Well-Drained">Well-Drained</option>
            <option value="Low-Drained">Low-Drained (Pools)</option>
            <option value="Recirculating">Recirculating (Pump)</option>
            <option value="Static">Static / Deep Water</option>
          </select>
        </div>

        {/* 6. Nutrient Source */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-[10px] font-black uppercase text-rhozly-on-surface/40 ml-1">
            <Beaker size={14} /> Nutrient Source
          </label>
          <select
            name="nutrient_source"
            value={data.nutrient_source || ""}
            onChange={handleChange}
            className="w-full p-4 bg-rhozly-surface-low rounded-2xl font-bold border border-rhozly-outline/10 focus:ring-2 focus:ring-rhozly-primary/20"
          >
            <option value="">Select Source...</option>
            <option value="Organic Breakdown">Organic (Compost)</option>
            <option value="Synthetic">Synthetic / Salts</option>
            <option value="Biowaste">Biowaste (Fish/Aqua)</option>
          </select>
        </div>
      </div>
    </div>
  );
}
