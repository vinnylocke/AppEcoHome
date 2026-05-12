import React, { useState, useEffect } from "react";
import { Loader2, X, Check, Globe } from "lucide-react";
import { searchWikimediaImages } from "../lib/wikipedia";
import type { WikiImageResult } from "../lib/wikipedia";

interface WikiImagePickerProps {
  plantName: string;
  onSelect: (url: string) => void;
  onClose: () => void;
}

export default function WikiImagePicker({ plantName, onSelect, onClose }: WikiImagePickerProps) {
  const [images, setImages] = useState<WikiImageResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setImages([]);
    setSelected(null);

    searchWikimediaImages(plantName)
      .then((results) => {
        if (cancelled) return;
        setImages(results);
        if (results.length === 0) setError("No images found — try a different name.");
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't reach Wikipedia. Check your connection.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [plantName]);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[85vh] flex flex-col shadow-2xl animate-in slide-in-from-bottom-4 sm:slide-in-from-bottom-0 sm:zoom-in-95">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 shrink-0 border-b border-rhozly-outline/10">
          <div className="flex items-center gap-2">
            <Globe size={16} className="text-rhozly-primary" />
            <div>
              <h3 className="text-sm font-black text-rhozly-on-surface">Wikipedia Images</h3>
              <p className="text-[10px] font-bold text-rhozly-on-surface/40">
                Results for "{plantName}"
              </p>
            </div>
          </div>
          <button
            data-testid="wiki-picker-close"
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-rhozly-surface-low transition-colors text-rhozly-on-surface/40"
          >
            <X size={18} />
          </button>
        </div>

        {/* Grid body */}
        <div className="flex-1 overflow-y-auto p-4 scrollbar-none">
          {loading && (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 size={28} className="animate-spin text-rhozly-primary" />
              <p className="text-xs font-bold text-rhozly-on-surface/40">Searching Wikimedia…</p>
            </div>
          )}

          {error && !loading && (
            <div className="flex flex-col items-center justify-center py-20 gap-2 text-center px-8">
              <Globe size={32} className="text-rhozly-on-surface/20" />
              <p className="text-sm font-black text-rhozly-on-surface/40">{error}</p>
            </div>
          )}

          {!loading && !error && images.length > 0 && (
            <>
              <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-3">
                Tap to select · {images.length} results
              </p>
              <div className="grid grid-cols-3 gap-2">
                {images.map((img) => {
                  const isSelected = selected === img.thumbUrl;
                  return (
                    <button
                      key={img.thumbUrl}
                      data-testid="wiki-image-option"
                      onClick={() => setSelected(img.thumbUrl)}
                      className={`relative aspect-square rounded-2xl overflow-hidden border-2 transition-all focus:outline-none focus:ring-2 focus:ring-rhozly-primary/40 ${
                        isSelected
                          ? "border-rhozly-primary shadow-md scale-[0.97]"
                          : "border-transparent hover:border-rhozly-primary/30"
                      }`}
                    >
                      <img
                        src={img.thumbUrl}
                        alt={img.title}
                        className="w-full h-full object-cover bg-rhozly-surface-low"
                        loading="lazy"
                      />
                      {isSelected && (
                        <div className="absolute inset-0 bg-rhozly-primary/20 flex items-center justify-center">
                          <div className="bg-rhozly-primary rounded-full p-1.5 shadow-lg">
                            <Check size={14} className="text-white" strokeWidth={3} />
                          </div>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
              <p className="text-[9px] font-bold text-rhozly-on-surface/25 text-center mt-4">
                Images from Wikimedia Commons · CC licensed
              </p>
            </>
          )}
        </div>

        {/* Footer — only shown when something is selected */}
        {selected && (
          <div className="px-4 pb-6 pt-3 shrink-0 border-t border-rhozly-outline/10">
            <button
              data-testid="wiki-picker-confirm"
              onClick={() => onSelect(selected)}
              className="w-full py-4 bg-rhozly-primary text-white rounded-2xl font-black text-sm hover:bg-rhozly-primary/90 active:scale-95 transition-all"
            >
              Use This Image
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
