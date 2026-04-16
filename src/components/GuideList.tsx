import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabase";
import {
  Search,
  Loader2,
  ArrowLeft,
  Clock,
  BarChart,
  AlertTriangle,
} from "lucide-react";

export default function GuideList() {
  const [guides, setGuides] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filtering & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLabel, setSelectedLabel] = useState<string>("All");

  // Reading Mode
  const [activeGuide, setActiveGuide] = useState<any | null>(null);

  // Fetch all guides on mount
  useEffect(() => {
    const fetchGuides = async () => {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("guides")
        .select("*")
        .order("created_at", { ascending: false });

      if (!error && data) {
        setGuides(data);
      }
      setIsLoading(false);
    };
    fetchGuides();
  }, []);

  // Dynamically extract all unique labels from the database results
  const allLabels = useMemo(() => {
    const labels = new Set<string>();
    guides.forEach((g) => {
      g.labels?.forEach((l: string) => labels.add(l));
    });
    return ["All", ...Array.from(labels).sort()];
  }, [guides]);

  // Apply filters and search
  const filteredGuides = useMemo(() => {
    return guides.filter((g) => {
      const title = g.data.title?.toLowerCase() || "";
      const subtitle = g.data.subtitle?.toLowerCase() || "";
      const query = searchQuery.toLowerCase();

      const matchesSearch = title.includes(query) || subtitle.includes(query);
      const matchesLabel =
        selectedLabel === "All" || g.labels?.includes(selectedLabel);

      return matchesSearch && matchesLabel;
    });
  }, [guides, searchQuery, selectedLabel]);

  // Helper to find the first image in a guide to use as a cover photo
  const getCoverImage = (guideData: any) => {
    const imgSection = guideData.sections?.find((s: any) => s.type === "image");
    return imgSection ? imgSection.content : null;
  };

  // --- READING VIEW ---
  if (activeGuide) {
    const data = activeGuide.data;
    const coverImage = getCoverImage(data);

    return (
      <div className="max-w-3xl mx-auto pb-20 animate-in slide-in-from-right-8 duration-500">
        <button
          onClick={() => setActiveGuide(null)}
          className="flex items-center gap-2 px-4 py-2 bg-white rounded-xl shadow-sm text-sm font-bold text-rhozly-on-surface hover:bg-gray-50 mb-6 transition-colors"
        >
          <ArrowLeft size={16} /> Back to Library
        </button>

        <div className="bg-white rounded-[3rem] p-6 md:p-10 shadow-sm border border-rhozly-outline/10 overflow-hidden">
          {/* Header Info */}
          <div className="flex gap-3 mb-4">
            <span className="flex items-center gap-1 bg-amber-50 text-amber-700 text-[10px] font-black uppercase px-3 py-1.5 rounded-lg border border-amber-100">
              <BarChart size={12} /> {data.difficulty}
            </span>
            <span className="flex items-center gap-1 bg-blue-50 text-blue-700 text-[10px] font-black uppercase px-3 py-1.5 rounded-lg border border-blue-100">
              <Clock size={12} /> {data.estimated_minutes} Min
            </span>
          </div>

          <h1 className="text-3xl md:text-5xl font-black font-display tracking-tight text-rhozly-on-surface mb-4 leading-tight">
            {data.title}
          </h1>
          <p className="text-lg font-bold text-rhozly-on-surface/50 mb-10 leading-relaxed">
            {data.subtitle}
          </p>

          {coverImage && (
            <img
              src={coverImage}
              alt="Cover"
              className="w-full h-64 md:h-96 object-cover rounded-3xl mb-10 shadow-inner"
            />
          )}

          {/* Guide Content Renderer (Exact match to Admin panel) */}
          <div className="space-y-6">
            {data.sections.map((sec: any, index: number) => {
              if (sec.type === "header")
                return (
                  <h3
                    key={index}
                    className="text-2xl font-black mt-10 mb-4 text-rhozly-on-surface"
                  >
                    {sec.content}
                  </h3>
                );
              if (sec.type === "paragraph")
                return (
                  <p
                    key={index}
                    className="text-rhozly-on-surface/80 leading-relaxed text-lg"
                  >
                    {sec.content}
                  </p>
                );
              if (sec.type === "list")
                return (
                  <ul
                    key={index}
                    className="list-disc pl-6 space-y-3 text-rhozly-on-surface/80 marker:text-rhozly-primary text-lg"
                  >
                    {sec.items?.map((item: string, i: number) => (
                      <li key={i} className="pl-1 leading-relaxed">
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
                  <div
                    key={index}
                    className="bg-rhozly-primary/10 border-l-4 border-rhozly-primary p-5 rounded-r-2xl my-8"
                  >
                    <strong className="text-rhozly-primary text-xs uppercase tracking-widest block mb-2">
                      Pro Tip
                    </strong>
                    <p className="font-bold text-rhozly-on-surface/90">
                      {sec.content}
                    </p>
                  </div>
                );
              if (sec.type === "warning")
                return (
                  <div
                    key={index}
                    className="bg-red-50 border-l-4 border-red-500 p-5 rounded-r-2xl flex gap-4 my-8"
                  >
                    <AlertTriangle
                      className="text-red-500 shrink-0"
                      size={24}
                    />
                    <p className="font-bold text-red-900">{sec.content}</p>
                  </div>
                );
              if (sec.type === "image" && sec.content !== coverImage)
                return (
                  <div
                    key={index}
                    className="my-10 rounded-3xl overflow-hidden shadow-sm border border-rhozly-outline/10 bg-[#FAFAFA]"
                  >
                    <div className="p-4 flex justify-center">
                      <img
                        src={sec.content}
                        alt={sec.caption}
                        className="max-w-full h-auto max-h-96 object-contain mix-blend-multiply"
                        loading="lazy"
                      />
                    </div>
                    {sec.caption && (
                      <p className="p-4 text-center text-sm font-bold text-rhozly-on-surface/50 border-t border-rhozly-outline/10">
                        {sec.caption}
                      </p>
                    )}
                  </div>
                );
              return null;
            })}
          </div>
        </div>
      </div>
    );
  }

  // --- LIBRARY DIRECTORY VIEW ---
  return (
    <div className="max-w-5xl mx-auto pb-32 animate-in fade-in duration-500">
      <div className="mb-8">
        <h2 className="text-3xl font-black font-display text-rhozly-on-surface">
          Rhozly Guides
        </h2>
        <p className="text-xs font-bold text-rhozly-on-surface/40 uppercase tracking-widest mt-1">
          Learn & Grow
        </p>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white p-2 rounded-2xl md:rounded-full shadow-sm border border-rhozly-outline/10 flex flex-col md:flex-row gap-2 mb-8">
        <div className="flex-1 flex items-center px-4 bg-rhozly-surface-lowest rounded-xl md:rounded-full">
          <Search size={18} className="text-rhozly-on-surface/40" />
          <input
            type="text"
            placeholder="Search guides..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-transparent p-3 outline-none text-sm font-bold text-rhozly-on-surface placeholder:text-rhozly-on-surface/30"
          />
        </div>

        {/* Scrollable Label Pills */}
        <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar px-2 py-1 md:max-w-[50%]">
          {allLabels.map((label) => (
            <button
              key={label}
              onClick={() => setSelectedLabel(label)}
              className={`shrink-0 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${selectedLabel === label ? "bg-rhozly-primary text-white shadow-md" : "bg-rhozly-surface-low text-rhozly-on-surface/50 hover:bg-rhozly-outline/10"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Guide Grid */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2
            className="animate-spin text-rhozly-primary mb-4"
            size={40}
          />
          <p className="font-bold text-rhozly-on-surface/40 uppercase tracking-widest text-[10px]">
            Loading Library...
          </p>
        </div>
      ) : filteredGuides.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-rhozly-outline/20">
          <p className="font-black text-xl text-rhozly-on-surface/40 mb-2">
            No guides found
          </p>
          <p className="text-sm font-bold text-rhozly-on-surface/30">
            Try adjusting your search or filters.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredGuides.map((guide) => {
            const cover = getCoverImage(guide.data);
            return (
              <button
                key={guide.id}
                onClick={() => setActiveGuide(guide)}
                className="group text-left bg-white rounded-[2rem] border border-rhozly-outline/10 overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col h-full hover:-translate-y-1"
              >
                {cover ? (
                  <div className="h-48 overflow-hidden bg-gray-100">
                    <img
                      src={cover}
                      alt="cover"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      loading="lazy"
                    />
                  </div>
                ) : (
                  <div className="h-48 bg-gradient-to-br from-rhozly-surface-low to-rhozly-surface flex items-center justify-center">
                    <BookOpen size={48} className="text-rhozly-on-surface/10" />
                  </div>
                )}

                <div className="p-6 flex flex-col flex-1">
                  <div className="flex gap-2 mb-3 flex-wrap">
                    <span className="bg-rhozly-surface-low text-rhozly-on-surface text-[9px] font-black uppercase px-2 py-1 rounded-md">
                      {guide.data.difficulty}
                    </span>
                    <span className="bg-rhozly-surface-low text-rhozly-on-surface text-[9px] font-black uppercase px-2 py-1 rounded-md">
                      {guide.data.estimated_minutes}m
                    </span>
                  </div>
                  <h3 className="text-xl font-black leading-tight mb-2 text-rhozly-on-surface group-hover:text-rhozly-primary transition-colors line-clamp-2">
                    {guide.data.title}
                  </h3>
                  <p className="text-sm font-bold text-rhozly-on-surface/50 line-clamp-2 mb-4">
                    {guide.data.subtitle}
                  </p>

                  {/* Label preview */}
                  <div className="mt-auto pt-4 flex gap-1 flex-wrap border-t border-rhozly-outline/5">
                    {guide.labels?.slice(0, 3).map((l: string) => (
                      <span
                        key={l}
                        className="text-[9px] font-black text-rhozly-primary/60 uppercase"
                      >
                        #{l}
                      </span>
                    ))}
                    {guide.labels?.length > 3 && (
                      <span className="text-[9px] font-black text-rhozly-on-surface/30 uppercase">
                        +{guide.labels.length - 3}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
