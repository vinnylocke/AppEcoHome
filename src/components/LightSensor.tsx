import React, { useState, useEffect, useRef } from "react";
import { Sun, Camera, Cpu, AlertTriangle, Loader2, Info } from "lucide-react";
import toast from "react-hot-toast";

// 🚀 NEW: Import the Native Capacitor Plugin
import { LightSensor as NativeLightSensor } from "@capgo/capacitor-light-sensor";

type SensorMethod = "Native Sensor" | "Camera Metadata" | "Pixel Analysis";

export default function LightSensor() {
  const [lux, setLux] = useState<number>(0);
  const [method, setMethod] = useState<SensorMethod | "Initializing...">(
    "Initializing...",
  );
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isManualMode, setIsManualMode] = useState(false);
  const [manualMethod, setManualMethod] =
    useState<SensorMethod>("Pixel Analysis");

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number>();

  // 🚀 NEW: Reference to store the Capacitor Listener
  const sensorListenerRef = useRef<any>(null);

  const targetLuxRef = useRef<number>(0);
  const currentLuxRef = useRef<number>(0);
  const lastMetadataRef = useRef<string>("");

  const getLightCategory = (luxValue: number) => {
    if (luxValue < 500)
      return {
        label: "Deep Shade",
        color: "text-gray-500",
        border: "border-gray-500",
        bg: "bg-gray-50",
      };
    if (luxValue < 2500)
      return {
        label: "Low Light",
        color: "text-blue-500",
        border: "border-blue-500",
        bg: "bg-blue-50",
      };
    if (luxValue < 10000)
      return {
        label: "Bright Indirect",
        color: "text-green-500",
        border: "border-green-500",
        bg: "bg-green-50",
      };
    if (luxValue < 20000)
      return {
        label: "Partial Sun",
        color: "text-amber-500",
        border: "border-amber-500",
        bg: "bg-amber-50",
      };
    return {
      label: "Direct Sun",
      color: "text-orange-500",
      border: "border-orange-500",
      bg: "bg-orange-50",
    };
  };

  const category = getLightCategory(lux);

  // --- PRONG 1: THE CAPACITOR NATIVE SENSOR ---
  const tryNativeSensor = async () => {
    try {
      // 1. Ask the hardware if the sensor exists (Fails gracefully on iOS)
      const { available } = await NativeLightSensor.isAvailable();
      if (!available) return false;

      // 2. Set up the listener to catch data coming over the bridge
      sensorListenerRef.current = await NativeLightSensor.addListener(
        "lightSensorChange",
        (data) => {
          if (!isManualMode || manualMethod === "Native Sensor") {
            targetLuxRef.current = Math.round(data.illuminance);
            setMethod("Native Sensor");
          }
        },
      );

      // 3. Start the hardware sensor (updates every 500ms for smoothness)
      await NativeLightSensor.start({ updateInterval: 500 });
      setIsScanning(true);

      // We still need the processing loop just for the visual smoothing effect
      processingLoop(true);
      return true;
    } catch (err) {
      console.error("Capacitor Light Sensor failed:", err);
      return false;
    }
  };

  // --- PRONG 2: METADATA ---
  const calculateLuxFromMetadata = (videoTrack: MediaStreamTrack) => {
    try {
      const settings: any = videoTrack.getSettings();
      if (settings.exposureTime && settings.iso) {
        const currentMeta = `${settings.exposureTime}-${settings.iso}`;

        if (
          lastMetadataRef.current !== "" &&
          lastMetadataRef.current === currentMeta
        ) {
          return null; // Data is frozen by WebView
        }
        lastMetadataRef.current = currentMeta;

        const N = 1.8;
        const t = settings.exposureTime / 1000000;
        const iso = settings.iso;
        return Math.round((250 * (N * N)) / (t * iso));
      }
    } catch (e) {
      return null;
    }
    return null;
  };

  // --- PRONG 3: ADVANCED SPOT-METER PIXEL ANALYSIS ---
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
      return Math.round(Math.pow(brightness / 255, 2.5) * 40000);
    }
    return 0;
  };

  // --- SCANNING LOOP ---
  const processingLoop = (isNativeOnly = false) => {
    if (!isNativeOnly) {
      if (!streamRef.current) return;
      const track = streamRef.current.getVideoTracks()[0];

      if (isManualMode) {
        if (manualMethod === "Camera Metadata") {
          const m = calculateLuxFromMetadata(track);
          targetLuxRef.current = m || 0;
          setMethod("Camera Metadata");
        } else if (manualMethod === "Pixel Analysis") {
          targetLuxRef.current = calculateLuxFromPixels();
          setMethod("Pixel Analysis");
        }
      } else {
        const metadataLux = calculateLuxFromMetadata(track);
        if (metadataLux !== null) {
          targetLuxRef.current = metadataLux;
          setMethod("Camera Metadata");
        } else {
          targetLuxRef.current = calculateLuxFromPixels();
          setMethod("Pixel Analysis");
        }
      }
    }

    // 🚀 SMOOTHING (Linear Interpolation)
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
        videoRef.current.play();
      }
      setIsScanning(true);
      processingLoop();
    } catch (err) {
      setError("Camera access denied.");
      toast.error("Need camera for this mode!");
    }
  };

  const startScanning = async () => {
    setError(null);
    targetLuxRef.current = 0;
    currentLuxRef.current = 0;

    // First, try the true native hardware approach
    const nativeSuccess = await tryNativeSensor();

    // If it fails (or user forces manual camera modes), fallback to video feed
    if (!nativeSuccess || (isManualMode && manualMethod !== "Native Sensor")) {
      await startCameraFallback();
    }
  };

  const stopScanning = async () => {
    // Stop native plugin
    try {
      await NativeLightSensor.stop();
      if (sensorListenerRef.current) {
        sensorListenerRef.current.remove();
      }
    } catch (e) {}

    if (animationFrameRef.current)
      cancelAnimationFrame(animationFrameRef.current);
    if (streamRef.current)
      streamRef.current.getTracks().forEach((t) => t.stop());
    setIsScanning(false);
  };

  useEffect(() => {
    startScanning();
    return () => {
      stopScanning();
    };
  }, [isManualMode, manualMethod]);

  return (
    <div className="max-w-md mx-auto h-full flex flex-col p-6 animate-in fade-in duration-500">
      <video ref={videoRef} className="hidden" playsInline muted />
      <canvas ref={canvasRef} className="hidden" />

      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-3xl font-black font-display text-rhozly-on-surface">
            Light Meter
          </h2>
          <p className="text-xs font-bold text-rhozly-on-surface/40 uppercase tracking-widest mt-1">
            Spot Meter Analysis
          </p>
        </div>
      </div>

      <div className="bg-rhozly-surface-low p-1.5 rounded-2xl flex items-center mb-8">
        <button
          onClick={() => setIsManualMode(false)}
          className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-tighter transition-all ${!isManualMode ? "bg-white text-rhozly-primary shadow-sm" : "text-rhozly-on-surface/40"}`}
        >
          Auto Logic
        </button>
        <button
          onClick={() => setIsManualMode(true)}
          className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-tighter transition-all ${isManualMode ? "bg-white text-rhozly-primary shadow-sm" : "text-rhozly-on-surface/40"}`}
        >
          Manual Mode
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center py-6">
        <div
          className={`relative w-64 h-64 rounded-full flex flex-col items-center justify-center border-[12px] shadow-2xl transition-all duration-700 ${category.bg} ${category.border}`}
        >
          {isScanning ? (
            <>
              <span
                className={`text-6xl font-black font-display tracking-tighter ${category.color} transition-colors duration-700`}
              >
                {lux.toLocaleString()}
              </span>
              <span className="text-sm font-bold uppercase tracking-widest opacity-50 mt-1">
                LUX
              </span>
              <div
                className={`absolute -bottom-4 px-6 py-2 rounded-full font-black text-xs uppercase tracking-widest text-white shadow-lg ${category.color.replace("text-", "bg-")}`}
              >
                {category.label}
              </div>
            </>
          ) : (
            <Loader2
              size={48}
              className="animate-spin text-rhozly-primary/30"
            />
          )}
        </div>

        {isManualMode ? (
          <div className="mt-10 flex flex-wrap justify-center gap-2">
            {(
              [
                "Native Sensor",
                "Camera Metadata",
                "Pixel Analysis",
              ] as SensorMethod[]
            ).map((m) => (
              <button
                key={m}
                onClick={() => setManualMethod(m)}
                className={`px-3 py-2 rounded-xl text-[9px] font-black uppercase border transition-all ${manualMethod === m ? "bg-rhozly-primary text-white border-rhozly-primary" : "bg-white text-rhozly-on-surface/40 border-rhozly-outline/10"}`}
              >
                {m}
              </button>
            ))}
          </div>
        ) : (
          <div className="mt-12 flex items-center gap-2 bg-white px-4 py-2 rounded-xl border border-rhozly-outline/10 shadow-sm">
            <div
              className={`w-2 h-2 rounded-full animate-pulse ${method === "Native Sensor" ? "bg-green-500" : "bg-amber-500"}`}
            />
            <span className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/60">
              Active: {method}
            </span>
          </div>
        )}
      </div>

      <div className="space-y-4 mt-auto">
        <div className="bg-blue-50 p-4 rounded-2xl flex gap-3 text-blue-800 border border-blue-100 shadow-sm">
          <Info size={20} className="shrink-0" />
          <p className="text-[11px] font-bold leading-tight">
            Point your phone directly at the light source from where the plant
            sits. If using Pixel mode, it analyzes the center of the camera.
          </p>
        </div>

        <button
          onClick={isScanning ? stopScanning : startScanning}
          className={`w-full py-5 rounded-2xl font-black text-lg shadow-xl flex items-center justify-center gap-2 transition-all active:scale-95 ${
            isScanning
              ? "bg-white text-rhozly-on-surface border border-rhozly-outline/20"
              : "bg-rhozly-primary text-white"
          }`}
        >
          {isScanning ? "Pause Sensor" : "Start Sensor"}
        </button>
      </div>
    </div>
  );
}
