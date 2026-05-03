import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import { LightSensor as NativeLightSensor } from "@capgo/capacitor-light-sensor";
import {
  getLightFitness,
  type LuxRange,
} from "../lib/plantLightUtils";

interface PlantLightReaderProps {
  plantName: string;
  optimalRange: LuxRange | null;
  onClose: () => void;
}

function getLightCategory(luxValue: number) {
  if (luxValue < 500)
    return { label: "Deep Shade", color: "text-gray-500", border: "border-gray-400", bg: "bg-gray-50", banner: "bg-gray-500" };
  if (luxValue < 2500)
    return { label: "Low Light", color: "text-blue-500", border: "border-blue-400", bg: "bg-blue-50", banner: "bg-blue-500" };
  if (luxValue < 10000)
    return { label: "Bright Indirect", color: "text-green-500", border: "border-green-400", bg: "bg-green-50", banner: "bg-green-500" };
  if (luxValue < 20000)
    return { label: "Partial Sun", color: "text-amber-500", border: "border-amber-400", bg: "bg-amber-50", banner: "bg-amber-500" };
  return { label: "Direct Sun", color: "text-orange-500", border: "border-orange-400", bg: "bg-orange-50", banner: "bg-orange-500" };
}

export default function PlantLightReader({ plantName, optimalRange, onClose }: PlantLightReaderProps) {
  const [lux, setLux] = useState(0);
  const [isScanning, setIsScanning] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number>();
  const sensorListenerRef = useRef<any>(null);
  const targetLuxRef = useRef(0);
  const currentLuxRef = useRef(0);

  const calculateLuxFromPixels = () => {
    if (!videoRef.current || !canvasRef.current) return 0;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (ctx && video.readyState >= 2) {
      const cropSize = Math.min(video.videoWidth, video.videoHeight) * 0.5;
      const startX = (video.videoWidth - cropSize) / 2;
      const startY = (video.videoHeight - cropSize) / 2;
      canvas.width = 64;
      canvas.height = 64;
      ctx.drawImage(video, startX, startY, cropSize, cropSize, 0, 0, 64, 64);
      const data = ctx.getImageData(0, 0, 64, 64).data;
      let r = 0, g = 0, b = 0;
      for (let i = 0; i < data.length; i += 4) {
        r += data[i]; g += data[i + 1]; b += data[i + 2];
      }
      const count = data.length / 4;
      const brightness = 0.2126 * (r / count) + 0.7152 * (g / count) + 0.0722 * (b / count);
      const rawLux = Math.pow(brightness / 255, 2.5) * 40000;
      return Math.round(rawLux * 0.2);
    }
    return 0;
  };

  const [usingNative, setUsingNative] = useState(false);

  const processingLoop = (nativeOnly = false) => {
    if (!nativeOnly) {
      if (!streamRef.current) return;
      targetLuxRef.current = calculateLuxFromPixels();
    }
    currentLuxRef.current += (targetLuxRef.current - currentLuxRef.current) * 0.1;
    setLux(Math.round(currentLuxRef.current));
    animationFrameRef.current = requestAnimationFrame(() => processingLoop(nativeOnly));
  };

  const startCameraFallback = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setIsScanning(true);
      setUsingNative(false);
      processingLoop(false);
    } catch {
      setIsScanning(false);
    }
  };

  const startScanning = async () => {
    targetLuxRef.current = 0;
    currentLuxRef.current = 0;
    try {
      const { available } = await NativeLightSensor.isAvailable();
      if (available) {
        sensorListenerRef.current = await NativeLightSensor.addListener(
          "lightSensorChange",
          (data) => { targetLuxRef.current = Math.round(data.illuminance); },
        );
        await NativeLightSensor.start({ updateInterval: 500 });
        setIsScanning(true);
        setUsingNative(true);
        processingLoop(true);
        return;
      }
    } catch {
      // fall through to camera
    }
    await startCameraFallback();
  };

  const stopScanning = async () => {
    try {
      await NativeLightSensor.stop();
      if (sensorListenerRef.current) sensorListenerRef.current.remove();
    } catch { /* native may not be running */ }
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    setIsScanning(false);
  };

  useEffect(() => {
    startScanning();
    return () => { stopScanning(); };
  }, []);

  const category = getLightCategory(lux);
  const fitness = optimalRange ? getLightFitness(lux, optimalRange) : null;

  return createPortal(
    <div className="fixed inset-0 z-[200] bg-rhozly-background flex flex-col animate-in fade-in duration-200">
      <canvas ref={canvasRef} className="hidden" />

      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-safe pt-6 pb-4 border-b border-rhozly-outline/10">
        <button
          data-testid="plant-light-reader-back"
          onClick={onClose}
          className="w-9 h-9 flex items-center justify-center rounded-2xl bg-rhozly-surface text-rhozly-on-surface"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <p className="text-[10px] font-black text-rhozly-on-surface/40 uppercase tracking-widest">
            Light Reading
          </p>
          <h2 className="text-base font-black text-rhozly-on-surface leading-tight">{plantName}</h2>
        </div>
      </div>

      {/* Sensor circle */}
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <div
          className={`relative w-64 h-64 rounded-full flex flex-col items-center justify-center border-[12px] shadow-2xl overflow-hidden transition-all duration-700 ${
            !usingNative && isScanning ? "border-rhozly-outline/20" : category.border
          } ${category.bg}`}
        >
          <video
            ref={videoRef}
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
              isScanning && !usingNative ? "opacity-100" : "opacity-0"
            }`}
            playsInline
            muted
          />
          {isScanning && !usingNative && <div className="absolute inset-0 bg-black/20" />}

          <div className="relative z-10 flex flex-col items-center">
            {isScanning ? (
              <>
                <span
                  data-testid="plant-light-reader-lux"
                  className={`text-6xl font-black font-display tracking-tighter transition-colors duration-700 ${
                    !usingNative ? "text-white" : category.color
                  }`}
                >
                  {lux.toLocaleString()}
                </span>
                <span className={`text-sm font-bold uppercase tracking-widest mt-1 ${!usingNative ? "text-white/70" : "opacity-50"}`}>
                  LUX
                </span>
                <div
                  data-testid="plant-light-reader-category"
                  className={`absolute -bottom-16 px-6 py-2 rounded-full font-black text-xs uppercase tracking-widest text-white shadow-lg transition-colors duration-700 ${category.banner}`}
                >
                  {category.label}
                </div>
              </>
            ) : (
              <Loader2 size={48} className="animate-spin text-rhozly-primary/30" />
            )}
          </div>
        </div>

        {/* Fitness badge */}
        <div className="mt-16">
          {fitness ? (
            <div
              data-testid="plant-light-reader-fitness-badge"
              className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-black text-sm ${fitness.bgColor} ${fitness.color}`}
            >
              <span>{category.label}</span>
              <span className="opacity-40">·</span>
              <span>{fitness.rating}</span>
            </div>
          ) : (
            <div className="h-12" />
          )}
        </div>

        {/* Optimal range info */}
        {optimalRange && (
          <p className="mt-3 text-xs font-bold text-rhozly-on-surface/40 text-center">
            Optimal for {plantName}:{" "}
            {optimalRange.min.toLocaleString()}–{optimalRange.max.toLocaleString()} lux
          </p>
        )}

        {/* Fitness description */}
        {fitness && (
          <p className={`mt-2 text-xs font-bold text-center ${fitness.color}`}>
            {fitness.description}
          </p>
        )}
      </div>

      {/* Method indicator */}
      <div className="flex justify-center pb-10">
        <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl border border-rhozly-outline/10 shadow-sm">
          <div className={`w-2 h-2 rounded-full animate-pulse ${usingNative ? "bg-green-500" : "bg-amber-500"}`} />
          <span className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/60">
            {usingNative ? "Native Sensor" : "Pixel Analysis"}
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
