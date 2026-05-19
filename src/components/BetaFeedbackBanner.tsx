import React, { useState } from "react";
import { X, FlaskConical } from "lucide-react";
import { toast } from "react-hot-toast";
import { useBetaFeedbackContext } from "../context/BetaFeedbackContext";
import { BETA_FEEDBACK_CONTEXTS } from "../constants/betaFeedbackContexts";

const AREA_OPTIONS = [
  { value: "general", label: "General" },
  ...Object.entries(BETA_FEEDBACK_CONTEXTS).map(([key, val]) => ({
    value: key,
    label: val.label.replace(/^How was /, "").replace(/^How were /, "").replace(/\?$/, ""),
  })),
];

export default function BetaFeedbackBanner() {
  const { isBeta, submitGeneralFeedback } = useBetaFeedbackContext();
  const [modalOpen, setModalOpen] = useState(false);
  const [area, setArea] = useState("general");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!isBeta) return null;

  const openModal = () => {
    setArea("general");
    setDescription("");
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    if (!description.trim()) return;
    setSubmitting(true);
    try {
      await submitGeneralFeedback(area, description.trim());
      toast.success("Thanks for your feedback!");
      setModalOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* Banner */}
      <div
        data-testid="beta-feedback-banner"
        className="w-full bg-amber-400 text-amber-950 flex items-center justify-between px-4 py-2 shrink-0"
      >
        <div className="flex items-center gap-2 text-sm font-bold">
          <FlaskConical size={15} className="shrink-0" />
          <span>Beta — you're helping test Rhozly</span>
        </div>
        <button
          data-testid="beta-feedback-open"
          onClick={openModal}
          className="text-xs font-black bg-amber-950/15 hover:bg-amber-950/25 transition-colors px-3 py-1.5 rounded-xl shrink-0"
        >
          Leave Feedback
        </button>
      </div>

      {/* Modal */}
      {modalOpen && (
        <>
          <div
            className="fixed inset-0 z-[300] bg-black/50"
            onClick={() => setModalOpen(false)}
          />
          <div
            data-testid="beta-feedback-modal"
            className="fixed z-[301] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-rhozly-surface rounded-3xl shadow-2xl p-6"
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <span className="inline-block px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-bold tracking-wider mb-1.5">
                  Beta Feedback
                </span>
                <h2 className="text-base font-black text-rhozly-on-surface">Share your thoughts</h2>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="p-2 rounded-xl hover:bg-rhozly-on-surface/10 transition-colors text-rhozly-on-surface/50 -mt-1 -mr-2"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            {/* Area picker */}
            <label className="block mb-1.5 text-xs font-bold text-rhozly-on-surface/60 uppercase tracking-wider">
              What area? (optional)
            </label>
            <select
              data-testid="beta-feedback-area"
              value={area}
              onChange={(e) => setArea(e.target.value)}
              className="w-full mb-4 text-sm rounded-2xl border border-rhozly-on-surface/15 bg-rhozly-bg px-4 py-3 text-rhozly-on-surface focus:outline-none focus:ring-2 focus:ring-rhozly-primary/40"
            >
              {AREA_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            {/* Description */}
            <label className="block mb-1.5 text-xs font-bold text-rhozly-on-surface/60 uppercase tracking-wider">
              Your feedback
            </label>
            <textarea
              data-testid="beta-feedback-general-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Tell us what you think…"
              rows={4}
              className="w-full text-sm rounded-2xl border border-rhozly-on-surface/15 bg-rhozly-bg px-4 py-3 text-rhozly-on-surface placeholder:text-rhozly-on-surface/40 focus:outline-none focus:ring-2 focus:ring-rhozly-primary/40 resize-none mb-5"
            />

            <div className="flex gap-3">
              <button
                onClick={() => setModalOpen(false)}
                className="flex-1 py-3 rounded-2xl border border-rhozly-on-surface/15 text-rhozly-on-surface/70 text-sm font-bold hover:bg-rhozly-on-surface/5 transition-colors"
              >
                Cancel
              </button>
              <button
                data-testid="beta-feedback-general-submit"
                onClick={handleSubmit}
                disabled={!description.trim() || submitting}
                className="flex-1 py-3 rounded-2xl bg-rhozly-primary text-white text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting ? "Saving…" : "Submit"}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
