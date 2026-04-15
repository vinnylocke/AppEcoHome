import React, { useState, useEffect, useRef } from "react";
import {
  Sun,
  Camera,
  Loader2,
  SlidersHorizontal,
  MapPin,
  Save,
  Pause,
  Play,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import toast from "react-hot-toast";

// 🚀 Native Capacitor Plugin
import { LightSensor as NativeLightSensor } from "@capgo/capacitor-light-sensor";

type SensorMethod = "Native Sensor" | "Pixel Analysis";

interface LightSensorProps {
  homeId: string;
}

export default function LightSensor({ homeId }: LightSensorProps) {
  // --- States ---
  const [lux, setLux] = useState<number>(0);
  const [method, setMethod] = useState<
    SensorMethod | "Initializing..." | "Paused"
  >("Initializing...");
  const [isScanning, setIsScanning] = useState(true);
  const [isManualMode, setIsManualMode] = useState(false);
  const [manualMethod, setManualMethod] =
    useState<SensorMethod>("Pixel Analysis");
  const [showCalibration, setShowCalibration] = useState(false);
  const [calibrationFactor, setCalibrationFactor] = useState<number>(() => {
    const saved = localStorage.getItem("rhozly_lux_calibration");
    return saved ? parseFloat(saved) : 0.2;
  });

  // --- Assignment States ---
  const [locations, setLocations] = useState<any[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string>("");
  const [selectedAreaId, setSelectedAreaId] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);

  // --- Refs for Hardware ---
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number>();
  const sensorListenerRef = useRef<any>(null);
  const targetLuxRef = useRef<number>(0);
  const currentLuxRef = useRef<number>(0);
  const calibrationRef = useRef<number>(calibrationFactor);

  // Sync calibration to ref
  useEffect(() => {
    calibrationRef.current = calibrationFactor;
    localStorage.setItem(
      "rhozly_lux_calibration",
      calibrationFactor.toString(),
    );
  }, [calibrationFactor]);

  // 1. Fetch Areas with Guard Clause
  useEffect(() => {
    const fetchAreas = async () => {
      // 🚀 THE FIX: Stop the 'undefined' 400 error
      if (!homeId || homeId === "undefined") return;

      const { data, error } = await supabase
        .from("locations")
        .select(`id, name, areas ( id, name, light_intensity_lux )`)
        .eq("home_id", homeId);

      if (error) {
        console.error("Fetch areas error:", error);
        return;
      }
      if (data) setLocations(data);
    };
    fetchAreas();
  }, [homeId]);

  // 🚀 HELPER: Defined for UI
  const getLightCategory = (luxValue: number) => {
    if (luxValue < 500)
      return {
        label: "Deep Shade",
        color: "text-gray-500",
        border: "border-gray-400",
        bg: "bg-gray-50",
      };
    if (luxValue < 2500)
      return {
        label: "Low Light",
        color: "text-blue-500",
        border: "border-blue-400",
        bg: "bg-blue-50",
      };
    if (luxValue < 10000)
      return {
        label: "Bright Indirect",
        color: "text-green-500",
        border: "border-green-400",
        bg: "bg-green-50",
      };
    if (luxValue < 20000)
      return {
        label: "Partial Sun",
        color: "text-amber-500",
        border: "border-amber-400",
        bg: "bg-amber-50",
      };
    return {
      label: "Direct Sun",
      color: "text-orange-500",
      border: "border-orange-400",
      bg: "bg-orange-50",
    };
  };

  const category = getLightCategory(lux);

  // --- PIXEL ANALYSIS LOGIC ---
  const calculateLuxFromPixels = () => {
    if (!videoRef.current || !canvasRef.current) return 0;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (ctx && video.readyState === video.HAVE_ENOUGH_DATA) {
      const cropSize = Math.min(video.videoWidth, video.videoHeight) * 0.5;
      const startX = (video.videoWidth - cropSize) / 2;
      const startY = (video.videoHeight - cropSize) / 2;
      canvas.width = 64;
      canvas.height = 64;
      ctx.drawImage(video, startX, startY, cropSize, cropSize, 0, 0, 64, 64);
      const data = ctx.getImageData(0, 0, 64, 64).data;
      let r = 0,
        g = 0,
        b = 0;
      for (let i = 0; i < data.length; i += 4) {
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
      }
      const count = data.length / 4;
      const brightness =
        0.2126 * (r / count) + 0.7152 * (g / count) + 0.0722 * (b / count);
      const rawLux = Math.pow(brightness / 255, 2.5) * 40000;
      return Math.round(rawLux * calibrationRef.current);
    }
    return 0;
  };

  const processingLoop = () => {
    if (isScanning) {
      if (isManualMode) {
        if (manualMethod === "Pixel Analysis")
          targetLuxRef.current = calculateLuxFromPixels();
      } else {
        if (method !== "Native Sensor")
          targetLuxRef.current = calculateLuxFromPixels();
      }
      currentLuxRef.current =
        currentLuxRef.current +
        (targetLuxRef.current - currentLuxRef.current) * 0.1;
      setLux(Math.round(currentLuxRef.current));
    }
    animationFrameRef.current = requestAnimationFrame(processingLoop);
  };

  useEffect(() => {
    animationFrameRef.current = requestAnimationFrame(processingLoop);
    return () => {
      if (animationFrameRef.current)
        cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isScanning, isManualMode, manualMethod, method]);

  // --- HARDWARE LIFECYCLE ---
  useEffect(() => {
    const initHardware = async () => {
      // 1. Setup Native Sensor
      try {
        const { available } = await NativeLightSensor.isAvailable();
        if (available) {
          sensorListenerRef.current = await NativeLightSensor.addListener(
            "lightSensorChange",
            (data) => {
              if (!isManualMode || manualMethod === "Native Sensor") {
                targetLuxRef.current = Math.round(data.illuminance);
                setMethod("Native Sensor");
              }
            },
          );
          await NativeLightSensor.start({ updateInterval: 500 });
        }
      } catch (e) {
        console.warn("Native sensor skipped");
      }

      // 2. Setup Camera
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
        if (method === "Initializing...") setMethod("Pixel Analysis");
      } catch (err) {
        console.warn("Camera skipped");
      }
    };

    initHardware();

    return () => {
      try {
        NativeLightSensor.stop();
        if (sensorListenerRef.current) sensorListenerRef.current.remove();
      } catch (e) {}
      if (streamRef.current)
        streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, []); // Run once on mount

  const handleSaveToArea = async () => {
    if (!selectedAreaId) return toast.error("Select an area!");

    setIsSaving(true);
    try {
      // 🚀 FIXED TYPO: changed selectedAreaAreaId to selectedAreaId
      const { error } = await supabase
        .from("areas")
        .update({ light_intensity_lux: lux })
        .eq("id", selectedAreaId);

      if (error) throw error;

      toast.success(`Saved ${lux.toLocaleString()} lx!`);

      // Update local state so dropdown Current Lux reflects new value
      setLocations((prev) =>
        prev.map((loc) => ({
          ...loc,
          areas: loc.areas.map((a: any) =>
            a.id === selectedAreaId ? { ...a, light_intensity_lux: lux } : a,
          ),
        })),
      );

      setIsScanning(true); // Resume scanning after save
    } catch (e: any) {
      console.error("Detailed Save Error:", e);
      // 🚀 BETTER ERROR TOAST: Shows the actual DB error
      toast.error(`Failed to save: ${e.message || "Unknown Error"}`);
    } finally {
      setIsSaving(false);
    }
  };

  const availableAreas = selectedLocationId
    ? locations.find((l) => l.id === selectedLocationId)?.areas || []
    : [];

  // --- Early Return for Missing Home ID ---
  if (!homeId || homeId === "undefined") {
    return (
      <div className="flex flex-col items-center justify-center h-full p-10 text-center">
        <Loader2 className="animate-spin text-rhozly-primary mb-4" size={40} />
        <p className="font-bold text-rhozly-on-surface/60 uppercase tracking-widest text-[10px]">
          Identifying Home...
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto h-full flex flex-col p-6 animate-in fade-in duration-500 overflow-y-auto custom-scrollbar pb-32">
      <canvas ref={canvasRef} className="hidden" />

      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-3xl font-black font-display text-rhozly-on-surface">
            Light Meter
          </h2>
          <p className="text-xs font-bold text-rhozly-on-surface/40 uppercase tracking-widest mt-1">
            {isScanning ? "Live Analysis" : "Reading Frozen"}
          </p>
        </div>
        <button
          onClick={() => setShowCalibration(!showCalibration)}
          className={`p-2 rounded-full transition-colors ${showCalibration ? "bg-rhozly-primary text-white" : "bg-rhozly-surface-low text-rhozly-on-surface"}`}
        >
          <SlidersHorizontal size={20} />
        </button>
      </div>

      <div className="bg-rhozly-surface-low p-1.5 rounded-2xl flex items-center mb-4">
        <button
          onClick={() => setIsManualMode(false)}
          className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${!isManualMode ? "bg-white text-rhozly-primary shadow-sm" : "text-rhozly-on-surface/40"}`}
        >
          Auto Logic
        </button>
        <button
          onClick={() => setIsManualMode(true)}
          className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${isManualMode ? "bg-white text-rhozly-primary shadow-sm" : "text-rhozly-on-surface/40"}`}
        >
          Manual Mode
        </button>
      </div>

      {isManualMode && (
        <div className="flex gap-2 mb-4 animate-in slide-in-from-top-2">
          {(["Native Sensor", "Pixel Analysis"] as SensorMethod[]).map((m) => (
            <button
              key={m}
              onClick={() => setManualMethod(m)}
              className={`flex-1 py-2 rounded-xl text-[9px] font-black uppercase border transition-all ${manualMethod === m ? "bg-rhozly-primary text-white border-rhozly-primary" : "bg-white text-rhozly-on-surface/40 border-rhozly-outline/10"}`}
            >
              {m}
            </button>
          ))}
        </div>
      )}

      {showCalibration &&
        (manualMethod === "Pixel Analysis" || !isManualMode) && (
          <div className="mb-6 p-4 bg-white rounded-2xl border border-rhozly-outline/10 shadow-sm animate-in slide-in-from-top-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-black uppercase text-rhozly-on-surface">
                Tune Camera
              </span>
              <span className="text-xs font-bold text-rhozly-primary bg-rhozly-primary/10 px-2 py-1 rounded-md">
                {calibrationFactor.toFixed(2)}x
              </span>
            </div>
            <input
              type="range"
              min="0.01"
              max="2.00"
              step="0.01"
              value={calibrationFactor}
              onChange={(e) => setCalibrationFactor(parseFloat(e.target.value))}
              className="w-full accent-rhozly-primary"
            />
          </div>
        )}

      <div className="flex-1 flex flex-col items-center justify-center py-6 min-h-[300px]">
        <div
          className={`relative w-64 h-64 rounded-full flex flex-col items-center justify-center border-[12px] shadow-2xl transition-all duration-700 overflow-hidden ${isScanning ? "border-rhozly-outline/20" : "border-amber-500"} ${category.bg}`}
        >
          <video
            ref={videoRef}
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${isScanning ? "opacity-100" : "opacity-40 grayscale"}`}
            playsInline
            muted
          />
          {isScanning && <div className="absolute inset-0 bg-black/30" />}

          <div className="relative z-10 flex flex-col items-center">
            <span
              className={`text-6xl font-black font-display tracking-tighter transition-colors duration-700 ${isScanning ? "text-white" : "text-amber-600"}`}
            >
              {lux.toLocaleString()}
            </span>
            <span
              className={`text-sm font-bold uppercase tracking-widest mt-1 ${isScanning ? "text-white/70" : "text-amber-600/50"}`}
            >
              LUX
            </span>
            <div
              className={`absolute -bottom-16 px-6 py-2 rounded-full font-black text-xs uppercase tracking-widest text-white shadow-lg transition-colors duration-700 ${category.color.replace("text-", "bg-")}`}
            >
              {category.label}
            </div>
          </div>
        </div>

        {isScanning && (
          <div className="mt-14 flex items-center gap-2 bg-white px-4 py-2 rounded-xl border border-rhozly-outline/10 shadow-sm">
            <div
              className={`w-2 h-2 rounded-full animate-pulse ${method === "Native Sensor" ? "bg-green-500" : "bg-amber-500"}`}
            />
            <span className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/60">
              Using: {isManualMode ? manualMethod : method}
            </span>
          </div>
        )}
      </div>

      <div className="space-y-4 mt-auto">
        {!isScanning ? (
          <div className="p-5 bg-rhozly-surface-low rounded-[2rem] border border-rhozly-outline/10 shadow-inner animate-in slide-in-from-bottom-4">
            <div className="flex items-center gap-2 mb-4">
              <MapPin size={16} className="text-rhozly-primary" />
              <span className="text-xs font-black uppercase tracking-widest text-rhozly-on-surface">
                Record this reading
              </span>
            </div>
            <div className="flex flex-col gap-2 mb-4">
              <select
                value={selectedLocationId}
                onChange={(e) => {
                  setSelectedLocationId(e.target.value);
                  setSelectedAreaId("");
                }}
                className="w-full p-3 bg-white rounded-xl font-bold border-none text-sm shadow-sm outline-none"
              >
                <option value="">Select Location...</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </select>
              <select
                value={selectedAreaId}
                onChange={(e) => setSelectedAreaId(e.target.value)}
                disabled={!selectedLocationId}
                className="w-full p-3 bg-white rounded-xl font-bold border-none text-sm shadow-sm outline-none disabled:opacity-50"
              >
                <option value="">Select Area...</option>
                {availableAreas.map((area: any) => (
                  <option key={area.id} value={area.id}>
                    {area.name}{" "}
                    {area.light_intensity_lux
                      ? `(${area.light_intensity_lux}lx)`
                      : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setIsScanning(true)}
                className="flex-1 py-4 bg-white text-rhozly-on-surface rounded-2xl font-black border border-rhozly-outline/10"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveToArea}
                disabled={!selectedAreaId || isSaving}
                className="flex-[2] py-4 bg-rhozly-primary text-white rounded-2xl font-black flex items-center justify-center gap-2 shadow-lg disabled:opacity-50"
              >
                {isSaving ? (
                  <Loader2 className="animate-spin" size={20} />
                ) : (
                  <>
                    <Save size={20} /> Save Reading
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setIsScanning(false)}
            className="w-full py-5 rounded-2xl font-black text-lg shadow-xl flex items-center justify-center gap-2 bg-rhozly-on-surface text-white active:scale-95 transition-all"
          >
            <Pause size={20} fill="currentColor" /> Capture Reading
          </button>
        )}
      </div>
    </div>
  );
}
