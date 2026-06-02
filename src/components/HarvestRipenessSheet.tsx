import React, { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { X, Camera, Image as ImageIcon, Loader2, Sparkles, CheckCircle2, Clock } from "lucide-react";
import toast from "react-hot-toast";
import { Logger } from "../lib/errorHandler";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { PlantDoctorService, type AnalyseResult, type PhotoInput } from "../services/plantDoctorService";

// ─── Harvest Ripeness Sheet ────────────────────────────────────────────────
//
// A focused photo-capture modal for windowed Harvest tasks. The user snaps
// or uploads ONE photo of their crop; we send it to `analyse_comprehensive`
// with the task's plant as `targetPlant`. The edibility verdict drives one
// of three outcomes:
//
//   ripe       → fire `onReady`, parent opens the yield log + marks done.
//   near_ripe  → fire `onSnoozeFor(estimated_days_until_ripe ?? 3)`.
//   not_yet    → fire `onSnoozeFor(estimated_days_until_ripe ?? 7)`.
//   no answer  → toast + leave the sheet open so user can manually pick.
//
// Reuses the Wave-19 multi-image plumbing on the service (we pass an array
// of length 1).

interface Props {
  isOpen: boolean;
  onClose: () => void;
  homeId: string;
  taskTitle: string;
  /** Used as `targetPlant` so Gemini grounds the analysis. */
  plantName: string | null;
  /** Marks the harvest as "ready now" — parent should open the yield log. */
  onReady: () => void;
  /** Sets the task's `next_check_at` to today + N days. */
  onSnoozeFor: (days: number) => void;
}

const compressImage = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.src = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const MAX_WIDTH = 1000;
      const scale = MAX_WIDTH / img.width;
      canvas.width = MAX_WIDTH;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas context unavailable"));
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.78).split(",")[1]);
    };
    img.onerror = reject;
  });

