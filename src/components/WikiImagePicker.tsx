import React, { useState, useEffect } from "react";
import { Loader2, X, Check, ImageIcon } from "lucide-react";
import { searchWikimediaImages, searchPixabayImages } from "../lib/wikipedia";
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

    // Run Wikimedia Commons and Pixabay in parallel; combine results
    Promise.all([
      searchWikimediaImages(plantName).catch(() => [] as WikiImageResult[]),
      searchPixabayImages(plantName).catch(() => [] as WikiImageResult[]),
    ]).then(([wiki, pixabay]) => {
      if (cancelled) return;
      const combined = [...wiki, ...pixabay];
      setImages(combined);
      if (combined.length === 0) setError("No images found. Try uploading a photo from your device.");
    }).finally(() => {
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
            <ImageIcon size={16} className="text-rhozly-primary" />
            <div>
              <h3 className="text-sm font-black text-rhozly-on-surface">Find a Photo</h3>
              <p className="text-[10px] font-bold text-rhozly-on-surface/40">
                Searching for "{plantName}"
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
              <p className="text-xs font-bold text-rhozly-on-surface/40">Searching…</p>
            </div>
          )}

          {error && !loading && (
            <div className="flex flex-col items-center justify-center py-20 gap-2 text-center px-8">
              <ImageIcon size={32} className="text-rhozly-on-surface/20" />
              <p className="text-sm font-black text-rhozly-on-surface/40">{error}</p>
            </div>
          )}

          {!loading && !error && images.length > 0 && (
            <>
              <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-3">
                Tap to select · {images.length} results
              </p>
              <div className="grid grid-cols-3 gap-2">
                {images.map((img, i) => {
                  const isSelected = selected === img.thumbUrl;
                  return (
                    <button
                      key={`${img.source}-${i}`}
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

                      {/* Source badge */}
                      <span className="absolute bottom-1 left-1 text-[8px] font-black bg-black/40 text-white/80 px-1.5 py-0.5 rounded-full uppercase tracking-wide">
                        {img.source === "pixabay" ? "Pixabay" : "Wiki"}
                      </span>

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
            </>
          )}
        </div>

        {/* Footer — confirm or close */}
        <div className="px-4 pb-6 pt-3 shrink-0 border-t border-rhozly-outline/10">
          {selected ? (
            <button
              data-testid="wiki-picker-confirm"
              onClick={() => onSelect(selected)}
              className="w-full py-4 bg-rhozly-primary text-white rounded-2xl font-black text-sm hover:bg-rhozly-primary/90 active:scale-95 transition-all"
            >
              Use This Image
            </button>
          ) : (
            <button
              onClick={onClose}
              className="w-full py-4 bg-rhozly-surface-low text-rhozly-on-surface/50 rounded-2xl font-black text-sm hover:bg-rhozly-surface transition-all"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
