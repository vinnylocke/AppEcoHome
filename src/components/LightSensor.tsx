import React, { useState, useEffect, useRef } from "react";
import { Sun, Camera, Cpu, AlertTriangle, Loader2, Info } from "lucide-react";
import toast from "react-hot-toast";

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
    if (!("AmbientLightSensor" in window)) return false;

    try {
      // Check for permission state
      const result = await navigator.permissions.query({
        name: "ambient-light-sensor" as PermissionName,
      });

      if (result.state === "denied") {
        return false;
      }

      const sensor = new window.AmbientLightSensor({ frequency: 1 });
      sensor.onreading = () => {
        setLux(Math.round(sensor.illuminance));
        setMethod("Native Sensor");
      };
      sensor.onerror = (event: any) => {
        console.warn("Native sensor runtime error:", event.error.name);
        startCameraFallback();
      };

      sensor.start();
      sensorRef.current = sensor;
      setIsScanning(true);
      return true;
    } catch (err) {
      return false;
    }
  };

  // --- PRONG 2: METADATA CALCULATION ---
  // This calculates Lux based on Camera Exposure Settings (ISO & Shutter Speed)
  const calculateLuxFromMetadata = (videoTrack: MediaStreamTrack) => {
    const settings: any = videoTrack.getSettings();

    if (settings.exposureTime && settings.iso) {
      // Lux = (C * N^2) / (t * ISO)
      // C ≈ 250 (Calibration constant), N = 1.8 (Aperture), t = time in seconds
      const N = 1.8;
      const t = settings.exposureTime / 1000000; // Chrome usually provides this in microseconds
      const iso = settings.iso;

      const calculatedLux = (250 * (N * N)) / (t * iso);
      return Math.round(calculatedLux);
    }
    return null;
  };

  // --- PRONG 3: PIXEL ANALYSIS ---
  // This calculates Lux by looking at the actual brightness of the pixels
  const calculateLuxFromPixels = () => {
    if (!videoRef.current || !canvasRef.current) return 0;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    if (ctx && video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = 100; // Small size for performance
      canvas.height = 100;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
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

      // Heuristic curve to map 0-255 brightness to Lux
      return Math.round(Math.pow(brightness / 255, 2) * 20000);
    }
    return 0;
  };

  // --- SCANNING LOOP ---
  const processingLoop = () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];

    // Attempt Metadata (Prong 2)
    const metadataLux = calculateLuxFromMetadata(track);

    if (metadataLux !== null && metadataLux > 0) {
      setLux(metadataLux);
      setMethod("Camera Metadata");
    } else {
      // Fallback to Pixel Analysis (Prong 3)
      const pixelLux = calculateLuxFromPixels();
      setLux(pixelLux);
      setMethod("Pixel Analysis");
    }

    animationFrameRef.current = requestAnimationFrame(processingLoop);
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
      processingLoop(); // Start the loop
    } catch (err: any) {
      setError("Camera access denied or unavailable.");
      setIsScanning(false);
      setMethod("Initializing...");
      toast.error("Need camera access to measure light!");
    }
  };

  const startScanning = async () => {
    setError(null);
    const nativeSuccess = await tryNativeSensor();
    if (!nativeSuccess) {
      await startCameraFallback();
    }
  };

  const stopScanning = () => {
    if (sensorRef.current) sensorRef.current.stop();
    if (animationFrameRef.current)
      cancelAnimationFrame(animationFrameRef.current);
    if (streamRef.current)
      streamRef.current.getTracks().forEach((track) => track.stop());
    setIsScanning(false);
  };

  useEffect(() => {
    startScanning();
    return () => stopScanning();
  }, []);

  return (
    <div className="max-w-md mx-auto h-full flex flex-col p-6 animate-in fade-in duration-500">
      <video ref={videoRef} className="hidden" playsInline muted />
      <canvas ref={canvasRef} className="hidden" />

      <div className="flex justify-between items-start mb-8">
        <div>
          <h2 className="text-3xl font-black font-display text-rhozly-on-surface">
            Light Meter
          </h2>
          <p className="text-xs font-bold text-rhozly-on-surface/40 uppercase tracking-widest mt-1">
            Analyze plant placement
          </p>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center py-10">
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

        <div className="mt-12 flex items-center gap-2 bg-rhozly-surface-low px-4 py-2 rounded-xl border border-rhozly-outline/10">
          <span className="text-xs font-black uppercase tracking-widest text-rhozly-on-surface/60">
            Method: {method}
          </span>
        </div>
      </div>

      <div className="space-y-4 mt-auto">
        <div className="bg-blue-50 p-4 rounded-2xl flex gap-3 text-blue-800 border border-blue-100">
          <Info size={20} className="shrink-0 mt-0.5" />
          <p className="text-xs font-bold leading-relaxed">
            For the best reading, place your phone directly where the plant
            sits, facing the light source.
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
          {isScanning ? "Pause" : "Resume"}
        </button>
      </div>
    </div>
  );
}
