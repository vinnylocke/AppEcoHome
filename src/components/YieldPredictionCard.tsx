import React from "react";
import { X, TrendingUp, Lightbulb } from "lucide-react";
import type { YieldPrediction } from "../types";

interface YieldPredictionCardProps {
  prediction: YieldPrediction;
  onDismiss: () => void;
}

const CONFIDENCE_STYLES: Record<YieldPrediction["confidence"], string> = {
  low: "bg-amber-50 text-amber-700 border-amber-200",
  medium: "bg-blue-50 text-blue-700 border-blue-200",
  high: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

const CONFIDENCE_LABELS: Record<YieldPrediction["confidence"], string> = {
  low: "Low confidence",
  medium: "Medium confidence",
  high: "High confidence",
};

export default function YieldPredictionCard({
  prediction,
  onDismiss,
}: YieldPredictionCardProps) {
  return (
    <div
      data-testid="yield-prediction-card"
      className="bg-rhozly-surface-low rounded-3xl border border-rhozly-outline/20 p-6 animate-in fade-in slide-in-from-bottom-2 duration-400"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 bg-rhozly-primary/10 rounded-xl flex items-center justify-center">
            <TrendingUp size={18} className="text-rhozly-primary" />
          </div>
          <div>
            <p className="text-[10px] font-black text-rhozly-primary uppercase tracking-widest">
              AI Prediction
            </p>
            <p className="text-xs font-bold text-rhozly-on-surface/50">
              Estimated yield
            </p>
          </div>
        </div>
        <button
          data-testid="yield-prediction-dismiss"
          onClick={onDismiss}
          className="w-8 h-8 flex items-center justify-center rounded-xl text-rhozly-on-surface/40 hover:text-rhozly-on-surface hover:bg-rhozly-surface transition-colors"
          aria-label="Dismiss prediction"
        >
          <X size={16} />
        </button>
      </div>

      {/* Estimated value */}
      <div className="mb-4">
        <span
          data-testid="yield-prediction-value"
          className="text-4xl font-black text-rhozly-on-surface"
        >
          {prediction.estimated_value}
        </span>
        <span className="text-xl font-black text-rhozly-on-surface/60 ml-2">
          {prediction.unit}
        </span>
      </div>

      {/* Confidence badge */}
      <span
        data-testid="yield-prediction-confidence"
        className={`inline-block text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-lg border mb-4 ${CONFIDENCE_STYLES[prediction.confidence]}`}
      >
        {CONFIDENCE_LABELS[prediction.confidence]}
      </span>

      {/* Reasoning */}
      <p
        data-testid="yield-prediction-reasoning"
        className="text-sm font-bold text-rhozly-on-surface/70 leading-relaxed mb-4"
      >
        {prediction.reasoning}
      </p>

      {/* Tips */}
      {prediction.tips.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Lightbulb size={13} className="text-rhozly-primary" />
            <p className="text-[10px] font-black text-rhozly-primary uppercase tracking-widest">
              Tips
            </p>
          </div>
          <ul
            data-testid="yield-prediction-tips"
            className="space-y-1.5"
          >
            {prediction.tips.map((tip, i) => (
              <li
                key={i}
                className="flex gap-2 text-xs font-bold text-rhozly-on-surface/70 leading-relaxed"
              >
                <span className="text-rhozly-primary mt-0.5">•</span>
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
