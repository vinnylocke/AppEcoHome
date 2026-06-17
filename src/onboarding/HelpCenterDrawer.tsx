import React, { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import {
  CheckCircle2, Clock, Circle, X, Search, ChevronRight,
  Loader2, BookOpen, ArrowLeft, GraduationCap,
} from "lucide-react";
import { toast } from "react-hot-toast";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { flowRegistry } from "./flowRegistry";
import { DOCS, type DocEntry } from "./docs";
import type { FlowCategory, OnboardingState } from "./types";

interface Props {
  onboardingState: OnboardingState;
  onClose: () => void;
  onStartFlow: (flowId: string) => void;
}

type ActiveTab = "guides" | "docs";

const CATEGORY_ORDER: FlowCategory[] = [
  "Getting Started",
  "Garden",
  "Planning",
  "Tools",
  "Community",
];

const CATEGORY_COLOUR: Record<FlowCategory, string> = {
  "Getting Started": "bg-emerald-500/10 text-emerald-800",
  Garden:            "bg-teal-500/10 text-teal-800",
  Planning:          "bg-blue-500/10 text-blue-800",
  Tools:             "bg-violet-500/10 text-violet-800",
  Community:         "bg-amber-500/10 text-amber-800",
};

function StatusIcon({ status }: { status: string }) {
  if (status === "completed")
    return <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />;
  if (status === "dismissed")
    return <Clock size={16} className="text-amber-400 shrink-0" />;
  return <Circle size={16} className="text-rhozly-on-surface/20 shrink-0" />;
}

export default function HelpCenterDrawer({ onboardingState, onClose, onStartFlow }: Props) {
  const { pathname } = useLocation();
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<ActiveTab>("guides");
  const [activeDoc, setActiveDoc] = useState<DocEntry | null>(null);
  // Click-to-expand lightbox for embedded doc screenshots.
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setLightbox(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return flowRegistry.filter(
      (f) => !q || f.title.toLowerCase().includes(q) || f.description.toLowerCase().includes(q),
    );
  }, [query]);

  const onPage = filtered.filter((f) => f.route === pathname);
  const allOthers = filtered.filter((f) => f.route !== pathname);

  const grouped = useMemo(() => {
    const map = new Map<FlowCategory, typeof allOthers>();
    CATEGORY_ORDER.forEach((cat) => map.set(cat, []));
    allOthers.forEach((f) => {
      const list = map.get(f.category) ?? [];
      list.push(f);
      map.set(f.category, list);
    });
    return map;
  }, [allOthers]);

  const FlowRow = ({ flowId, title, description, category, estimated_minutes }: {
    flowId: string;
    title: string;
    description: string;
    category: FlowCategory;
    estimated_minutes: number;
  }) => {
    const [isStarting, setIsStarting] = useState(false);
    const status = onboardingState[flowId] ?? "not-started";
    const handleClick = () => {
      setIsStarting(true);
      onStartFlow(flowId);
      toast.success("Guide starting…", { duration: 1500 });
      setTimeout(() => { onClose(); }, 100);
    };
    return (
      <button
        onClick={handleClick}
        disabled={isStarting}
        className="w-full flex items-start gap-3 py-3 px-4 hover:bg-rhozly-surface-low/60 active:bg-rhozly-primary/10 transition-colors rounded-2xl text-left disabled:opacity-70"
      >
        <StatusIcon status={status} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-rhozly-on-surface leading-tight truncate">{title}</p>
          <p className="text-xs font-medium text-rhozly-on-surface/50 mt-0.5 leading-snug line-clamp-2">{description}</p>
          <div className="flex items-center gap-2 mt-1.5">
            <span className={`text-[10px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full ${CATEGORY_COLOUR[category]}`}>
              {category}
            </span>
            <span className="text-[11px] font-bold text-rhozly-on-surface/30">~{estimated_minutes} min</span>
          </div>
        </div>
        {isStarting
          ? <Loader2 size={15} className="shrink-0 mt-0.5 text-rhozly-primary/60 animate-spin" />
          : <ChevronRight size={15} className="shrink-0 mt-0.5 text-rhozly-primary/40" />
        }
      </button>
    );
  };

  return (
    <div className="flex flex-col h-full w-full bg-rhozly-bg">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-rhozly-outline/10 shrink-0 bg-gradient-to-r from-rhozly-primary to-rhozly-primary-container">
        <div className="flex items-center gap-3">
          {activeDoc && (
            <button
              onClick={() => setActiveDoc(null)}
              className="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
              aria-label="Back to documentation list"
            >
              <ArrowLeft size={16} className="text-white/80" />
            </button>
          )}
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-white/50">Rhozly</p>
            <h2 className="text-base font-black text-white leading-tight">
              {activeDoc ? activeDoc.title : "Help & Guides"}
            </h2>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl hover:bg-white/20 transition-colors"
          aria-label="Close help center"
        >
          <X size={18} className="text-white/70" />
        </button>
      </div>

      {/* Tab switcher — hidden when reading a doc */}
      {!activeDoc && (
        <div className="px-4 pt-3 pb-2 border-b border-rhozly-outline/10 shrink-0">
          <div className="flex bg-rhozly-surface-low p-1 rounded-xl gap-1">
            <button
              onClick={() => setActiveTab("guides")}
              data-testid="help-tab-guides"
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-black transition-all ${activeTab === "guides" ? "bg-white text-rhozly-primary shadow-sm" : "text-rhozly-on-surface/50 hover:text-rhozly-on-surface"}`}
            >
              <GraduationCap size={13} />
              Guides
            </button>
            <button
              onClick={() => { setActiveTab("docs"); setActiveDoc(null); }}
              data-testid="help-tab-docs"
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-black transition-all ${activeTab === "docs" ? "bg-white text-rhozly-primary shadow-sm" : "text-rhozly-on-surface/50 hover:text-rhozly-on-surface"}`}
            >
              <BookOpen size={13} />
              Documentation
            </button>
          </div>
        </div>
      )}

      {/* ── GUIDES TAB ── */}
      {activeTab === "guides" && !activeDoc && (
        <>
          {/* Search */}
          <div className="px-4 py-3 border-b border-rhozly-outline/10 shrink-0">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-rhozly-on-surface/30" />
              <input
                type="text"
                placeholder="Search guides…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full pl-9 pr-9 py-2.5 rounded-xl text-sm font-medium bg-rhozly-surface-low border border-rhozly-outline/15 focus:outline-none focus:ring-2 focus:ring-rhozly-primary/30 placeholder:text-rhozly-on-surface/30"
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 p-2 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-full hover:bg-rhozly-outline/20 transition-colors"
                  aria-label="Clear search"
                >
                  <X size={12} className="text-rhozly-on-surface/40" />
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto py-2" role="status" aria-live="polite">
            {onPage.length > 0 && (
              <div className="mb-2">
                <p className="px-5 py-2 text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40">On this page</p>
                {onPage.map((f) => (
                  <FlowRow key={f.id} flowId={f.id} title={f.title} description={f.description} category={f.category} estimated_minutes={f.estimated_minutes} />
                ))}
              </div>
            )}
            {CATEGORY_ORDER.map((cat) => {
              const flows = grouped.get(cat) ?? [];
              if (flows.length === 0) return null;
              return (
                <div key={cat} className="mb-2">
                  <p className="px-5 py-2 text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40">{cat}</p>
                  {flows.map((f) => (
                    <FlowRow key={f.id} flowId={f.id} title={f.title} description={f.description} category={f.category} estimated_minutes={f.estimated_minutes} />
                  ))}
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div className="py-12 text-center">
                <p className="text-sm font-bold text-rhozly-on-surface/30">No guides match your search.</p>
              </div>
            )}
          </div>

          <div className="px-5 py-3 border-t border-rhozly-outline/10 shrink-0 bg-rhozly-surface-low/50">
            {Object.values(onboardingState).filter((v) => v === "completed").length === flowRegistry.length ? (
              <p className="text-[11px] font-black text-emerald-600 text-center">All guides complete! 🎉</p>
            ) : (
              <p className="text-[11px] font-bold text-rhozly-on-surface/30 text-center">
                {Object.values(onboardingState).filter((v) => v === "completed").length} of {flowRegistry.length} guides completed
              </p>
            )}
          </div>
        </>
      )}

      {/* ── DOCS TAB — list ── */}
      {activeTab === "docs" && !activeDoc && (
        <div className="flex-1 overflow-y-auto py-2">
          <p className="px-5 py-3 text-xs font-bold text-rhozly-on-surface/40 leading-snug">
            Detailed reference for every feature in Rhozly.
          </p>
          {DOCS.map((doc) => (
            <button
              key={doc.id}
              onClick={() => setActiveDoc(doc)}
              data-testid={`help-doc-row-${doc.id}`}
              className="w-full flex items-start gap-3 py-3 px-4 hover:bg-rhozly-surface-low/60 active:bg-rhozly-primary/10 transition-colors rounded-2xl text-left"
            >
              <BookOpen size={16} className="text-rhozly-primary/50 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-rhozly-on-surface leading-tight">{doc.title}</p>
                <p className="text-xs font-medium text-rhozly-on-surface/50 mt-0.5 leading-snug line-clamp-2">{doc.description}</p>
              </div>
              <ChevronRight size={15} className="shrink-0 mt-0.5 text-rhozly-primary/40" />
            </button>
          ))}
        </div>
      )}

      {/* ── DOCS TAB — reading view ── */}
      {activeTab === "docs" && activeDoc && (
        <div className="flex-1 overflow-y-auto px-5 py-4 prose-doc">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h1: ({ children }) => (
                <h1 className="text-xl font-black text-rhozly-on-surface mt-6 mb-3 leading-tight first:mt-0">{children}</h1>
              ),
              h2: ({ children }) => (
                <h2 className="text-base font-black text-rhozly-on-surface mt-5 mb-2 leading-tight border-b border-rhozly-outline/10 pb-1">{children}</h2>
              ),
              h3: ({ children }) => (
                <h3 className="text-sm font-black text-rhozly-on-surface mt-4 mb-1.5 leading-tight">{children}</h3>
              ),
              p: ({ children }) => (
                <p className="text-sm font-medium text-rhozly-on-surface/80 leading-relaxed mb-3">{children}</p>
              ),
              ul: ({ children }) => (
                <ul className="mb-3 space-y-1 pl-4 list-disc">{children}</ul>
              ),
              ol: ({ children }) => (
                <ol className="mb-3 space-y-1 pl-4 list-decimal">{children}</ol>
              ),
              li: ({ children, ...props }) => (
                <li className="text-sm font-medium text-rhozly-on-surface/80 leading-relaxed ml-2" {...props}>{children}</li>
              ),
              strong: ({ children }) => (
                <strong className="font-black text-rhozly-on-surface">{children}</strong>
              ),
              blockquote: ({ children }) => (
                <blockquote className="my-3 pl-3 border-l-4 border-rhozly-primary/30 bg-rhozly-primary/5 rounded-r-lg py-2 pr-3">
                  {children}
                </blockquote>
              ),
              img: ({ src, alt }) => {
                const url = typeof src === "string" ? src : undefined;
                return (
                  <figure className="my-4" data-testid="doc-image">
                    <button
                      type="button"
                      onClick={() => url && setLightbox({ src: url, alt: alt ?? "" })}
                      className="block w-full cursor-zoom-in rounded-2xl overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-rhozly-primary/40"
                      aria-label={alt ? `Expand screenshot: ${alt}` : "Expand screenshot"}
                      data-testid="doc-image-trigger"
                    >
                      <img
                        src={url}
                        alt={alt ?? ""}
                        loading="lazy"
                        className="w-full rounded-2xl border border-rhozly-outline/15 shadow-sm bg-rhozly-surface-low transition-transform duration-200 hover:scale-[1.01]"
                      />
                    </button>
                    {alt && (
                      <figcaption className="mt-1.5 text-[11px] font-medium text-rhozly-on-surface/45 text-center italic">
                        {alt} <span className="not-italic text-rhozly-on-surface/30">· tap to expand</span>
                      </figcaption>
                    )}
                  </figure>
                );
              },
              code: ({ children }) => (
                <code className="text-[11px] font-mono bg-rhozly-surface-low px-1.5 py-0.5 rounded-md text-rhozly-primary">{children}</code>
              ),
              pre: ({ children }) => (
                <pre className="text-[11px] font-mono bg-rhozly-surface-low rounded-xl p-3 overflow-x-auto mb-3 text-rhozly-on-surface/70">{children}</pre>
              ),
              table: ({ children }) => (
                <div className="overflow-x-auto mb-4 rounded-xl border border-rhozly-outline/10">
                  <table className="w-full text-xs">{children}</table>
                </div>
              ),
              thead: ({ children }) => (
                <thead className="bg-rhozly-surface-low">{children}</thead>
              ),
              th: ({ children }) => (
                <th className="px-3 py-2 text-left font-black text-rhozly-on-surface text-[11px] uppercase tracking-wider">{children}</th>
              ),
              td: ({ children }) => (
                <td className="px-3 py-2 text-rhozly-on-surface/70 font-medium border-t border-rhozly-outline/10">{children}</td>
              ),
              hr: () => (
                <hr className="my-5 border-rhozly-outline/10" />
              ),
              a: ({ children, href }) => {
                if (href?.startsWith("./") && href.includes(".md")) {
                  const filename = href.replace("./", "").split("#")[0];
                  const docId = filename.replace(/^\d+-/, "").replace(".md", "");
                  const targetDoc = DOCS.find((d) => d.id === docId);
                  if (targetDoc) {
                    return (
                      <button
                        onClick={() => setActiveDoc(targetDoc)}
                        className="text-rhozly-primary font-bold underline underline-offset-2 hover:opacity-75"
                      >
                        {children}
                      </button>
                    );
                  }
                }
                return (
                  <a href={href} target="_blank" rel="noopener noreferrer" className="text-rhozly-primary font-bold underline underline-offset-2 hover:opacity-75">{children}</a>
                );
              },
            }}
          >
            {/* Strip screenshot callout lines — they're placeholder notes for image placement */}
            {activeDoc.content.replace(/^> 📸 Screenshot:.*$/gm, "").replace(/\n{3,}/g, "\n\n")}
          </ReactMarkdown>
        </div>
      )}

      {/* Lightbox — click a doc screenshot to expand it full-screen.
          Portaled to <body> so it escapes the drawer's transformed ancestor
          (a `transform` ancestor would otherwise trap `position: fixed`). */}
      {lightbox && createPortal(
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150"
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Expanded screenshot"
          data-testid="doc-image-lightbox"
        >
          <button
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
            aria-label="Close expanded image"
            data-testid="doc-image-lightbox-close"
          >
            <X size={20} />
          </button>
          <figure
            className="flex flex-col items-center max-w-full max-h-full"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={lightbox.src}
              alt={lightbox.alt}
              className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl"
            />
            {lightbox.alt && (
              <figcaption className="mt-3 text-xs font-medium text-white/70 text-center max-w-2xl px-4">
                {lightbox.alt}
              </figcaption>
            )}
          </figure>
        </div>,
        document.body,
      )}
    </div>
  );
}
