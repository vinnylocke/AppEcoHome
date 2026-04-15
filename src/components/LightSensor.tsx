import React, { useState, useEffect, useRef } from "react";
import {
  Sun,
  Camera,
  Cpu,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Info,
} from "lucide-react";
import toast from "react-hot-toast";

// Defining the global interface for the experimental Web API
declare global {
  interface Window {
    AmbientLightSensor: any;
  }
}

export default function LightSensor() {
  const [lux, setLux] = useState<number>(0);
  const [method, setMethod] = useState<
    "Initializing..." | "Native Sensor" | "Camera Metadata" | "Pixel Analysis"
  >("Initializing...");
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number>();
  const sensorRef = useRef<any>(null);

  // --- LUX CATEGORY LOGIC ---
  const getLightCategory = (luxValue: number) => {
    if (luxValue < 500)
      return { label: "Deep Shade", color: "text-gray-500", bg: "bg-gray-50" };
    if (luxValue < 2500)
      return { label: "Low Light", color: "text-blue-500", bg: "bg-blue-50" };
    if (luxValue < 10000)
      return {
        label: "Bright Indirect",
        color: "text-green-500",
        bg: "bg-green-50",
      };
    if (luxValue < 20000)
      return {
        label: "Partial Sun",
        color: "text-amber-500",
        bg: "bg-amber-50",
      };
    return {
      label: "Direct Sun",
      color: "text-orange-500",
      bg: "bg-orange-50",
    };
  };

  const category = getLightCategory(lux);

  // --- PRONG 1: NATIVE SENSOR ---
  const tryNativeSensor = async () => {
    try {
      if ("AmbientLightSensor" in window) {
        const sensor = new window.AmbientLightSensor();
        sensor.onreading = () => {
          setLux(Math.round(sensor.illuminance));
          setMethod("Native Sensor");
        };
        sensor.onerror = (event: any) => {
          console.warn(
            "Native sensor error, falling back to camera:",
            event.error.name,
          );
          startCameraFallback();
        };
        sensor.start();
        sensorRef.current = sensor;
        setIsScanning(true);
        return true;
      }
      return false;
    } catch (err) {
      console.warn("AmbientLightSensor not available or permission denied.");
      return false;
    }
  };

  // --- PRONGS 2 & 3: CAMERA FALLBACKS ---
  const startCameraFallback = async () => {
    setMethod("Pixel Analysis"); // Default assumption until proven otherwise
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

      // Prong 2 Attempt: Try to read ImageCapture metadata (Rarely supported in webviews)
      try {
        const track = stream.getVideoTracks()[0];
        const imageCapture = new (window as any).ImageCapture(track);
        // If we can successfully get photo settings, we might use exposure data here in the future
        await imageCapture.getPhotoSettings();
        // Note: Realistically, real-time EV tracking requires native Swift/Java.
        // We will immediately drop down to Pixel Analysis for the live feed.
      } catch (e) {
        // Fall down to Prong 3 silently
      }

      // Prong 3 Execution: Pixel Analysis Loop
      analyzePixels();
    } catch (err: any) {
      setError("Camera access denied or unavailable.");
      setIsScanning(false);
      setMethod("Initializing...");
      toast.error("Need camera access to measure light!");
    }
  };

  const analyzePixels = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    if (ctx && video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Sample a grid of pixels to save performance rather than every single pixel
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      let r = 0,
        g = 0,
        b = 0;
      let count = 0;

      for (let i = 0; i < data.length; i += 16) {
        // Skip every 4th pixel (16 bytes)
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
        count++;
      }

      // Calculate relative luminance
      r = r / count;
      g = g / count;
      b = b / count;
      const brightness = 0.2126 * r + 0.7152 * g + 0.0722 * b; // Standard luminance formula

      // Map 0-255 brightness to a fake "Lux" curve (Exponential because light is logarithmic)
      // Note: This is an estimation since cameras auto-expose.
      const estimatedLux = Math.pow(brightness / 255, 3) * 30000;

      setLux(Math.round(estimatedLux));
    }

    animationFrameRef.current = requestAnimationFrame(analyzePixels);
  };

  // --- LIFECYCLE MANAGEMENT ---
  const startScanning = async () => {
    setError(null);
    const nativeSuccess = await tryNativeSensor();
    if (!nativeSuccess) {
      await startCameraFallback();
    }
  };

  const stopScanning = () => {
    if (sensorRef.current) {
      sensorRef.current.stop();
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
    setIsScanning(false);
  };

  useEffect(() => {
    startScanning();
    return () => stopScanning(); // Cleanup on unmount
  }, []);

  return (
    <div className="max-w-md mx-auto h-full flex flex-col p-6 animate-in fade-in duration-500">
      {/* Hidden elements for pixel analysis */}
      <video ref={videoRef} className="hidden" playsInline muted />
      <canvas ref={canvasRef} className="hidden" />

      <div className="flex justify-between items-start mb-8">
        <div>
          <h2 className="text-3xl font-black font-display text-rhozly-on-surface">
            Light Meter
          </h2>
          <p className="text-xs font-bold text-rhozly-on-surface/40 uppercase tracking-widest mt-1">
            Measure ambient light
          </p>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center py-10">
        {/* BIG LUX READOUT GAUGE */}
        <div
          className={`relative w-64 h-64 rounded-full flex flex-col items-center justify-center border-[8px] shadow-2xl transition-colors duration-700 ${category.bg} ${category.color.replace("text-", "border-")}`}
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
          ) : error ? (
            <AlertTriangle size={48} className="text-red-400 mb-2" />
          ) : (
            <Loader2
              size={48}
              className="animate-spin text-rhozly-primary/30"
            />
          )}
        </div>

        {/* ACTIVE METHOD INDICATOR */}
        <div className="mt-12 flex items-center gap-2 bg-rhozly-surface-low px-4 py-2 rounded-xl border border-rhozly-outline/10">
          {method === "Initializing..." ? (
            <Loader2 size={14} className="animate-spin text-rhozly-primary" />
          ) : method === "Native Sensor" ? (
            <Cpu size={14} className="text-green-500" />
          ) : (
            <Camera size={14} className="text-amber-500" />
          )}
          <span className="text-xs font-black uppercase tracking-widest text-rhozly-on-surface/60">
            {method}
          </span>
        </div>

        {error && (
          <p className="mt-4 text-sm font-bold text-red-500 text-center px-4">
            {error}
          </p>
        )}
      </div>

      {/* CONTROLS */}
      <div className="space-y-4 mt-auto">
        <div className="bg-blue-50 p-4 rounded-2xl flex gap-3 text-blue-800 border border-blue-100">
          <Info size={20} className="shrink-0 mt-0.5" />
          <p className="text-xs font-bold leading-relaxed">
            Hold your phone near the plant's leaves, facing the main light
            source (like a window). Keep it steady for a few seconds for an
            accurate reading.
          </p>
        </div>

        <button
          onClick={isScanning ? stopScanning : startScanning}
          className={`w-full py-5 rounded-2xl font-black text-lg shadow-xl flex items-center justify-center gap-2 transition-all active:scale-95 ${
            isScanning
              ? "bg-rhozly-surface-lowest text-rhozly-on-surface border border-rhozly-outline/20"
              : "bg-rhozly-primary text-white"
          }`}
        >
          {isScanning ? "Pause Meter" : "Start Meter"}
        </button>
      </div>
    </div>
  );
}
