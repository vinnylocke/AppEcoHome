import React from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ExternalLink, ImageIcon } from "lucide-react";
import {
  PROVIDER_LABEL,
  PROVIDER_TINT,
  PROVIDER_DEFAULT_LICENSE_URL,
  type ImageProvider,
} from "../lib/imageCredit";

// ─── CreditsPage ───────────────────────────────────────────────────────
//
// `/credits` — umbrella attribution page. Lists every image / data
// provider Rhozly uses, the canonical licence terms, and notes about
// how each is attributed. Required by some providers (Pixabay, Unsplash)
// regardless of per-image credit, and is the graceful fallback for any
// image whose row pre-dates the per-image credit pipeline.

interface ProviderEntry {
  id: ImageProvider;
  description: string;
  notes: string;
}

const PROVIDER_ENTRIES: ProviderEntry[] = [
  {
    id: "perenual",
    description: "Plant species database used for catalogue thumbnails and care data.",
    notes: "Each Perenual image carries its own licence. We surface the licence name and a link to the original on every image's credit popover.",
  },
  {
    id: "verdantly",
    description: "Plant species database used for catalogue thumbnails and gardening tips.",
    notes: "Verdantly's API doesn't expose a per-image licence — we credit Verdantly per their Terms of Service.",
  },
  {
    id: "wikipedia",
    description: "Reference photos from Wikimedia Commons.",
    notes: "Each Commons image carries its own Creative Commons licence; we link directly to the file page so contributors are credited.",
  },
  {
    id: "pixabay",
    description: "Stock plant photography.",
    notes: "Pixabay images are released under the Pixabay Content License (no attribution required, but a link back is appreciated).",
  },
  {
    id: "inaturalist",
    description: "Community plant photos with expert-confirmed identifications.",
    notes: "Each iNaturalist observation carries the photographer's chosen Creative Commons licence.",
  },
  {
    id: "unsplash",
    description: "High-quality plant and garden photography.",
    notes: "Used under the Unsplash License. We credit the photographer wherever the image is shown.",
  },
  {
    id: "plantnet",
    description: "Plant identification API and reference photos.",
    notes: "Pl@ntNet images are licensed under CC-BY-SA; we link back to the species page on the credit popover.",
  },
  {
    id: "ai",
    description: "AI-generated reference images (Google Imagen, via Gemini).",
    notes: "Marked clearly as AI-generated so users can distinguish synthesised images from real photographs.",
  },
  {
    id: "user",
    description: "Photos you upload yourself.",
    notes: "Your photos stay yours. We display them with a 'Your photo' badge so the chrome stays consistent.",
  },
];

interface Props {
  homeId?: string;
}

export default function CreditsPage({ homeId: _homeId }: Props) {
  const navigate = useNavigate();
  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 pb-24" data-testid="credits-page">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1 text-xs font-black uppercase tracking-widest text-rhozly-on-surface/40 hover:text-rhozly-primary transition-colors mb-3"
      >
        <ChevronLeft size={12} /> Back
      </button>
      <header className="mb-6">
        <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-1 flex items-center gap-1.5">
          <ImageIcon size={11} className="text-rhozly-primary" /> Image credits
        </p>
        <h1 className="text-2xl sm:text-3xl font-black text-rhozly-on-surface">
          Where Rhozly's images come from
        </h1>
        <p className="text-sm font-semibold text-rhozly-on-surface/65 leading-snug mt-2">
          Every image in Rhozly carries a small credit badge. Tap it to see the photographer, licence and a link to the original. This page is the umbrella attribution for the providers we use — and the fallback when an individual image is missing per-image credit info.
        </p>
      </header>

      <section className="space-y-3">
        {PROVIDER_ENTRIES.map((entry) => {
          const url = PROVIDER_DEFAULT_LICENSE_URL[entry.id];
          return (
            <article
              key={entry.id}
              className="bg-white rounded-3xl border border-rhozly-outline/10 p-4 sm:p-5 shadow-sm"
              data-testid={`credits-provider-${entry.id}`}
            >
              <div className="flex items-start gap-3">
                <span
                  className={`shrink-0 inline-flex items-center justify-center min-w-[90px] px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${PROVIDER_TINT[entry.id]}`}
                >
                  {PROVIDER_LABEL[entry.id]}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black text-rhozly-on-surface leading-snug">
                    {entry.description}
                  </p>
                  <p className="text-[11px] font-semibold text-rhozly-on-surface/60 leading-snug mt-1">
                    {entry.notes}
                  </p>
                  {url && (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-black text-rhozly-primary hover:opacity-80 mt-2"
                    >
                      <ExternalLink size={11} /> Licence terms
                    </a>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </section>

      <p className="text-[10px] font-bold text-rhozly-on-surface/40 mt-6 leading-snug px-1">
        If you spot an image you believe is mis-credited, please get in touch — we'll correct it promptly. Older images may carry an 'Unknown source' badge; we're backfilling those over the next few releases.
      </p>
    </div>
  );
}
