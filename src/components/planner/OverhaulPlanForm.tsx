import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Loader2, X, ChevronLeft, ChevronRight,
  Sparkles, Camera, Image as ImageIcon, Lock,
  Eye, Heart, Frown, MessageSquare, Brush,
} from "lucide-react";
import toast from "react-hot-toast";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { generateGardenOverhaul } from "../../services/gardenOverhaulService";
import { IMAGEN_PRICING } from "../../lib/geminiPricing";
import { Logger } from "../../lib/errorHandler";
import PhotoHighlighter, { type PhotoHighlighterHandle } from "./PhotoHighlighter";

interface Props {
  homeId: string;
  isOpen: boolean;
  onClose: () => void;
  onSubmitted: (planId: string) => void;
  hasAccess: boolean;
}

const AESTHETICS = [
  "Open to suggestions",
  "Natural / wild",
  "Modern minimalist",
  "Cottage abundance",
  "Productive / kitchen garden",
  "Wildlife haven",
  "Mediterranean",
  "Japanese-inspired",
] as const;

const CONCEPT_COUNT = 3;
const TOTAL_STEPS = 4;

/**
 * Garden Overhaul wizard — mirrors NewPlanForm's UI exactly so the
 * Planner has a consistent feel. Four locked steps:
 *
 *   1 — The Photo: capture/upload a garden photo. Progression
 *       requires a photo selected.
 *   2 — Highlight (optional): paint over areas the user wants the AI
 *       to focus on. Skippable — full-garden redesign when empty.
 *   3 — The Vision: free-text likes / dislikes / wants + aesthetic.
 *       Progression requires at least one text field filled.
 *   4 — Ready: review + cost estimate + generate.
 *
 * Each step is gated — Next button disabled until requirements met.
 */