export default function HarvestRipenessSheet({
  isOpen,
  onClose,
  homeId,
  taskTitle,
  plantName,
  onReady,
  onSnoozeFor,
}: Props) {
  const trapRef = useFocusTrap<HTMLDivElement>(isOpen);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [verdict, setVerdict] = useState<{
    label: string;
    detail: string;
    tone: "ripe" | "near" | "wait";
    snoozeDays?: number;
  } | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("That's not an image.");
    if (file.size > 8 * 1024 * 1024) return toast.error("Photo too large — please use one under 8MB.");
    setPhotoPreview(URL.createObjectURL(file));
    setPhotoFile(file);
    setVerdict(null);
  };

  const clear = () => {
    setPhotoPreview(null);
    setPhotoFile(null);
    setVerdict(null);
    if (cameraRef.current) cameraRef.current.value = "";
    if (libraryRef.current) libraryRef.current.value = "";
  };

  const handleAiCheck = async () => {
    if (!photoFile || isChecking) return;
    setIsChecking(true);
    try {
      const base64 = await compressImage(photoFile);
      const images: PhotoInput[] = [{ base64, mimeType: "image/jpeg", organ: "fruit" }];
      const result: AnalyseResult = await PlantDoctorService.analyseComprehensive({
        homeId,
        images,
        targetPlant: plantName ?? undefined,
      });
      const edibility = result?.edibility;
      if (!edibility || edibility.is_edible === false || !edibility.ripeness) {
        toast("Couldn't read ripeness from this photo — pick a manual option.", {
          duration: 5000,
        });
        setVerdict(null);
        return;
      }
      const days = typeof edibility.estimated_days_until_ripe === "number"
        ? Math.max(1, Math.min(28, edibility.estimated_days_until_ripe))
        : null;
      if (edibility.ripeness === "ripe" || edibility.ripeness === "overripe") {
        setVerdict({
          label: edibility.ripeness === "ripe" ? "Ripe — go pick!" : "Overripe — pick now",
          detail: edibility.notes ?? "Rhozly AI thinks this is ready to harvest.",
          tone: "ripe",
        });
      } else if (edibility.ripeness === "near_ripe") {
        setVerdict({
          label: days ? `Near ripe — about ${days} day${days === 1 ? "" : "s"}` : "Near ripe",
          detail: edibility.notes ?? "Almost there — give it a few more days.",
          tone: "near",
          snoozeDays: days ?? 3,
        });
      } else {
        setVerdict({
          label: days ? `Not yet — about ${days} day${days === 1 ? "" : "s"}` : "Not yet",
          detail: edibility.notes ?? "Still developing — check back later.",
          tone: "wait",
          snoozeDays: days ?? 7,
        });
      }
    } catch (err: any) {
      Logger.error("Harvest ripeness AI check failed", err, { homeId, plantName }, "Couldn't check ripeness — try again.");
    } finally {
      setIsChecking(false);
    }
  };

  const handleAccept = () => {
    if (!verdict) return;
    if (verdict.tone === "ripe") {
      onReady();
    } else if (typeof verdict.snoozeDays === "number") {
      onSnoozeFor(verdict.snoozeDays);
    }
    onClose();
  };

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-0 sm:p-6 bg-rhozly-bg/90 backdrop-blur-sm animate-in fade-in">
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-label="Check harvest ripeness with AI"
        className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl border border-rhozly-outline/10 flex flex-col max-h-[90dvh] overflow-hidden animate-in slide-in-from-bottom-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-rhozly-outline/10 bg-rhozly-surface-lowest flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-1 flex items-center gap-1.5">
              <Sparkles size={11} className="text-rhozly-primary" /> AI Ripeness Check
            </p>
            <h2 className="text-lg font-black text-rhozly-on-surface leading-tight">{taskTitle}</h2>
            {plantName && (
              <p className="text-xs font-bold text-rhozly-on-surface/55 italic">{plantName}</p>
            )}
          </div>
          <button
            type="button"
            data-testid="harvest-ripeness-close"
            onClick={onClose}
            aria-label="Close"
            className="p-2 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
          >
            <X size={18} className="text-gray-600" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <p className="text-sm text-rhozly-on-surface/65 leading-snug">
            Snap a clear photo of the crop. Rhozly AI will read ripeness and either confirm
            it's ready, or estimate how many days to wait — so you don't keep checking.
          </p>

          {photoPreview ? (
            <div className="relative">
              <img
                src={photoPreview}
                alt="Crop"
                className="w-full max-h-64 object-cover rounded-2xl border border-rhozly-outline/10"
              />
              <button
                type="button"
                onClick={clear}
                aria-label="Remove photo"
                className="absolute top-2 right-2 w-9 h-9 rounded-full bg-black/55 text-white flex items-center justify-center hover:bg-black/70"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <label
                htmlFor="harvest-ripe-camera"
                className="cursor-pointer inline-flex flex-col items-center justify-center gap-2 p-6 rounded-2xl bg-rhozly-surface-low hover:bg-rhozly-primary/5 hover:ring-2 hover:ring-rhozly-primary/20 transition-all text-rhozly-on-surface/70"
              >
                <Camera size={24} className="text-rhozly-primary" />
                <span className="text-[11px] font-black uppercase tracking-widest">Take Photo</span>
                <input
                  ref={cameraRef}
                  id="harvest-ripe-camera"
                  data-testid="harvest-ripeness-camera"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => handleFile(e.target.files?.[0])}
                  className="hidden"
                />
              </label>
              <label
                htmlFor="harvest-ripe-library"
                className="cursor-pointer inline-flex flex-col items-center justify-center gap-2 p-6 rounded-2xl bg-rhozly-surface-low hover:bg-rhozly-primary/5 hover:ring-2 hover:ring-rhozly-primary/20 transition-all text-rhozly-on-surface/70"
              >
                <ImageIcon size={24} className="text-rhozly-primary" />
                <span className="text-[11px] font-black uppercase tracking-widest">From Library</span>
                <input
                  ref={libraryRef}
                  id="harvest-ripe-library"
                  data-testid="harvest-ripeness-library"
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleFile(e.target.files?.[0])}
                  className="hidden"
                />
              </label>
            </div>
          )}

          {verdict && (
            <div
              data-testid="harvest-ripeness-verdict"
              className={`rounded-2xl p-4 border ${
                verdict.tone === "ripe"
                  ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                  : verdict.tone === "near"
                    ? "bg-amber-50 border-amber-200 text-amber-800"
                    : "bg-sky-50 border-sky-200 text-sky-800"
              }`}
            >
              <p className="font-black text-base mb-1 flex items-center gap-1.5">
                {verdict.tone === "ripe" ? <CheckCircle2 size={16} /> : <Clock size={16} />}
                {verdict.label}
              </p>
              <p className="text-xs font-semibold leading-snug">{verdict.detail}</p>
            </div>
          )}
        </div>

        <div className="p-5 border-t border-rhozly-outline/10 bg-rhozly-surface-lowest flex flex-col sm:flex-row gap-2">
          {verdict ? (
            <button
              type="button"
              data-testid="harvest-ripeness-accept"
              onClick={handleAccept}
              className="flex-1 py-3 bg-rhozly-primary text-white rounded-2xl font-black hover:opacity-90 transition-opacity min-h-[44px] flex items-center justify-center gap-2"
            >
              {verdict.tone === "ripe"
                ? "Mark Harvested"
                : `Snooze ${verdict.snoozeDays} day${verdict.snoozeDays === 1 ? "" : "s"}`}
            </button>
          ) : (
            <button
              type="button"
              data-testid="harvest-ripeness-check"
              onClick={handleAiCheck}
              disabled={!photoFile || isChecking}
              className="flex-1 py-3 bg-rhozly-primary text-white rounded-2xl font-black disabled:bg-rhozly-surface-low disabled:text-rhozly-on-surface/30 hover:opacity-90 transition-opacity min-h-[44px] flex items-center justify-center gap-2"
            >
              {isChecking ? (
                <>
                  <Loader2 size={18} className="animate-spin" /> Checking…
                </>
              ) : (
                <>
                  <Sparkles size={18} /> Check ripeness
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
