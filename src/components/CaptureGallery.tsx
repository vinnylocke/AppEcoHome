import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Trash2, Images, Loader2, ChevronLeft, ChevronRight, Maximize2 } from "lucide-react";
import toast from "react-hot-toast";
import { supabase } from "../lib/supabase";

interface Capture {
  id: string;
  image_url: string;
  plant_ids: number[] | null;
  created_at: string;
  signedUrl?: string;
}

interface Props {
  homeId: string;
  onClose: () => void;
}

export default function CaptureGallery({ homeId, onClose }: Props) {
  const [captures, setCaptures]     = useState<Capture[]>([]);
  const [isLoading, setIsLoading]   = useState(true);
  const [deleting, setDeleting]     = useState<Set<string>>(new Set());
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  useEffect(() => {
    loadCaptures();
  }, [homeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard nav for lightbox
  useEffect(() => {
    if (expandedIdx === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape")      setExpandedIdx(null);
      if (e.key === "ArrowRight")  setExpandedIdx(i => i !== null ? Math.min(i + 1, captures.length - 1) : null);
      if (e.key === "ArrowLeft")   setExpandedIdx(i => i !== null ? Math.max(i - 1, 0) : null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expandedIdx, captures.length]);

  const loadCaptures = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("visualiser_captures")
        .select("id, image_url, plant_ids, created_at")
        .eq("home_id", homeId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const withUrls = await Promise.all(
        (data ?? []).map(async (row) => {
          const { data: signed } = await supabase.storage
            .from("visualiser-captures")
            .createSignedUrl(row.image_url, 3600);
          return { ...row, signedUrl: signed?.signedUrl ?? undefined };
        }),
      );

      setCaptures(withUrls);
    } catch (err) {
      console.error("[CaptureGallery] Load error:", err);
      toast.error("Could not load captures.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, capture: Capture) => {
    e.stopPropagation();
    setDeleting(prev => new Set(prev).add(capture.id));
    try {
      const { error: storageErr } = await supabase.storage
        .from("visualiser-captures")
        .remove([capture.image_url]);
      if (storageErr) throw storageErr;

      const { error: dbErr } = await supabase
        .from("visualiser_captures")
        .delete()
        .eq("id", capture.id);
      if (dbErr) throw dbErr;

      setCaptures(prev => {
        const next = prev.filter(c => c.id !== capture.id);
        // If we deleted the expanded item, close lightbox or shift index
        setExpandedIdx(ei => {
          if (ei === null) return null;
          const deletedIdx = prev.findIndex(c => c.id === capture.id);
          if (ei === deletedIdx) return next.length > 0 ? Math.min(ei, next.length - 1) : null;
          if (ei > deletedIdx) return ei - 1;
          return ei;
        });
        return next;
      });
    } catch (err) {
      console.error("[CaptureGallery] Delete error:", err);
      toast.error("Could not delete capture.");
    } finally {
      setDeleting(prev => {
        const next = new Set(prev);
        next.delete(capture.id);
        return next;
      });
    }
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, {
      day: "numeric", month: "short", year: "numeric",
    });

  if (typeof document === "undefined") return null;

  const expandedCapture = expandedIdx !== null ? captures[expandedIdx] : null;

  return createPortal(
    <>
      {/* Gallery modal */}
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-rhozly-bg/95 backdrop-blur-xl animate-in fade-in duration-300">
        <div className="bg-rhozly-surface-lowest w-full max-w-3xl h-[90vh] flex flex-col rounded-3xl shadow-2xl border border-rhozly-outline/20 overflow-hidden">

          {/* Header */}
          <div className="p-8 pb-4 flex justify-between items-center shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rhozly-primary/10 flex items-center justify-center">
                <Images size={18} className="text-rhozly-primary" />
              </div>
              <div>
                <h3 className="text-2xl font-black text-rhozly-on-surface">Gallery</h3>
                <p className="text-[10px] font-black text-rhozly-primary uppercase tracking-widest mt-0.5">
                  {captures.length} capture{captures.length !== 1 ? "s" : ""}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close gallery"
              className="min-w-[44px] min-h-[44px] flex items-center justify-center p-3 bg-rhozly-surface-low rounded-2xl hover:bg-rhozly-surface hover:scale-110 transition-all"
            >
              <X size={24} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-8 pt-4 custom-scrollbar">
            {isLoading ? (
              <div className="h-full flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-rhozly-primary" />
              </div>
            ) : captures.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
                <Images size={40} className="text-rhozly-on-surface/15" />
                <p className="font-black text-rhozly-on-surface/40">No captures yet</p>
                <p className="text-xs font-bold text-rhozly-on-surface/30">
                  Open the visualiser and tap the camera button to save a capture.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {captures.map((capture, i) => (
                  <div
                    key={capture.id}
                    onClick={() => setExpandedIdx(i)}
                    className="group relative rounded-2xl overflow-hidden bg-rhozly-surface-low border border-rhozly-outline/10 aspect-[4/3] cursor-pointer"
                  >
                    {capture.signedUrl ? (
                      <img
                        src={capture.signedUrl}
                        alt={`Capture from ${formatDate(capture.created_at)}`}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Loader2 size={20} className="animate-spin text-rhozly-on-surface/30" />
                      </div>
                    )}

                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex flex-col justify-between p-3 opacity-0 group-hover:opacity-100">
                      <div className="flex justify-between items-start">
                        <div className="w-8 h-8 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center">
                          <Maximize2 size={13} className="text-white" />
                        </div>
                        <button
                          onClick={(e) => handleDelete(e, capture)}
                          disabled={deleting.has(capture.id)}
                          className="w-8 h-8 rounded-lg bg-red-500/80 backdrop-blur-sm flex items-center justify-center text-white hover:bg-red-500 transition-colors disabled:opacity-50"
                          aria-label="Delete capture"
                        >
                          {deleting.has(capture.id)
                            ? <Loader2 size={12} className="animate-spin" />
                            : <Trash2 size={12} />
                          }
                        </button>
                      </div>
                      <p className="text-white text-[11px] font-bold">
                        {formatDate(capture.created_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {expandedCapture && (
        <div
          className="fixed inset-0 z-[130] flex items-center justify-center bg-black/90 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setExpandedIdx(null)}
        >
          {/* Close */}
          <button
            onClick={() => setExpandedIdx(null)}
            className="absolute top-4 right-4 w-11 h-11 rounded-2xl bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors z-10"
            aria-label="Close"
          >
            <X size={20} />
          </button>

          {/* Prev */}
          {expandedIdx! > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); setExpandedIdx(i => i! - 1); }}
              className="absolute left-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-2xl bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors z-10"
              aria-label="Previous"
            >
              <ChevronLeft size={22} />
            </button>
          )}

          {/* Next */}
          {expandedIdx! < captures.length - 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); setExpandedIdx(i => i! + 1); }}
              className="absolute right-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-2xl bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors z-10"
              aria-label="Next"
            >
              <ChevronRight size={22} />
            </button>
          )}

          {/* Image */}
          <div
            className="max-w-[90vw] max-h-[90vh] flex flex-col items-center gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={expandedCapture.signedUrl}
              alt={`Capture from ${formatDate(expandedCapture.created_at)}`}
              className="max-w-full max-h-[80vh] object-contain rounded-2xl shadow-2xl"
            />
            <div className="flex items-center gap-4">
              <p className="text-white/60 text-sm font-bold">
                {formatDate(expandedCapture.created_at)}
              </p>
              <span className="text-white/20">·</span>
              <p className="text-white/40 text-xs font-bold">
                {expandedIdx! + 1} / {captures.length}
              </p>
            </div>
          </div>
        </div>
      )}
    </>,
    document.body,
  );
}
