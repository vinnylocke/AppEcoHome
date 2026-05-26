import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Loader2, X, Image as ImageIcon, Brush } from "lucide-react";
import toast from "react-hot-toast";
import {
  fetchOverhaulConcepts,
  fetchOverhaulInput,
  selectOverhaulConcept,
  type OverhaulConcept,
  type OverhaulInput,
} from "../../services/gardenOverhaulService";
import { Logger } from "../../lib/errorHandler";

interface Props {
  planId: string;
  onSelectionChange?: (conceptId: string | null) => void;
}

const POLL_INTERVAL_MS = 4000;

/**
 * Concept picker rendered inside PlanStaging's Pre-Start Review for
 * overhaul plans. Polls every 4s while concepts are still generating,
 * stops once they've all landed.
 *
 * When the user picks a concept, calls selectOverhaulConcept which
 * also promotes the chosen image to the plan's cover_image_url —
 * this is why PlanStaging's cover header refreshes after selection.
 */
export default function OverhaulConceptPicker({ planId, onSelectionChange }: Props) {
  const [input, setInput] = useState<OverhaulInput | null>(null);
  const [concepts, setConcepts] = useState<OverhaulConcept[]>([]);
  const [zoomedConceptId, setZoomedConceptId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [inputRes, conceptsRes] = await Promise.all([
        fetchOverhaulInput(planId),
        fetchOverhaulConcepts(planId),
      ]);
      setInput(inputRes);
      setConcepts(conceptsRes);
    } catch (err) {
      Logger.error("OverhaulConceptPicker refresh failed", err);
    } finally {
      setLoading(false);
    }
  }, [planId]);

  useEffect(() => {
    setLoading(true);
    refresh();
  }, [refresh]);

  const isGenerating = concepts.length === 0;
  useEffect(() => {
    if (!isGenerating) {
      if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    if (pollRef.current) return;
    pollRef.current = window.setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [isGenerating, refresh]);

  const selectedConceptId = useMemo(
    () => concepts.find((c) => c.selected_by_user)?.id ?? null,
    [concepts],
  );

  // Notify parent when selection changes so it can enable the
  // "Accept" button + refetch the plan to pick up the new cover image.
  useEffect(() => {
    onSelectionChange?.(selectedConceptId);
  }, [selectedConceptId, onSelectionChange]);

  const handleSelect = useCallback(async (conceptId: string) => {
    try {
      await selectOverhaulConcept(planId, conceptId);
      setConcepts((prev) => prev.map((c) => ({ ...c, selected_by_user: c.id === conceptId })));
    } catch (err) {
      Logger.error("Select concept failed", err);
      toast.error("Couldn't save your selection.");
    }
  }, [planId]);

  if (loading) {
    return (
      <div className="py-8 flex items-center justify-center text-rhozly-on-surface/55">
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40">
            Your garden (before)
          </p>
          {input?.annotated_photo_url && (
            <button
              type="button"
              onClick={() => setZoomedConceptId("__annotated__")}
              data-testid="overhaul-show-highlights"
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200 text-[9px] font-black uppercase tracking-widest hover:bg-red-100 transition-colors"
              title="View what you highlighted"
            >
              <Brush size={9} /> Highlights used — tap to view
            </button>
          )}
        </div>
        {input?.original_photo_url ? (
          <img
            src={input.original_photo_url}
            alt="Before"
            className="w-full max-h-72 object-cover rounded-2xl border border-rhozly-outline/10"
          />
        ) : (
          <div className="w-full h-48 rounded-2xl bg-rhozly-surface-low border border-rhozly-outline/10 flex items-center justify-center text-rhozly-on-surface/40 text-sm gap-2">
            <ImageIcon size={18} /> Photo unavailable
          </div>
        )}
      </div>

      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-2 flex items-center gap-1.5">
          AI concepts ({concepts.length}/3)
          {isGenerating && (
            <span className="text-rhozly-primary normal-case tracking-normal inline-flex items-center gap-1">
              <Loader2 size={10} className="animate-spin" /> generating…
            </span>
          )}
        </p>
        {concepts.length === 0 ? (
          <div className="w-full py-16 rounded-2xl bg-rhozly-surface-low border border-dashed border-rhozly-outline/20 flex flex-col items-center justify-center text-rhozly-on-surface/55 gap-3">
            <Loader2 size={26} className="animate-spin text-rhozly-primary" />
            <span className="font-black">Transforming your garden photo…</span>
            <span className="text-rhozly-on-surface/40 text-xs">Usually 30–60s</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {concepts.map((c) => (
              <div
                key={c.id}
                className={`relative rounded-2xl overflow-hidden border-2 bg-white transition shadow-sm ${
                  selectedConceptId === c.id
                    ? "border-rhozly-primary shadow-[0_4px_18px_-6px_rgba(7,87,55,0.4)]"
                    : "border-transparent hover:border-rhozly-primary/30 hover:shadow-md"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setZoomedConceptId(c.id)}
                  className="block w-full"
                  aria-label={`Zoom ${c.aesthetic}`}
                >
                  <img
                    src={c.image_url}
                    alt={c.aesthetic}
                    className="w-full aspect-[4/3] object-cover"
                  />
                </button>
                <div className="p-3 space-y-2">
                  <p className="text-sm font-black text-rhozly-on-surface truncate">
                    {c.aesthetic}
                  </p>
                  <button
                    type="button"
                    onClick={() => handleSelect(c.id)}
                    data-testid={`overhaul-concept-${c.id}`}
                    className={`w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest min-h-[40px] ${
                      selectedConceptId === c.id
                        ? "bg-rhozly-primary text-white"
                        : "bg-rhozly-surface-low text-rhozly-on-surface/70 hover:bg-rhozly-primary/10"
                    }`}
                  >
                    {selectedConceptId === c.id
                      ? <><CheckCircle2 size={12} /> Selected</>
                      : "Pick this one"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {zoomedConceptId && (() => {
        // Synthetic id used by the "Highlights used" chip to view the
        // user's annotated photo in the same lightbox UI.
        if (zoomedConceptId === "__annotated__") {
          if (!input?.annotated_photo_url) return null;
          return (
            <div
              className="fixed inset-0 z-[200] bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center p-4 animate-in fade-in"
              onClick={() => setZoomedConceptId(null)}
            >
              <img
                src={input.annotated_photo_url}
                alt="Your highlighted areas"
                className="max-w-full max-h-[80vh] rounded-2xl shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              />
              <p className="text-white text-sm font-black mt-3">Your highlighted areas</p>
              <button
                type="button"
                className="mt-3 px-5 py-2.5 rounded-2xl bg-white text-rhozly-on-surface text-[11px] font-black uppercase tracking-widest hover:bg-white/90 transition-colors"
                onClick={(e) => { e.stopPropagation(); setZoomedConceptId(null); }}
              >
                <X size={14} className="inline mr-1" />
                Close
              </button>
            </div>
          );
        }
        const c = concepts.find((x) => x.id === zoomedConceptId);
        if (!c) return null;
        return (
          <div
            className="fixed inset-0 z-[200] bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center p-4 animate-in fade-in"
            onClick={() => setZoomedConceptId(null)}
          >
            <img
              src={c.image_url}
              alt={c.aesthetic}
              className="max-w-full max-h-[80vh] rounded-2xl shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
            <p className="text-white text-sm font-black mt-3">{c.aesthetic}</p>
            <button
              type="button"
              className="mt-3 px-5 py-2.5 rounded-2xl bg-white text-rhozly-on-surface text-[11px] font-black uppercase tracking-widest hover:bg-white/90 transition-colors"
              onClick={(e) => { e.stopPropagation(); setZoomedConceptId(null); }}
            >
              <X size={14} className="inline mr-1" />
              Close
            </button>
          </div>
        );
      })()}
    </div>
  );
}