export default function OverhaulPlanForm({ homeId, isOpen, onClose, onSubmitted, hasAccess }: Props) {
  const trapRef = useFocusTrap<HTMLDivElement>(isOpen);
  const [step, setStep] = useState(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [hasHighlights, setHasHighlights] = useState(false);
  const highlighterRef = useRef<PhotoHighlighterHandle>(null);
  const [likes, setLikes] = useState("");
  const [dislikes, setDislikes] = useState("");
  const [wants, setWants] = useState("");
  const [aesthetic, setAesthetic] = useState<string>("Open to suggestions");

  // Lock page scroll while the modal is open — same as NewPlanForm.
  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  const estimatedCostUsd = useMemo(() => {
    const perImage = IMAGEN_PRICING["gemini-2.5-flash-image"] ?? 0.039;
    return 0.05 + perImage * CONCEPT_COUNT;
  }, []);

  const handlePhotoChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) {
      toast.error("Photo too large — please use one under 8MB.");
      return;
    }
    setPhotoFile(f);
    const reader = new FileReader();
    reader.onload = () => setPhotoPreviewUrl(reader.result as string);
    reader.readAsDataURL(f);
  }, []);

  const fileToBase64 = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, ""));
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }, []);

  const canAdvanceFromStep1 = !!photoFile;
  // Step 2 (Highlight) is always advanceable — it's optional. The user
  // can paint nothing and still proceed.
  const canAdvanceFromStep2 = true;
  const canAdvanceFromStep3 = !!likes.trim() || !!dislikes.trim() || !!wants.trim();
  const canAdvance =
    step === 1 ? canAdvanceFromStep1 :
    step === 2 ? canAdvanceFromStep2 :
    step === 3 ? canAdvanceFromStep3 :
    true;

  const handleSubmit = useCallback(async () => {
    if (isGenerating) return;
    if (!photoFile) { toast.error("Please add a photo first."); setStep(1); return; }
    if (!likes.trim() && !dislikes.trim() && !wants.trim()) {
      toast.error("Tell me at least one thing — what you like, dislike, or want.");
      setStep(3);
      return;
    }
    setIsGenerating(true);
    try {
      const base64 = await fileToBase64(photoFile);
      // Composite the user's annotation strokes onto the photo. Null
      // when the user skipped the highlight step entirely — edge fn
      // falls back to full-garden redesign behaviour.
      const annotatedBase64 = highlighterRef.current?.getAnnotatedBase64() ?? null;
      const result = await generateGardenOverhaul({
        homeId,
        photoBase64: base64,
        mimeType: photoFile.type || "image/jpeg",
        annotatedPhotoBase64: annotatedBase64 ?? undefined,
        likes: likes.trim(),
        dislikes: dislikes.trim(),
        wants: wants.trim(),
        aesthetic: aesthetic === "Open to suggestions" ? undefined : aesthetic,
        conceptCount: CONCEPT_COUNT,
      });
      toast.success("Overhaul started — your concepts will land in 30-60s.", { duration: 6000 });
      onSubmitted(result.plan_id);
    } catch (err) {
      Logger.error("Garden overhaul submit failed", err);
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Couldn't start the overhaul — ${msg}`);
    } finally {
      setIsGenerating(false);
    }
  }, [isGenerating, photoFile, likes, dislikes, wants, aesthetic, homeId, onSubmitted, fileToBase64]);

  if (!isOpen) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 sm:p-6 bg-rhozly-bg/95 backdrop-blur-sm animate-in fade-in">
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-label="Overhaul existing garden"
        className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl border border-rhozly-outline/10 flex flex-col max-h-[100dvh] sm:max-h-[90vh] overflow-hidden relative animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — same shape as NewPlanForm */}
        <div className="p-5 sm:p-6 border-b border-rhozly-outline/10 bg-rhozly-surface-lowest shrink-0">
          <div className="flex justify-between items-start mb-3">
            <h2 className="text-xl sm:text-2xl font-black flex items-center gap-2 text-rhozly-on-surface">
              <Sparkles className="text-rhozly-primary shrink-0" size={24} />
              <span className="truncate">Overhaul Existing Garden</span>
            </h2>
            <button
              onClick={onClose}
              disabled={isGenerating}
              data-testid="overhaul-plan-form-close"
              className="p-2.5 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors shrink-0 ml-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Close dialog"
            >
              <X size={20} className="text-gray-600" />
            </button>
          </div>

          {/* Progress Indicator — same shape as NewPlanForm */}
          {hasAccess && (
            <div className="flex items-center gap-2" role="navigation" aria-label="Form progress">
              <div className="flex items-center gap-2 flex-1">
                {[1, 2, 3, 4].map((stepNum) => (
                  <div key={stepNum} className="flex items-center gap-2 flex-1">
                    <div
                      className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-black transition-colors ${
                        stepNum === step
                          ? "bg-rhozly-primary text-white"
                          : stepNum < step
                          ? "bg-green-500 text-white"
                          : "bg-gray-200 text-gray-400"
                      }`}
                      aria-current={stepNum === step ? "step" : undefined}
                    >
                      {stepNum}
                      <span className="sr-only">
                        Step {stepNum}:{" "}
                        {stepNum === 1 ? "The Photo"
                          : stepNum === 2 ? "Highlight (optional)"
                          : stepNum === 3 ? "The Vision"
                          : "Ready"}
                        {stepNum < step ? " (completed)" : stepNum === step ? " (current)" : ""}
                      </span>
                    </div>
                    {stepNum < TOTAL_STEPS && (
                      <div
                        className={`h-1 flex-1 rounded-full transition-colors ${
                          stepNum < step ? "bg-green-500" : "bg-gray-200"
                        }`}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 custom-scrollbar bg-white">
          {!hasAccess ? (
            <div className="py-8 text-center space-y-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-3xl bg-rhozly-primary/10 text-rhozly-primary">
                <Lock size={26} />
              </div>
              <h3 className="font-black text-rhozly-on-surface text-lg">
                Garden Overhaul is a Sage+ feature
              </h3>
              <p className="text-sm text-rhozly-on-surface/65 max-w-sm mx-auto leading-snug">
                Upload a photo of your current garden and Rhozly uses Gemini Vision + AI image transformation to redesign it — same photo, new garden. Available on Sage and Evergreen subscriptions.
              </p>
              <p className="text-[11px] text-rhozly-on-surface/55">
                ~${estimatedCostUsd.toFixed(2)} per overhaul on Gemini's paid tier.
              </p>
            </div>
          ) : step === 1 ? (
            <Step1Photo
              photoPreviewUrl={photoPreviewUrl}
              onPhotoChange={handlePhotoChange}
              onClearPhoto={() => {
                setPhotoFile(null);
                setPhotoPreviewUrl(null);
                setHasHighlights(false);
              }}
            />
          ) : step === 2 ? (
            <Step2Highlight
              photoPreviewUrl={photoPreviewUrl}
              highlighterRef={highlighterRef}
              onHasStrokesChange={setHasHighlights}
            />
          ) : step === 3 ? (
            <Step3Vision
              likes={likes} setLikes={setLikes}
              dislikes={dislikes} setDislikes={setDislikes}
              wants={wants} setWants={setWants}
              aesthetic={aesthetic} setAesthetic={setAesthetic}
            />
          ) : (
            <Step4Ready
              photoPreviewUrl={photoPreviewUrl}
              likes={likes} dislikes={dislikes} wants={wants}
              aesthetic={aesthetic}
              conceptCount={CONCEPT_COUNT}
              estimatedCostUsd={estimatedCostUsd}
              hasHighlights={hasHighlights}
            />
          )}
        </div>

        {/* Footer — same shape as NewPlanForm */}
        <div className="p-5 sm:p-6 border-t border-rhozly-outline/10 bg-rhozly-surface-lowest shrink-0 flex items-center gap-3">
          {step > 1 && hasAccess && (
            <button
              onClick={() => setStep(step - 1)}
              disabled={isGenerating}
              className="py-4 px-5 bg-gray-100 hover:bg-gray-200 text-rhozly-on-surface rounded-2xl font-black transition-all duration-200 hover:scale-105 active:scale-95 flex items-center justify-center gap-2 min-h-[44px] disabled:opacity-50"
            >
              <ChevronLeft size={20} /> Back
            </button>
          )}

          {!hasAccess ? (
            <button
              onClick={onClose}
              className="flex-1 py-4 bg-rhozly-primary hover:bg-rhozly-primary/90 text-white rounded-2xl font-black shadow-lg transition-all duration-200 hover:scale-105 active:scale-95 flex items-center justify-center gap-2 min-h-[44px]"
            >
              Close
            </button>
          ) : step < TOTAL_STEPS ? (
            <button
              onClick={() => canAdvance && setStep(step + 1)}
              disabled={!canAdvance}
              data-testid={`overhaul-plan-form-next-${step}`}
              title={!canAdvance
                ? (step === 1 ? "Add a photo to continue"
                  : step === 2 ? "Tell me at least one thing (likes / dislikes / wants)"
                  : "")
                : ""}
              className="flex-1 py-4 bg-rhozly-primary hover:bg-rhozly-primary/90 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed disabled:shadow-none disabled:hover:scale-100 text-white rounded-2xl font-black shadow-lg transition-all duration-200 hover:scale-105 active:scale-95 flex items-center justify-center gap-2 min-h-[44px]"
            >
              Next Step <ChevronRight size={20} />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={isGenerating}
              data-testid="overhaul-plan-form-submit"
              className="flex-1 py-4 bg-rhozly-primary hover:bg-rhozly-primary/90 disabled:bg-rhozly-primary/70 text-white rounded-2xl font-black shadow-lg transition-all duration-200 hover:scale-105 active:scale-95 disabled:scale-100 flex items-center justify-center gap-2 min-h-[44px]"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="animate-spin" size={20} /> Generating Overhaul...
                </>
              ) : (
                <>
                  <Sparkles size={20} /> Generate Overhaul
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

// ── Step 1 — The Photo ─────────────────────────────────────────────

function Step1Photo({
  photoPreviewUrl, onPhotoChange, onClearPhoto,
}: {
  photoPreviewUrl: string | null;
  onPhotoChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClearPhoto: () => void;
}) {
  return (
    <div className="space-y-5 animate-in slide-in-from-right-4">
      <div className="flex items-center gap-2 mb-2 text-rhozly-primary border-b border-rhozly-outline/5 pb-3">
        <Camera size={20} />
        <h3 className="font-black text-lg">The Photo</h3>
      </div>

      <p className="text-sm text-rhozly-on-surface/65 leading-snug">
        Add a photo of your current garden. The AI will transform <em>this exact garden</em> — not invent a new one — so a clear daylight photo of the whole space gets the best results.
      </p>

      {photoPreviewUrl ? (
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 ml-1">
            Your photo
          </label>
          <div className="relative">
            <img
              src={photoPreviewUrl}
              alt="Your garden"
              className="w-full max-h-80 object-cover rounded-2xl border border-rhozly-outline/10"
            />
            <button
              type="button"
              onClick={onClearPhoto}
              data-testid="overhaul-plan-form-clear-photo"
              className="absolute top-3 right-3 inline-flex items-center justify-center w-10 h-10 rounded-full bg-black/55 text-white hover:bg-black/70"
              aria-label="Remove photo"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 ml-1">
            Choose Photo *
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label
              htmlFor="overhaul-photo-camera"
              className="cursor-pointer inline-flex flex-col items-center justify-center gap-2 p-6 rounded-2xl bg-rhozly-surface-low hover:bg-rhozly-primary/5 hover:ring-2 hover:ring-rhozly-primary/20 transition-all text-rhozly-on-surface/70"
            >
              <Camera size={26} className="text-rhozly-primary" />
              <span className="text-[11px] font-black uppercase tracking-widest">Take Photo</span>
              <input
                id="overhaul-photo-camera"
                data-testid="overhaul-photo-camera"
                type="file"
                accept="image/*"
                capture="environment"
                onChange={onPhotoChange}
                className="hidden"
              />
            </label>
            <label
              htmlFor="overhaul-photo-library"
              className="cursor-pointer inline-flex flex-col items-center justify-center gap-2 p-6 rounded-2xl bg-rhozly-surface-low hover:bg-rhozly-primary/5 hover:ring-2 hover:ring-rhozly-primary/20 transition-all text-rhozly-on-surface/70"
            >
              <ImageIcon size={26} className="text-rhozly-primary" />
              <span className="text-[11px] font-black uppercase tracking-widest">From Library</span>
              <input
                id="overhaul-photo-library"
                data-testid="overhaul-photo-library"
                type="file"
                accept="image/*"
                onChange={onPhotoChange}
                className="hidden"
              />
            </label>
          </div>
        </div>
      )}

      <div className="rounded-2xl bg-rhozly-surface-low/60 border border-rhozly-outline/10 p-4">
        <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-2">
          Tips for best results
        </p>
        <ul className="text-xs text-rhozly-on-surface/65 space-y-1 list-disc pl-4">
          <li>Photo in good daylight, eye-level</li>
          <li>Capture the whole space, not just one corner</li>
          <li>Up to 8MB</li>
        </ul>
      </div>
    </div>
  );
}

// ── Step 2 — Highlight (optional) ──────────────────────────────────

function Step2Highlight({
  photoPreviewUrl,
  highlighterRef,
  onHasStrokesChange,
}: {
  photoPreviewUrl: string | null;
  highlighterRef: React.RefObject<PhotoHighlighterHandle>;
  onHasStrokesChange: (has: boolean) => void;
}) {
  return (
    <div className="space-y-5 animate-in slide-in-from-right-4">
      <div className="flex items-center gap-2 mb-2 text-rhozly-primary border-b border-rhozly-outline/5 pb-3">
        <Brush size={20} />
        <h3 className="font-black text-lg">Highlight <span className="text-rhozly-on-surface/40 font-bold text-sm">(optional)</span></h3>
      </div>

      <p className="text-sm text-rhozly-on-surface/65 leading-snug">
        Paint over areas you want the AI to focus changes on — perfect for "redesign this corner but keep the lawn" requests. Leave it blank for a full-garden redesign.
      </p>

      {photoPreviewUrl ? (
        <PhotoHighlighter
          ref={highlighterRef}
          photoUrl={photoPreviewUrl}
          onHasStrokesChange={onHasStrokesChange}
        />
      ) : (
        <div className="rounded-2xl border-2 border-dashed border-rhozly-outline/15 bg-rhozly-surface-low/40 p-8 text-center text-sm text-rhozly-on-surface/55">
          No photo to highlight — go back to step 1 and add one first.
        </div>
      )}

      <p className="text-[11px] text-rhozly-on-surface/55 leading-snug">
        Tip: highlights are guidance, not a strict mask — the AI may still adjust nearby areas to make the whole garden cohesive.
      </p>
    </div>
  );
}

// ── Step 3 — The Vision ────────────────────────────────────────────

function Step3Vision({
  likes, setLikes, dislikes, setDislikes, wants, setWants, aesthetic, setAesthetic,
}: {
  likes: string; setLikes: (v: string) => void;
  dislikes: string; setDislikes: (v: string) => void;
  wants: string; setWants: (v: string) => void;
  aesthetic: string; setAesthetic: (v: string) => void;
}) {
  return (
    <div className="space-y-5 animate-in slide-in-from-right-4">
      <div className="flex items-center gap-2 mb-2 text-rhozly-primary border-b border-rhozly-outline/5 pb-3">
        <Eye size={20} />
        <h3 className="font-black text-lg">The Vision</h3>
      </div>

      <p className="text-sm text-rhozly-on-surface/65 leading-snug">
        Tell me what you'd change. Be specific — "more colour in July, no slug-prone plants" beats "make it nicer". At least one field is required.
      </p>

      <div className="space-y-2">
        <label htmlFor="overhaul-likes" className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 ml-1 flex items-center gap-1">
          <Heart size={12} /> What do you LIKE about your garden?
        </label>
        <textarea
          id="overhaul-likes"
          data-testid="overhaul-likes"
          value={likes}
          onChange={(e) => setLikes(e.target.value)}
          placeholder="e.g. The old apple tree, the patio gets afternoon sun"
          rows={2}
          className="w-full p-4 bg-rhozly-surface-low rounded-2xl outline-none font-bold text-base focus:ring-2 focus:ring-rhozly-primary/20 border border-transparent transition-all resize-none"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="overhaul-dislikes" className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 ml-1 flex items-center gap-1">
          <Frown size={12} /> What do you DISLIKE?
        </label>
        <textarea
          id="overhaul-dislikes"
          data-testid="overhaul-dislikes"
          value={dislikes}
          onChange={(e) => setDislikes(e.target.value)}
          placeholder="e.g. The lawn is patchy, no flowers for bees, that shady corner"
          rows={2}
          className="w-full p-4 bg-rhozly-surface-low rounded-2xl outline-none font-bold text-base focus:ring-2 focus:ring-red-500/20 border border-transparent transition-all resize-none"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="overhaul-wants" className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 ml-1 flex items-center gap-1">
          <Sparkles size={12} /> What do you WANT to add or change?
        </label>
        <textarea
          id="overhaul-wants"
          data-testid="overhaul-wants"
          value={wants}
          onChange={(e) => setWants(e.target.value)}
          placeholder="e.g. A raised veg bed, more colour in summer, more wildlife"
          rows={2}
          className="w-full p-4 bg-rhozly-surface-low rounded-2xl outline-none font-bold text-base focus:ring-2 focus:ring-rhozly-primary/20 border border-transparent transition-all resize-none"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="overhaul-aesthetic" className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 ml-1">
          Preferred Aesthetic
        </label>
        <select
          id="overhaul-aesthetic"
          data-testid="overhaul-aesthetic"
          value={aesthetic}
          onChange={(e) => setAesthetic(e.target.value)}
          className="w-full p-4 bg-rhozly-surface-low rounded-2xl font-bold text-base outline-none border border-transparent focus:ring-2 focus:ring-rhozly-primary/20 transition-all"
        >
          {AESTHETICS.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>
    </div>
  );
}

// ── Step 4 — Ready ─────────────────────────────────────────────────

function Step4Ready({
  photoPreviewUrl, likes, dislikes, wants, aesthetic, conceptCount, estimatedCostUsd, hasHighlights,
}: {
  photoPreviewUrl: string | null;
  likes: string; dislikes: string; wants: string;
  aesthetic: string;
  conceptCount: number;
  estimatedCostUsd: number;
  hasHighlights: boolean;
}) {
  return (
    <div className="space-y-5 animate-in slide-in-from-right-4">
      <div className="flex items-center gap-2 mb-2 text-rhozly-primary border-b border-rhozly-outline/5 pb-3">
        <MessageSquare size={20} />
        <h3 className="font-black text-lg">Ready to Generate</h3>
      </div>

      <p className="text-sm text-rhozly-on-surface/65 leading-snug">
        Rhozly will analyse your photo, draft a redesign blueprint, and produce {conceptCount} AI-transformed "after" concepts (your garden's structure preserved, new aesthetics applied). Usually 30-60 seconds.
      </p>

      {photoPreviewUrl && (
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 ml-1">
            Your photo
          </label>
          <img
            src={photoPreviewUrl}
            alt="Your garden"
            className="w-full max-h-56 object-cover rounded-2xl border border-rhozly-outline/10"
          />
        </div>
      )}

      <div className="rounded-2xl bg-rhozly-surface-low/60 border border-rhozly-outline/10 p-4 space-y-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40">
          Your inputs
        </p>
        <ReviewRow icon={<Heart size={12} className="text-rhozly-primary" />} label="Likes" value={likes} />
        <ReviewRow icon={<Frown size={12} className="text-red-500" />} label="Dislikes" value={dislikes} />
        <ReviewRow icon={<Sparkles size={12} className="text-rhozly-primary" />} label="Wants" value={wants} />
        <ReviewRow icon={null} label="Aesthetic" value={aesthetic} />
        <ReviewRow
          icon={<Brush size={12} className="text-rhozly-primary" />}
          label="Highlights"
          value={hasHighlights ? "On — AI will focus on the marked regions" : "Off — full-garden redesign"}
        />
      </div>

      <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-4">
        <p className="text-[12px] text-emerald-900 leading-snug">
          <span className="font-black">Estimated cost: ${estimatedCostUsd.toFixed(3)}</span>
          <span className="text-emerald-900/70"> — ~$0.05 vision + blueprint + {conceptCount} × $0.039 photo transformations.</span>
        </p>
      </div>
    </div>
  );
}

function ReviewRow({ icon, label, value }: { icon: React.ReactNode | null; label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/50 flex items-center gap-1">
        {icon}
        {label}
      </p>
      <p className="text-sm text-rhozly-on-surface leading-snug">
        {value || <span className="text-rhozly-on-surface/40 italic">(not specified)</span>}
      </p>
    </div>
  );
}
