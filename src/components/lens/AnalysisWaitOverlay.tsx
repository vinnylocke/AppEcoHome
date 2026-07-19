import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

/**
 * Stage copy mirrors the REAL pipeline (docs/app-reference/99-cross-cutting/
 * 38-plantnet.md): identify runs Pl@ntNet first with Gemini cross-checking in
 * parallel; diagnose/pest/scene are Gemini-only; analyse identifies first and
 * then runs the full section sweep. Wording deliberately avoids "analyze"/
 * "error" — the e2e error assertion matches those strings in toasts.
 */
const STAGES: Record<string, string[]> = {
  identify: [
    "Reading your photo…",
    "Matching with Pl@ntNet…",
    "Cross-checking with Rhozly AI…",
  ],
  diagnose: [
    "Reading your photo…",
    "Examining the symptoms…",
    "Consulting Rhozly AI…",
  ],
  pest: [
    "Reading your photo…",
    "Looking for the culprit…",
    "Consulting Rhozly AI…",
  ],
  analyse: [
    "Reading your photo…",
    "Identifying the plant…",
    "Checking health, pruning & harvest…",
    "Writing up the findings…",
  ],
  scene: ["Reading your photo…", "Mapping every plant in view…"],
};

const STAGE_MS = 2400;

/**
 * The staged AI-wait experience — a blurred copy of the user's own photo with
 * honest progress copy, shown over the image frame while the Gemini/Pl@ntNet
 * call is in flight (5–15s). Purely cosmetic: the parent unmounts it the
 * moment the response lands, so it can never delay results; stages advance on
 * a timer and hold at the last one.
 */
export function AnalysisWaitOverlay({
  action,
  src,
}: {
  action: string | null;
  src: string;
}) {
  const stages = STAGES[action ?? "analyse"] ?? STAGES.analyse;
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    setStageIndex(0);
    const timer = window.setInterval(
      () => setStageIndex((n) => Math.min(n + 1, stages.length - 1)),
      STAGE_MS,
    );
    return () => window.clearInterval(timer);
  }, [action, stages.length]);

  return (
    <div
      data-testid="doctor-wait-overlay"
      aria-live="polite"
      className="absolute inset-0 z-20 overflow-hidden rounded-3xl"
    >
      <img
        src={src}
        alt=""
        aria-hidden
        className="absolute inset-0 w-full h-full object-cover scale-110 blur-md"
      />
      <div className="absolute inset-0 bg-rhozly-deep/60" />
      <div className="relative h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
        <Loader2 className="w-8 h-8 animate-spin text-white" aria-hidden />
        <p
          key={stageIndex}
          className="text-sm font-black text-white animate-in fade-in slide-in-from-bottom-2"
        >
          {stages[stageIndex]}
        </p>
        <p className="text-2xs font-bold text-white/60">Usually 5–15 seconds</p>
      </div>
    </div>
  );
}
