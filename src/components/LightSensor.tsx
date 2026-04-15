import React, { useState, useEffect, useRef } from "react";
import { Sun, Camera, Cpu, AlertTriangle, Loader2, Info } from "lucide-react";
import toast from "react-hot-toast";

// 🚀 Native Capacitor Plugin
import { LightSensor as NativeLightSensor } from "@capgo/capacitor-light-sensor";

// 🚀 Removed Metadata mode
type SensorMethod = "Native Sensor" | "Pixel Analysis";

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
  const sensorListenerRef = useRef<any>(null);

  const targetLuxRef = useRef<number>(0);
  const currentLuxRef = useRef<number>(0);

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
      const { available } = await NativeLightSensor.isAvailable();
      if (!available) return false;

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
      return true;
    } catch (err) {
      console.error("Capacitor Light Sensor failed:", err);
      return false;
    }
  };

  // --- PRONG 2: ADVANCED SPOT-METER PIXEL ANALYSIS ---
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

      // If we are here, we are using Pixel Analysis
      targetLuxRef.current = calculateLuxFromPixels();
      setMethod("Pixel Analysis");
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

      // 🚀 NEW: Attempt to lock the camera's Auto-Exposure
      const track = stream.getVideoTracks()[0];
      try {
        const capabilities: any = track.getCapabilities();
        if (capabilities.exposureMode) {
          if (capabilities.exposureMode.includes("manual")) {
            await track.applyConstraints({
              advanced: [{ exposureMode: "manual" }],
            } as any);
            toast.success("Exposure locked for accuracy!", { icon: "🔒" });
          } else if (capabilities.exposureMode.includes("none")) {
            await track.applyConstraints({
              advanced: [{ exposureMode: "none" }],
            } as any);
            toast.success("Auto-exposure disabled!", { icon: "🔒" });
          }
        }
      } catch (e) {
        console.warn("WebView blocked exposure lock.", e);
      }

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

    const nativeSuccess = await tryNativeSensor();

    if (!nativeSuccess || (isManualMode && manualMethod !== "Native Sensor")) {
      await startCameraFallback();
    }
  };

  const stopScanning = async () => {
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
        {/* 🚀 THE GAUGE WITH VIDEO BACKGROUND */}
        <div
          className={`relative w-64 h-64 rounded-full flex flex-col items-center justify-center border-[12px] shadow-2xl transition-all duration-700 overflow-hidden ${
            method === "Pixel Analysis" && isScanning
              ? "border-rhozly-outline/20"
              : category.border
          } ${category.bg}`}
        >
          {/* Live Camera Feed */}
          <video
            ref={videoRef}
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${
              isScanning && method === "Pixel Analysis"
                ? "opacity-100"
                : "opacity-0"
            }`}
            playsInline
            muted
          />

          {/* Dark Overlay so text is readable over the camera */}
          {isScanning && method === "Pixel Analysis" && (
            <div className="absolute inset-0 bg-black/40" />
          )}

          {/* Text Content */}
          <div className="relative z-10 flex flex-col items-center">
            {isScanning ? (
              <>
                <span
                  className={`text-6xl font-black font-display tracking-tighter transition-colors duration-700 ${
                    method === "Pixel Analysis" ? "text-white" : category.color
                  }`}
                >
                  {lux.toLocaleString()}
                </span>
                <span
                  className={`text-sm font-bold uppercase tracking-widest mt-1 ${
                    method === "Pixel Analysis" ? "text-white/70" : "opacity-50"
                  }`}
                >
                  LUX
                </span>
                <div
                  className={`absolute -bottom-16 px-6 py-2 rounded-full font-black text-xs uppercase tracking-widest text-white shadow-lg transition-colors duration-700 ${category.color.replace(
                    "text-",
                    "bg-",
                  )}`}
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
        </div>

        {isManualMode ? (
          <div className="mt-14 flex flex-wrap justify-center gap-2">
            {(["Native Sensor", "Pixel Analysis"] as SensorMethod[]).map(
              (m) => (
                <button
                  key={m}
                  onClick={() => setManualMethod(m)}
                  className={`px-3 py-2 rounded-xl text-[9px] font-black uppercase border transition-all ${
                    manualMethod === m
                      ? "bg-rhozly-primary text-white border-rhozly-primary"
                      : "bg-white text-rhozly-on-surface/40 border-rhozly-outline/10"
                  }`}
                >
                  {m}
                </button>
              ),
            )}
          </div>
        ) : (
          <div className="mt-14 flex items-center gap-2 bg-white px-4 py-2 rounded-xl border border-rhozly-outline/10 shadow-sm">
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
        {/* 🚀 DYNAMIC INSTRUCTION BOX */}
        <div
          className={`p-4 rounded-2xl flex gap-3 border shadow-sm transition-colors duration-300 ${
            method === "Native Sensor"
              ? "bg-green-50 text-green-900 border-green-200"
              : "bg-blue-50 text-blue-900 border-blue-200"
          }`}
        >
          <Info size={24} className="shrink-0 mt-0.5" />
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-black uppercase tracking-widest opacity-70">
              How to hold your phone
            </span>
            <p className="text-[12px] font-bold leading-snug">
              {method === "Initializing..." && "Waiting for sensor data..."}

              {method === "Native Sensor" && (
                <>
                  Lay your phone flat with the{" "}
                  <strong className="text-green-700">
                    screen facing the light source
                  </strong>
                  . The sensor is near your selfie camera.
                </>
              )}

              {method === "Pixel Analysis" && (
                <>
                  Point your{" "}
                  <strong className="text-blue-700">rear camera</strong>{" "}
                  directly at the light source. The circle shows exactly what
                  the meter is seeing.
                </>
              )}
            </p>
          </div>
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
