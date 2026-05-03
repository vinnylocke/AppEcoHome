import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import {
  Loader2,
  BookOpen,
  ArrowLeft,
  Clock,
  BarChart,
  AlertTriangle,
} from "lucide-react";

interface PlantGuidesTabProps {
  plantId: number;
  commonName: string;
}

export default function PlantGuidesTab({
  plantId,
  commonName,
}: PlantGuidesTabProps) {
  const [guides, setGuides] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeGuide, setActiveGuide] = useState<any | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchGuides = async () => {
      setIsLoading(true);
      setActiveGuide(null);

      // Fetch the plant's own labels first, then match guides that overlap
      // with [commonName, ...plantLabels] so both name-specific guides
      // (label = "Tomato") and category guides (label = "Annual") surface.
      const { data: plantRow } = await supabase
        .from("plants")
        .select("labels")
        .eq("id", plantId)
        .single();

      const matchTerms = [
        commonName,
        ...((plantRow?.labels as string[]) ?? []),
      ].filter(Boolean);

      const { data } = await supabase
        .from("guides")
        .select("*")
        .overlaps("labels", matchTerms)
        .order("created_at", { ascending: false });

      if (!cancelled) {
        setGuides(data ?? []);
        setIsLoading(false);
      }
    };

    fetchGuides();
    return () => {
      cancelled = true;
    };
  }, [plantId, commonName]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 opacity-50 animate-in fade-in">
        <Loader2 className="animate-spin text-rhozly-primary mb-4" size={28} />
        <p className="text-sm font-bold">Finding relevant guides...</p>
      </div>
    );
  }

  if (activeGuide) {
    return (
      <GuideReader
        guide={activeGuide}
        onBack={() => setActiveGuide(null)}
      />
    );
  }

  if (guides.length === 0) {
    return (
      <div
        data-testid="guides-empty-state"
        className="flex flex-col items-center justify-center py-16 text-center animate-in fade-in"
      >
        <BookOpen
          className="text-rhozly-on-surface/20 mb-4"
          size={40}
        />
        <p className="font-black text-rhozly-on-surface/40 text-sm uppercase tracking-widest">
          No guides yet
        </p>
        <p className="text-xs font-bold text-rhozly-on-surface/30 mt-1 max-w-xs">
          Guides matching this plant will appear here once available.
        </p>
      </div>
    );
  }

  return (
    <div
      data-testid="plant-guides-list"
      className="space-y-3 animate-in fade-in"
    >
      {guides.map((guide) => (
        <button
          key={guide.id}
          data-testid={`guide-card-${guide.data?.title?.replace(/\s+/g, "-").toLowerCase()}`}
          onClick={() => setActiveGuide(guide)}
          className="w-full text-left p-4 bg-rhozly-surface-low rounded-2xl border border-rhozly-outline/10 hover:border-rhozly-primary/30 hover:bg-rhozly-primary/5 transition-all group"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-black text-rhozly-on-surface text-sm leading-tight truncate group-hover:text-rhozly-primary transition-colors">
                {guide.data?.title}
              </p>
              {guide.data?.subtitle && (
                <p className="text-xs font-bold text-rhozly-on-surface/50 mt-1 leading-snug line-clamp-2">
                  {guide.data.subtitle}
                </p>
              )}
            </div>
            <BookOpen
              size={16}
              className="text-rhozly-primary/40 group-hover:text-rhozly-primary shrink-0 mt-0.5 transition-colors"
            />
          </div>
          <div className="flex gap-2 mt-3">
            {guide.data?.difficulty && (
              <span className="flex items-center gap-1 bg-amber-50 text-amber-700 text-[9px] font-black uppercase px-2 py-1 rounded-lg border border-amber-100">
                <BarChart size={10} /> {guide.data.difficulty}
              </span>
            )}
            {guide.data?.estimated_minutes && (
              <span className="flex items-center gap-1 bg-blue-50 text-blue-700 text-[9px] font-black uppercase px-2 py-1 rounded-lg border border-blue-100">
                <Clock size={10} /> {guide.data.estimated_minutes} min
              </span>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}

function GuideReader({
  guide,
  onBack,
}: {
  guide: any;
  onBack: () => void;
}) {
  const data = guide.data;

  return (
    <div className="animate-in slide-in-from-right-4 duration-300">
      <button
        data-testid="guide-reader-back"
        onClick={onBack}
        className="flex items-center gap-2 px-4 py-2 bg-rhozly-surface-low rounded-xl text-xs font-black text-rhozly-on-surface/60 hover:text-rhozly-on-surface hover:bg-rhozly-surface transition-colors mb-5"
      >
        <ArrowLeft size={14} /> Back to Guides
      </button>

      <div className="flex gap-2 mb-4">
        {data.difficulty && (
          <span className="flex items-center gap-1 bg-amber-50 text-amber-700 text-[9px] font-black uppercase px-3 py-1.5 rounded-lg border border-amber-100">
            <BarChart size={10} /> {data.difficulty}
          </span>
        )}
        {data.estimated_minutes && (
          <span className="flex items-center gap-1 bg-blue-50 text-blue-700 text-[9px] font-black uppercase px-3 py-1.5 rounded-lg border border-blue-100">
            <Clock size={10} /> {data.estimated_minutes} Min
          </span>
        )}
      </div>

      <h2 className="text-2xl font-black text-rhozly-on-surface mb-2 leading-tight">
        {data.title}
      </h2>
      {data.subtitle && (
        <p className="text-sm font-bold text-rhozly-on-surface/50 mb-8 leading-relaxed">
          {data.subtitle}
        </p>
      )}

      <div className="space-y-5">
        {data.sections?.map((sec: any, i: number) => {
          if (sec.type === "header")
            return (
              <h3 key={i} className="text-lg font-black mt-6 mb-2 text-rhozly-on-surface">
                {sec.content}
              </h3>
            );
          if (sec.type === "paragraph")
            return (
              <p key={i} className="text-rhozly-on-surface/80 leading-relaxed text-sm">
                {sec.content}
              </p>
            );
          if (sec.type === "list")
            return (
              <ul key={i} className="list-disc pl-5 space-y-2 text-rhozly-on-surface/80 marker:text-rhozly-primary text-sm">
                {sec.items?.map((item: string, j: number) => (
                  <li key={j} className="pl-1 leading-relaxed">
                    <span
                      dangerouslySetInnerHTML={{
                        __html: item.replace(
                          /\*\*(.*?)\*\*/g,
                          "<strong>$1</strong>",
                        ),
                      }}
                    />
                  </li>
                ))}
              </ul>
            );
          if (sec.type === "tip")
            return (
              <div key={i} className="bg-rhozly-primary/10 border-l-4 border-rhozly-primary p-4 rounded-r-2xl">
                <strong className="text-rhozly-primary text-[9px] uppercase tracking-widest block mb-1.5">
                  Pro Tip
                </strong>
                <p className="font-bold text-rhozly-on-surface/90 text-sm">{sec.content}</p>
              </div>
            );
          if (sec.type === "warning")
            return (
              <div key={i} className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-2xl flex gap-3">
                <AlertTriangle className="text-red-500 shrink-0 mt-0.5" size={18} />
                <p className="font-bold text-red-900 text-sm">{sec.content}</p>
              </div>
            );
          if (sec.type === "image" && sec.content)
            return (
              <div key={i} className="rounded-2xl overflow-hidden border border-rhozly-outline/10">
                <img
                  src={sec.content}
                  alt={sec.caption ?? ""}
                  className="w-full h-auto max-h-64 object-cover"
                  loading="lazy"
                />
                {sec.caption && (
                  <p className="p-3 text-center text-xs font-bold text-rhozly-on-surface/50 border-t border-rhozly-outline/10">
                    {sec.caption}
                  </p>
                )}
              </div>
            );
          return null;
        })}
      </div>
    </div>
  );
}
