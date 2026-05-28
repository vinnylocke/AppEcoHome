import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Sun,
  Camera,
  Loader2,
  SlidersHorizontal,
  MapPin,
  Save,
  Play,
  Info,
  Circle,
  Zap,
  X,
  Smartphone,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import toast from "react-hot-toast";

import { LightSensor as NativeLightSensor } from "@capgo/capacitor-light-sensor";

// 🧠 IMPORT THE AI CONTEXT
import { usePlantDoctor } from "../context/PlantDoctorContext";

type SensorMethod = "Native Sensor" | "Pixel Analysis";

interface LightSensorProps {
  homeId: string;
}

export default function LightSensor({ homeId }: LightSensorProps) {
  const navigate = useNavigate();
  // 🧠 GRAB THE SETTER FROM CONTEXT
  const { setPageContext } = usePlantDoctor();

  const [lux, setLux] = useState<number>(0);
  const [method, setMethod] = useState<
    SensorMethod | "Initializing..." | "Paused"
  >("Initializing...");
  const [isScanning, setIsScanning] = useState(false);
  const [isManualMode, setIsManualMode] = useState(false);
  const [manualMethod, setManualMethod] =
    useState<SensorMethod>("Pixel Analysis");
  const [showCalibration, setShowCalibration] = useState(false);

  const [calibrationFactor, setCalibrationFactor] = useState<number>(() => {
    const saved = localStorage.getItem("rhozly_lux_calibration");
    return saved ? parseFloat(saved) : 0.2;
  });

  /** First-time user instructions card visibility. Persists dismissal
   *  so seasoned users don't see it on every visit. */
  const [showInstructions, setShowInstructions] = useState<boolean>(() => {
    try {
      return localStorage.getItem("rhozly:lightsensor:instructions-dismissed") !== "true";
    } catch { return true; }
  });
  const dismissInstructions = () => {
    setShowInstructions(false);
    try { localStorage.setItem("rhozly:lightsensor:instructions-dismissed", "true"); } catch { /* ignore */ }
  };

  const [exposureLevel, setExposureLevel] = useState<number>(() => {
    const saved = localStorage.getItem("rhozly_exposure_offset");
    return saved ? parseFloat(saved) : 0;
  });

  const [locations, setLocations] = useState<any[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string>("");
  const [selectedAreaId, setSelectedAreaId] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<{ lux: number; area: string } | null>(null);
  const [nativeSensorUnavailable, setNativeSensorUnavailable] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number>();
  const sensorListenerRef = useRef<any>(null);
  const targetLuxRef = useRef<number>(0);
  const currentLuxRef = useRef<number>(0);

  const calibrationRef = useRef<number>(calibrationFactor);
  const exposureRef = useRef<number>(exposureLevel);

  useEffect(() => {
    calibrationRef.current = calibrationFactor;
    localStorage.setItem(
      "rhozly_lux_calibration",
      calibrationFactor.toString(),
    );
  }, [calibrationFactor]);

  useEffect(() => {
    exposureRef.current = exposureLevel;
    localStorage.setItem("rhozly_exposure_offset", exposureLevel.toString());
    applyExposureConstraints();
  }, [exposureLevel]);

  const applyExposureConstraints = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    const capabilities: any = track.getCapabilities?.() || {};

    try {
      if (capabilities.exposureCompensation) {
        await track.applyConstraints({
          advanced: [{ exposureCompensation: exposureRef.current }],
        } as any);
      }
    } catch (e) {
      console.warn(
        "Hardware exposure lock failed - falling back to software gain.",
      );
    }
  };

  const [locationsLoading, setLocationsLoading] = useState(true);
  const [locationsFetchError, setLocationsFetchError] = useState(false);
  const [locationsRetryTick, setLocationsRetryTick] = useState(0);

  useEffect(() => {
    if (!homeId || homeId === "undefined") return;
    const fetchAreas = async () => {
      setLocationsLoading(true);
      setLocationsFetchError(false);
      const { data, error } = await supabase
        .from("locations")
        .select(`id, name, areas ( id, name, light_intensity_lux )`)
        .eq("home_id", homeId);
      if (error) {
        setLocationsFetchError(true);
      } else if (data) {
        setLocations(data);
      }
      setLocationsLoading(false);
    };
    fetchAreas();
  }, [homeId, locationsRetryTick]);

  const getLightCategory = (luxValue: number) => {
    if (luxValue < 500)
      return {
        label: "Deep Shade",
        color: "text-rhozly-on-surface font-black",
        border: "border-rhozly-outline/30",
        bg: "bg-rhozly-surface-low",
        banner: "bg-rhozly-on-surface/30",
      };
    if (luxValue < 2500)
      return {
        label: "Low Light",
        color: "text-rhozly-on-surface font-black",
        border: "border-rhozly-outline/30",
        bg: "bg-rhozly-surface-low",
        banner: "bg-rhozly-primary/40",
      };
    if (luxValue < 10000)
      return {
        label: "Bright Indirect",
        color: "text-rhozly-on-surface font-black",
        border: "border-rhozly-primary/40",
        bg: "bg-rhozly-primary/10",
        banner: "bg-rhozly-primary/60",
      };
    if (luxValue < 20000)
      return {
        label: "Partial Sun",
        color: "text-rhozly-on-surface font-black",
        border: "border-rhozly-primary/60",
        bg: "bg-rhozly-primary/20",
        banner: "bg-rhozly-primary/80",
      };
    return {
      label: "Direct Sun",
      color: "text-rhozly-on-surface font-black",
      border: "border-rhozly-primary",
      bg: "bg-rhozly-primary/30",
      banner: "bg-rhozly-primary",
    };
  };

  const category = getLightCategory(lux);

  // 🧠 LIVE AI SYNC: Update the AI on the current light readings
  useEffect(() => {
    // 🚀 FIXED: Added optional chaining (?.areas?.find) to prevent null property crashes
    const areaName =
      locations
        .find((l) => l.id === selectedLocationId)
        ?.areas?.find((a: any) => a.id === selectedAreaId)?.name ||
      "Unspecified Area";

    setPageContext({
      action: "Using Light Meter Sensor",
      sensorReading: {
        lux: lux,
        category: category.label,
        method: method,
        isScanning: isScanning,
        calibratedAt: `${calibrationFactor}x`,
      },
      targetArea: areaName,
    });

    // Cleanup on unmount
    return () => setPageContext(null);
  }, [
    lux,
    method,
    isScanning,
    selectedAreaId,
    locations,
    selectedLocationId,
    category.label,
    calibrationFactor,
    setPageContext,
  ]);

  const calculateLuxFromPixels = () => {
    if (!videoRef.current || !canvasRef.current) return 0;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    // 🚀 FIXED: Changed from HAVE_EN_DATA to HAVE_ENOUGH_DATA (or >= 2)
    if (ctx && video.readyState >= 2) {
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

      const softwareExposureMultiplier = Math.pow(2, exposureRef.current);
      const boostedBrightness = Math.min(
        255,
        brightness * softwareExposureMultiplier,
      );

      const rawLux = Math.pow(boostedBrightness / 255, 2.5) * 40000;
      return Math.round(rawLux * calibrationRef.current);
    }
    return 0;
  };

  const processingLoop = (isNativeOnly = false) => {
    if (!isNativeOnly) {
      if (!streamRef.current) return;
      targetLuxRef.current = calculateLuxFromPixels();
      setMethod("Pixel Analysis");
    }
    currentLuxRef.current =
      currentLuxRef.current +
      (targetLuxRef.current - currentLuxRef.current) * 0.1;
    setLux(Math.round(currentLuxRef.current));
    animationFrameRef.current = requestAnimationFrame(() =>
      processingLoop(isNativeOnly),
    );
  };

  const startCameraFallback = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      await applyExposureConstraints();
      setIsScanning(true);
      processingLoop();
    } catch (err: any) {
      toast.error(err?.message ? `Camera error: ${err.message}` : "Camera access denied — check your browser permissions");
    }
  };

  const startScanning = async () => {
    targetLuxRef.current = 0;
    currentLuxRef.current = 0;
    try {
      const { available } = await NativeLightSensor.isAvailable();
      if (available && (!isManualMode || manualMethod === "Native Sensor")) {
        setNativeSensorUnavailable(false);
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
        setIsScanning(true);
        processingLoop(true);
        toast.success("Sensor active", { duration: 1500 });
        return;
      }
      if (!isManualMode || manualMethod === "Native Sensor") {
        setNativeSensorUnavailable(true);
        toast("Native sensor unavailable — switching to camera", { icon: "📷", duration: 2500 });
      }
    } catch (e: any) {
      setNativeSensorUnavailable(true);
      toast("Native sensor unavailable — switching to camera", { icon: "📷", duration: 2500 });
    }
    await startCameraFallback();
  };

  const stopScanning = async () => {
    try {
      await NativeLightSensor.stop();
      if (sensorListenerRef.current) sensorListenerRef.current.remove();
    } catch (e) {}
    if (animationFrameRef.current)
      cancelAnimationFrame(animationFrameRef.current);
    if (streamRef.current)
      streamRef.current.getTracks().forEach((t) => t.stop());
    setIsScanning(false);
    toast("Scanning paused", { icon: "⏸", duration: 1500 });
  };

  const handleSaveToArea = async () => {
    if (!lux || lux === 0) return toast.error("No reading to save — start scanning first");
    if (!selectedAreaId) return toast.error("Select an area!");
    setIsSaving(true);
    try {
      const { error: insertErr } = await supabase.from("area_lux_readings").insert({
        home_id: homeId,
        area_id: selectedAreaId,
        lux_value: lux,
        recorded_at: new Date().toISOString(),
        source: "sensor",
      });
      if (insertErr) throw insertErr;
      const { error: updateErr } = await supabase
        .from("areas")
        .update({ light_intensity_lux: lux })
        .eq("id", selectedAreaId);
      if (updateErr) throw updateErr;
      const areaName = availableAreas.find((a: any) => a.id === selectedAreaId)?.name ?? "area";
      toast.success(`Saved ${lux.toLocaleString()} lx!`);
      setLastSaved({ lux, area: areaName });
      setLocations((prev) =>
        prev.map((loc) => ({
          ...loc,
          areas: loc.areas.map((a: any) =>
            a.id === selectedAreaId ? { ...a, light_intensity_lux: lux } : a,
          ),
        })),
      );
      startScanning();
    } catch (e: any) {
      toast.error(e?.message ? `Save failed: ${e.message}` : "Save failed — check your connection and try again.");
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    startScanning();
    return () => {
      stopScanning();
    };
  }, [isManualMode, manualMethod]);

  const availableAreas = selectedLocationId
    ? locations.find((l) => l.id === selectedLocationId)?.areas || []
    : [];

  // ── Expected vs measured comparison ──────────────────────────────────────
  // When an area is picked, load the plants in it so we can compare each
  // plant's preferred sunlight to the current lux reading.
  const [areaPlants, setAreaPlants] = useState<Array<{ id: number; name: string; sunlight: string[]; minLux: number; maxLux: number }>>([]);
  useEffect(() => {
    if (!selectedAreaId) {
      setAreaPlants([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("inventory_items")
        .select("id, identifier, plant_name, plants(sunlight)")
        .eq("home_id", homeId)
        .eq("area_id", selectedAreaId);
      if (cancelled) return;
      const SUN_LUX: Record<string, [number, number]> = {
        "deep shade":        [0, 500],
        "full shade":        [0, 500],
        "shade":             [500, 2_500],
        "part shade":        [2_500, 10_000],
        "partial shade":     [2_500, 10_000],
        "filtered shade":    [2_500, 10_000],
        "part sun":          [10_000, 20_000],
        "partial sun":       [10_000, 20_000],
        "bright indirect":   [2_500, 10_000],
        "full sun":          [20_000, 100_000],
        "sun":               [20_000, 100_000],
      };
      const next = (data ?? []).map((row: any) => {
        const sun: string[] = Array.isArray(row.plants?.sunlight) ? row.plants.sunlight : [];
        const ranges = sun.map((s) => SUN_LUX[String(s).toLowerCase()]).filter(Boolean) as Array<[number, number]>;
        const minLux = ranges.length > 0 ? Math.min(...ranges.map((r) => r[0])) : 0;
        const maxLux = ranges.length > 0 ? Math.max(...ranges.map((r) => r[1])) : 0;
        return {
          id: row.id,
          name: row.identifier || row.plant_name || "Plant",
          sunlight: sun,
          minLux,
          maxLux,
        };
      });
      setAreaPlants(next);
    })();
    return () => { cancelled = true; };
  }, [selectedAreaId, homeId]);

  // Position of the current lux value along the band, 0–1 (clamped at 50,000).
  const bandPosition = Math.max(0, Math.min(1, lux / 50_000));

  return (
    <div className="flex flex-col p-6 animate-in fade-in duration-500">
      <canvas ref={canvasRef} className="hidden" />

      {/* First-time user instructions — dismissable, persists in
          localStorage so we don't nag returning users. */}
      {showInstructions && (
        <div
          data-testid="lightsensor-instructions"
          className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3"
        >
          <div className="shrink-0 w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
            <Smartphone size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-black text-sm text-amber-900 leading-tight mb-1">
              How to take a good reading
            </p>
            <ul className="text-xs text-amber-900/85 leading-snug space-y-0.5">
              <li>• Stand in the spot you want to measure.</li>
              <li>• Hold the phone flat, sensor side up.</li>
              <li>• Stay still for 3 seconds — the reading settles.</li>
              <li>• Typical: shaded corner ≈ 500 lux, sunny garden ≈ 50 000 lux.</li>
            </ul>
          </div>
          <button
            onClick={dismissInstructions}
            data-testid="lightsensor-instructions-dismiss"
            aria-label="Hide instructions"
            className="shrink-0 p-1 rounded-lg text-amber-900/40 hover:text-amber-900 hover:bg-amber-100 transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <div className="flex justify-between items-start mb-4">
        <div>
          <h2 className="text-3xl font-black font-display text-rhozly-on-surface">
            Light Meter
          </h2>
          <p className="text-xs text-rhozly-on-surface/40 mt-0.5">
            Measure ambient light in lux
          </p>
          <p className="text-xs font-bold text-rhozly-on-surface/40 uppercase tracking-widest mt-1">
            {method === "Pixel Analysis"
              ? "Spot Meter Analysis"
              : "Native Hardware Sensor"}
          </p>
        </div>
        {method === "Pixel Analysis" && (
          <button
            onClick={() => setShowCalibration(!showCalibration)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-2xl transition-colors ${showCalibration ? "bg-rhozly-primary text-white" : "bg-rhozly-surface-low text-rhozly-on-surface"}`}
          >
            <SlidersHorizontal size={16} />
            <span className="text-[10px] font-black uppercase tracking-widest">Calibrate</span>
          </button>
        )}
      </div>

      {showCalibration && method === "Pixel Analysis" && (
        <div className="mb-6 p-5 bg-rhozly-surface-lowest rounded-2xl border border-rhozly-outline/10 shadow-lg animate-in slide-in-from-top-4 space-y-6">
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-[10px] font-black uppercase tracking-widest flex items-center gap-1 text-rhozly-on-surface/60">
                <Zap size={12} className="text-amber-500 fill-amber-500" />{" "}
                Light Sensitivity
              </span>
              <span className="text-xs font-bold text-rhozly-primary">
                {exposureLevel > 0 ? `+${exposureLevel}` : exposureLevel} EV
              </span>
            </div>
            <input
              type="range"
              min="-2"
              max="2"
              step="0.1"
              value={exposureLevel}
              onChange={(e) => setExposureLevel(parseFloat(e.target.value))}
              aria-label={`Light sensitivity: ${exposureLevel > 0 ? "+" : ""}${exposureLevel} EV`}
              className="w-full h-6 accent-rhozly-primary cursor-pointer"
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/60">
                Final Calibration
              </span>
              <span className="text-xs font-bold text-rhozly-primary">
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
              aria-label={`Final calibration: ${calibrationFactor.toFixed(2)}x multiplier`}
              className="w-full h-6 accent-rhozly-primary cursor-pointer"
            />
          </div>
        </div>
      )}

      {/* Best-time-to-measure tip — visible when not in calibration mode */}
      {!showCalibration && (() => {
        const hour = new Date().getHours();
        const inWindow = hour >= 10 && hour <= 14;
        return (
          <div className={`mb-4 flex items-start gap-2 px-3 py-2 rounded-2xl border ${
            inWindow
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-amber-50 border-amber-200 text-amber-800"
          }`}>
            <Info size={14} className="shrink-0 mt-0.5" />
            <p className="text-xs font-bold leading-snug">
              {inWindow
                ? "Good time to measure — readings between 10 am and 2 pm reflect peak conditions best."
                : "Tip: take readings between 10 am and 2 pm for the most representative result. Outside this window readings can vary with the sun's angle."}
            </p>
          </div>
        );
      })()}

      <div className="bg-rhozly-surface-low p-1.5 rounded-2xl flex items-center mb-6">
        <button
          onClick={() => setIsManualMode(false)}
          className={`flex-1 min-h-[44px] py-2 rounded-xl text-[10px] font-black uppercase transition-all ${!isManualMode ? "bg-white text-rhozly-primary shadow-sm" : "text-rhozly-on-surface/40"}`}
        >
          Auto Mode
        </button>
        <button
          onClick={() => setIsManualMode(true)}
          className={`flex-1 min-h-[44px] py-2 rounded-xl text-[10px] font-black uppercase transition-all ${isManualMode ? "bg-white text-rhozly-primary shadow-sm" : "text-rhozly-on-surface/40"}`}
        >
          Manual Mode
        </button>
      </div>

      {isManualMode && (
        <div className="flex gap-2 mb-6 animate-in slide-in-from-top-2">
          {(["Native Sensor", "Pixel Analysis"] as SensorMethod[]).map((m) => (
            <button
              key={m}
              onClick={() => setManualMethod(m)}
              className={`flex-1 min-h-[44px] py-2 rounded-xl text-[9px] font-black uppercase border transition-all ${manualMethod === m ? "bg-rhozly-primary text-white border-rhozly-primary" : "bg-white text-rhozly-on-surface/40 border-rhozly-outline/10"}`}
            >
              {m}
            </button>
          ))}
        </div>
      )}

      {nativeSensorUnavailable && (
        <div className="mb-6 p-4 bg-rhozly-surface-low rounded-2xl border border-rhozly-outline/20 flex gap-3 animate-in slide-in-from-top-2">
          <Info size={20} className="shrink-0 mt-0.5 text-rhozly-on-surface/60" />
          <div className="flex-1 flex flex-col gap-2">
            <p className="text-xs font-bold leading-snug text-rhozly-on-surface/80">
              Native light sensor not available on this device. Use Camera Method for a reading.
            </p>
            <button
              onClick={() => {
                setNativeSensorUnavailable(false);
                setIsManualMode(true);
                setManualMethod("Pixel Analysis");
              }}
              className="self-start px-3 py-1.5 rounded-xl bg-rhozly-primary text-white text-[10px] font-black uppercase tracking-widest"
            >
              Switch to Camera
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col items-center py-6">
        <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-4">Current Reading</p>
        <div
          className={`relative w-64 h-64 xl:w-80 xl:h-80 rounded-full flex flex-col items-center justify-center border-[12px] shadow-2xl transition-all duration-700 overflow-hidden ${method === "Pixel Analysis" && isScanning ? "border-rhozly-outline/20" : category.border} ${category.bg}`}
        >
          <video
            ref={videoRef}
            className={`absolute inset-0 w-full h-full object-cover transition-all duration-300 ${isScanning && method === "Pixel Analysis" ? "opacity-100" : "opacity-0"}`}
            style={{
              filter: `brightness(${Math.pow(1.5, exposureLevel)}) contrast(${1 + Math.abs(exposureLevel) * 0.1})`,
            }}
            playsInline
            muted
          />

          {isScanning && method === "Pixel Analysis" && (
            <div className="absolute inset-0 bg-black/20" />
          )}
          <div
            role="status"
            aria-live="polite"
            aria-label={isScanning ? `Light level: ${lux.toLocaleString()} lux, ${category.label}` : "Sensor paused"}
            className="relative z-10 flex flex-col items-center"
          >
            {isScanning ? (
              <>
                <span
                  className={`text-6xl xl:text-7xl font-black font-display tracking-tighter transition-colors duration-700 ${method === "Pixel Analysis" ? "text-white" : category.color}`}
                >
                  {lux.toLocaleString()}
                </span>
                <span
                  className={`text-sm font-bold uppercase tracking-widest mt-1 ${method === "Pixel Analysis" ? "text-white/70" : "opacity-50"}`}
                >
                  LUX
                </span>
                <div
                  className={`absolute -bottom-16 px-6 py-2 rounded-full font-black text-xs uppercase tracking-widest text-white shadow-lg transition-colors duration-700 ${category.banner}`}
                >
                  {category.label}
                </div>
              </>
            ) : method === "Initializing..." ? (
              <>
                <Loader2
                  size={48}
                  className="animate-spin text-rhozly-primary/30"
                />
                <span className="text-xs font-bold text-rhozly-on-surface/40 uppercase tracking-widest mt-3 animate-pulse">
                  Starting…
                </span>
              </>
            ) : (
              <Loader2
                size={48}
                className="animate-spin text-rhozly-primary/30"
              />
            )}
          </div>
        </div>

        <div className="mt-14 flex items-center gap-2 bg-rhozly-surface-lowest px-4 py-2 rounded-xl border border-rhozly-outline/10 shadow-sm">
          <div
            className={`w-2 h-2 rounded-full animate-pulse ${method === "Native Sensor" ? "bg-rhozly-primary" : "bg-rhozly-primary/50"}`}
          />
          <span className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/60">
            Active: {method}
          </span>
        </div>
      </div>

      {/* Lux band visualisation — gives readings a quick visual context */}
      <div className="w-full mt-2 mb-4" data-testid="lux-band">
        <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-2 text-center">
          Where this reading sits
        </p>
        <div className="relative h-3 rounded-full overflow-hidden shadow-inner bg-gradient-to-r from-slate-700 via-amber-200 to-yellow-300">
          {/* Marker for current reading */}
          <div
            className="absolute -top-1.5 w-1 h-6 rounded-full bg-rhozly-on-surface shadow-md transition-all duration-700"
            style={{ left: `calc(${bandPosition * 100}% - 2px)` }}
            aria-hidden="true"
          />
        </div>
        <div className="flex justify-between mt-1.5 text-[9px] font-black uppercase tracking-widest text-rhozly-on-surface/40">
          <span>Deep shade</span>
          <span>Shade</span>
          <span>Part-shade</span>
          <span>Sun</span>
          <span>Full sun</span>
        </div>
      </div>

      {/* Expected-vs-measured — only when an area with plants is selected */}
      {selectedAreaId && areaPlants.length > 0 && (
        <div className="w-full mb-4 bg-white rounded-2xl border border-rhozly-outline/15 p-4 space-y-2" data-testid="lux-expected-vs-measured">
          <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/45">
            Light needs of plants in this area
          </p>
          {areaPlants.slice(0, 5).map((p) => {
            const noPref = p.minLux === 0 && p.maxLux === 0;
            const underLit = !noPref && lux > 0 && lux < p.minLux;
            const overLit  = !noPref && lux > 0 && lux > p.maxLux;
            const ok       = !noPref && lux > 0 && lux >= p.minLux && lux <= p.maxLux;
            return (
              <div
                key={p.id}
                className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs font-bold ${
                  ok       ? "bg-emerald-50 text-emerald-800" :
                  underLit ? "bg-amber-50 text-amber-800" :
                  overLit  ? "bg-rose-50 text-rose-800" :
                             "bg-rhozly-surface-low text-rhozly-on-surface/60"
                }`}
                data-testid={`lux-plant-row-${p.id}`}
              >
                <span className="truncate">{p.name}</span>
                <span className="shrink-0 text-[10px] font-black uppercase tracking-widest">
                  {noPref
                    ? "No sun pref."
                    : ok
                      ? "Within range ✓"
                      : underLit
                        ? `Wants ≥ ${p.minLux.toLocaleString()} lx`
                        : `Prefers ≤ ${p.maxLux.toLocaleString()} lx`
                  }
                </span>
              </div>
            );
          })}
          {areaPlants.length > 5 && (
            <p className="text-[10px] font-bold text-rhozly-on-surface/40">
              +{areaPlants.length - 5} more plants in this area
            </p>
          )}
        </div>
      )}

      <div className="w-full space-y-4 mt-4">
        <div
          className="p-4 rounded-2xl flex gap-3 border shadow-sm bg-rhozly-surface-low text-rhozly-on-surface border-rhozly-outline/20"
        >
          <Info size={24} className="shrink-0 mt-0.5" />
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-black uppercase tracking-widest opacity-70">
              How to use
            </span>
            <p className="text-[12px] font-bold leading-snug">
              {method === "Native Sensor" ? (
                <>
                  Lay your phone flat with the{" "}
                  <strong className="text-rhozly-primary">
                    screen facing the light
                  </strong>
                  . The sensor is near your selfie camera.
                </>
              ) : (
                <>
                  Point your{" "}
                  <strong className="text-rhozly-primary">rear camera</strong>{" "}
                  directly at the light source. Adjust "Light Sensitivity" if the room
                  looks too dark.
                </>
              )}
            </p>
          </div>
        </div>

        {/* 🚀 FIXED: Changed the condition here to ensure the save box appears even if lux is exactly 0 */}
        {!isScanning ? (
          <div className="p-5 bg-rhozly-surface-low rounded-2xl border border-rhozly-outline/10 shadow-inner animate-in slide-in-from-bottom-4">
            {locationsLoading ? (
              <div className="flex items-center gap-3 py-2 mb-4">
                <MapPin size={18} className="shrink-0 text-rhozly-on-surface/40" />
                <p className="text-xs text-rhozly-on-surface/40 animate-pulse">
                  Loading areas...
                </p>
              </div>
            ) : locationsFetchError ? (
              <div className="flex items-center justify-between gap-3 py-2 mb-4">
                <p className="text-xs font-bold text-rhozly-on-surface/60">
                  Could not load areas.
                </p>
                <button
                  onClick={() => setLocationsRetryTick((t) => t + 1)}
                  className="text-xs font-black text-rhozly-primary hover:underline shrink-0"
                >
                  Retry
                </button>
              </div>
            ) : !locationsLoading && locations.length === 0 ? (
              <div className="flex items-center justify-between gap-3 py-2 mb-4">
                <div className="flex items-center gap-2">
                  <MapPin size={18} className="shrink-0 text-rhozly-on-surface/40" />
                  <p className="text-xs font-bold text-rhozly-on-surface/60">
                    No areas set up yet
                  </p>
                </div>
                <button
                  onClick={() => navigate("/management")}
                  className="text-xs font-black text-rhozly-primary hover:underline shrink-0 min-h-[44px] px-2 flex items-center"
                >
                  Go to Locations →
                </button>
              </div>
            ) : (
            <div className="flex flex-col gap-2 mb-4">
              <select
                value={selectedLocationId}
                onChange={(e) => {
                  setSelectedLocationId(e.target.value);
                  setSelectedAreaId("");
                }}
                className="w-full p-3 bg-white rounded-xl font-bold border-none text-sm shadow-sm"
              >
                <option value="">Select Location...</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </select>
              {selectedLocationId && availableAreas.length === 0 ? (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-rhozly-surface-low border border-rhozly-outline/10 text-xs font-bold text-rhozly-on-surface/50">
                  <MapPin size={14} />
                  No garden areas in this location — <button onClick={() => navigate("/management")} className="text-rhozly-primary hover:underline ml-1">add one</button>
                </div>
              ) : (
              <select
                value={selectedAreaId}
                onChange={(e) => setSelectedAreaId(e.target.value)}
                disabled={!selectedLocationId}
                className="w-full p-3 bg-white rounded-xl font-bold border-none text-sm shadow-sm disabled:opacity-50"
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
              )}
            </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => startScanning()}
                className="flex-1 py-4 bg-white text-rhozly-on-surface rounded-2xl font-black border border-rhozly-outline/10"
              >
                Scan Again
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
          {lastSaved && (
            <div className="mt-3 flex items-center gap-2 text-xs font-bold text-rhozly-primary/80">
              <Save size={12} />
              <span>Last saved: {lastSaved.lux.toLocaleString()} lx → {lastSaved.area}</span>
            </div>
          )}
          </div>
        ) : (
          <button
            onClick={() => stopScanning()}
            className="w-full py-5 rounded-2xl font-black text-lg shadow-xl flex items-center justify-center gap-2 bg-red-600 text-white active:scale-95 transition-all hover:bg-red-700"
          >
            <Circle size={20} fill="white" className="animate-pulse" /> Stop Scanning
          </button>
        )}
      </div>
    </div>
  );
}
