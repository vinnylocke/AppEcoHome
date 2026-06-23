import React from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ExternalLink, Library } from "lucide-react";
import {
  DATA_SOURCES,
  SOURCE_CATEGORIES,
  CATEGORY_INTRO,
  type SourceCategory,
} from "../constants/dataSources";

// ─── CreditsPage ───────────────────────────────────────────────────────
//
// `/credits` — the umbrella "Credits & Sources" page. Lists every external
// service Rhozly draws information from (plants, identification, weather,
// images, AI) and the infrastructure that runs it — what each provides, the
// surfaces where it's used, and its licence terms. Also the graceful fallback
// for any image whose per-image credit info is missing (the image credit
// popover links here).

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

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
          <Library size={11} className="text-rhozly-primary" /> Credits &amp; sources
        </p>
        <h1 className="text-2xl sm:text-3xl font-black text-rhozly-on-surface">
          Where Rhozly's information comes from
        </h1>
        <p className="text-sm font-semibold text-rhozly-on-surface/65 leading-snug mt-2">
          Rhozly is built on the work of many open data, photography and software providers. This page credits every source we draw on — what it gives us, where it's used in the app, and its licence terms. Every image also carries a small credit badge; tap it for the photographer, licence and a link to the original.
        </p>
      </header>

      <div className="space-y-8">
        {SOURCE_CATEGORIES.map((category: SourceCategory) => {
          const sources = DATA_SOURCES.filter((s) => s.category === category);
          if (sources.length === 0) return null;
          return (
            <section key={category} data-testid={`credits-category-${slug(category)}`}>
              <h2 className="text-[11px] font-black uppercase tracking-widest text-rhozly-on-surface/45 mb-2 px-1">
                {category}
              </h2>
              {CATEGORY_INTRO[category] && (
                <p className="text-[11px] font-semibold text-rhozly-on-surface/55 leading-snug mb-3 px-1">
                  {CATEGORY_INTRO[category]}
                </p>
              )}
              <div className="space-y-3">
                {sources.map((entry) => (
                  <article
                    key={entry.id}
                    className="bg-white rounded-3xl border border-rhozly-outline/10 p-4 sm:p-5 shadow-sm"
                    data-testid={`credits-source-${entry.id}`}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={`shrink-0 inline-flex items-center justify-center min-w-[90px] px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${entry.tint}`}
                      >
                        {entry.name}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-black text-rhozly-on-surface leading-snug">
                          {entry.provides}
                        </p>
                        <p className="text-[11px] font-bold text-rhozly-on-surface/55 leading-snug mt-1.5">
                          <span className="text-rhozly-on-surface/40">Used in:</span> {entry.usedIn.join(" · ")}
                        </p>
                        <p className="text-[11px] font-semibold text-rhozly-on-surface/55 leading-snug mt-1.5">
                          {entry.note}
                        </p>
                        {entry.licenseUrl && (
                          <a
                            href={entry.licenseUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-black text-rhozly-primary hover:opacity-80 mt-2"
                          >
                            <ExternalLink size={11} /> Terms &amp; licence
                          </a>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <p className="text-[10px] font-bold text-rhozly-on-surface/40 mt-8 leading-snug px-1">
        If you spot a source you believe is mis-credited, please get in touch — we'll correct it promptly. Older images may carry an 'Unknown source' badge; we're backfilling those over the next few releases.
      </p>
    </div>
  );
}
