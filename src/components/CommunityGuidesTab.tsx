import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Search,
  Tag,
  ChevronDown,
  Check,
  X,
  BookOpen,
  Star,
  MessageCircle,
  Loader2,
  PenLine,
} from "lucide-react";
import {
  useCommunityGuides,
  fetchDistinctLabels,
  type CommunityGuide,
} from "../hooks/useCommunityGuides";
import CommunityGuideReader from "./CommunityGuideReader";
import CommunityGuideEditor from "./CommunityGuideEditor";

interface Props {
  currentUserId: string | null;
}

type Sort = "latest" | "starred";

export default function CommunityGuidesTab({ currentUserId }: Props) {
  const [sort, setSort] = useState<Sort>("latest");
  const [selectedLabel, setSelectedLabel] = useState<string>("All");
  const [search, setSearch] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [labelSearch, setLabelSearch] = useState("");
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [allLabels, setAllLabels] = useState<string[]>(["All"]);
  const [activeGuideId, setActiveGuideId] = useState<string | null>(null);
  const [editGuide, setEditGuide] = useState<CommunityGuide | null | "new">(null);
  const dropdownRef = useRef<HTMLButtonElement>(null);

  const { guides, isLoading, refetch } = useCommunityGuides({ sort, labelFilter: selectedLabel, search });

  useEffect(() => {
    fetchDistinctLabels().then((labels) => setAllLabels(["All", ...labels]));
  }, []);

  const dropdownLabels = useMemo(
    () => allLabels.filter((l) => l.toLowerCase().includes(labelSearch.toLowerCase())),
    [allLabels, labelSearch]
  );

  useEffect(() => {
    if (!isDropdownOpen) setFocusedIndex(-1);
  }, [isDropdownOpen]);

  if (activeGuideId && editGuide === null) {
    const guide = guides.find((g) => g.id === activeGuideId) ?? null;
    return (
      <CommunityGuideReader
        guideId={activeGuideId}
        currentUserId={currentUserId}
        onBack={() => setActiveGuideId(null)}
        onEdit={
          guide && currentUserId === guide.author_id
            ? () => setEditGuide(guide)
            : undefined
        }
      />
    );
  }

  if (editGuide !== null) {
    const isNew = editGuide === "new";
    return (
      <CommunityGuideEditor
        guideId={isNew ? undefined : (editGuide as CommunityGuide).id}
        initialData={isNew ? undefined : (editGuide as CommunityGuide)}
        onClose={() => {
          setEditGuide(null);
          if (!isNew) setActiveGuideId(activeGuideId);
        }}
        onSaved={(id) => {
          setEditGuide(null);
          setActiveGuideId(id);
          refetch();
        }}
      />
    );
  }

  return (
    <div className="max-w-5xl mx-auto pb-32 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-3xl font-black font-display text-rhozly-on-surface">
            Community Guides
          </h2>
          <p className="text-xs font-bold text-rhozly-on-surface/40 uppercase tracking-widest mt-1">
            Written by growers, for growers
          </p>
        </div>
        <button
          data-testid="write-guide-btn"
          onClick={() => setEditGuide("new")}
          className="flex items-center gap-2 px-5 py-3 bg-rhozly-primary text-white rounded-2xl text-sm font-black hover:opacity-90 transition-opacity shrink-0 ml-4"
        >
          <PenLine size={15} />
          Write a Guide
        </button>
      </div>

      {/* Search + filter bar */}
      <div className="bg-white p-2 rounded-2xl md:rounded-full shadow-sm border border-rhozly-outline/10 flex flex-col md:flex-row gap-2 mb-6 relative z-30">
        {/* Search */}
        <div className="flex-1 flex items-center px-4 bg-rhozly-surface-lowest rounded-xl md:rounded-full">
          <Search size={18} className="text-rhozly-on-surface/40" />
          <input
            type="text"
            placeholder="Search community guides…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-transparent p-3 outline-none text-sm font-bold text-rhozly-on-surface placeholder:text-rhozly-on-surface/30"
          />
        </div>

        {/* Sort */}
        <div className="flex gap-1 px-2 items-center shrink-0">
          <SortBtn active={sort === "latest"} onClick={() => setSort("latest")}>Latest</SortBtn>
          <SortBtn active={sort === "starred"} onClick={() => setSort("starred")}>
            <Star size={12} /> Most Starred
          </SortBtn>
        </div>

        {/* Label dropdown */}
        <div className="relative md:min-w-[200px] shrink-0">
          <button
            ref={dropdownRef}
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            aria-expanded={isDropdownOpen}
            className={`w-full h-full flex items-center justify-between px-5 py-3 rounded-xl md:rounded-full transition-colors border ${
              isDropdownOpen
                ? "bg-white border-rhozly-primary/30 shadow-sm"
                : "bg-rhozly-surface-lowest border-transparent hover:bg-rhozly-outline/5"
            }`}
          >
            <div className="flex items-center gap-2 overflow-hidden">
              <Tag size={16} className="text-rhozly-primary shrink-0" />
              <span className="text-sm font-bold text-rhozly-on-surface truncate">
                {selectedLabel === "All" ? "All Tags" : selectedLabel}
              </span>
            </div>
            <ChevronDown
              size={16}
              className={`text-rhozly-on-surface/50 shrink-0 transition-transform duration-200 ${isDropdownOpen ? "rotate-180 text-rhozly-primary" : ""}`}
            />
          </button>

          {isDropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => { setIsDropdownOpen(false); setLabelSearch(""); }}
              />
              <div className="absolute right-0 top-full mt-2 w-full md:w-64 bg-white rounded-2xl shadow-xl border border-rhozly-outline/10 z-50 overflow-hidden flex flex-col animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="p-3 border-b border-rhozly-outline/5 bg-gray-50/50">
                  <div className="flex items-center px-3 bg-white border border-rhozly-outline/10 rounded-xl shadow-sm focus-within:border-rhozly-primary/50 transition-colors">
                    <Search size={14} className="text-rhozly-on-surface/40" />
                    <input
                      type="text"
                      placeholder="Search tags…"
                      value={labelSearch}
                      onChange={(e) => setLabelSearch(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); setFocusedIndex(0); } }}
                      className="w-full bg-transparent p-2 outline-none text-sm font-bold text-rhozly-on-surface placeholder:text-rhozly-on-surface/30"
                      autoFocus
                    />
                    {labelSearch && (
                      <button onClick={() => setLabelSearch("")} className="p-1 text-gray-400 hover:text-gray-600">
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>
                <div
                  className="max-h-56 overflow-y-auto p-2"
                  role="listbox"
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown") { e.preventDefault(); setFocusedIndex((p) => Math.min(p + 1, dropdownLabels.length - 1)); }
                    else if (e.key === "ArrowUp") { e.preventDefault(); setFocusedIndex((p) => Math.max(p - 1, 0)); }
                  }}
                >
                  {dropdownLabels.length === 0 ? (
                    <div className="py-6 text-center text-xs font-bold text-rhozly-on-surface/40">No matching tags</div>
                  ) : (
                    dropdownLabels.map((label, i) => (
                      <button
                        key={label}
                        role="option"
                        aria-selected={selectedLabel === label}
                        ref={(el) => { if (i === focusedIndex && el) el.focus(); }}
                        onClick={() => { setSelectedLabel(label); setIsDropdownOpen(false); setLabelSearch(""); setFocusedIndex(-1); }}
                        className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-colors ${
                          selectedLabel === label
                            ? "bg-rhozly-primary/10 text-rhozly-primary"
                            : "text-rhozly-on-surface/60 hover:bg-rhozly-surface-lowest hover:text-rhozly-on-surface"
                        }`}
                      >
                        <span className="truncate pr-2">{label}</span>
                        {selectedLabel === label && <Check size={14} className="shrink-0" />}
                      </button>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Guide grid */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="animate-spin text-rhozly-primary mb-4" size={40} />
          <p className="font-bold text-rhozly-on-surface/40 uppercase tracking-widest text-xs">Loading…</p>
        </div>
      ) : guides.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-rhozly-outline/20 shadow-sm">
          <BookOpen className="mx-auto w-12 h-12 text-rhozly-on-surface/20 mb-4" />
          <p className="font-black text-xl text-rhozly-on-surface/50 mb-2">No community guides yet</p>
          <p className="text-sm font-bold text-rhozly-on-surface/40 mb-6">Be the first to write one!</p>
          <button
            onClick={() => setEditGuide("new")}
            className="flex items-center gap-2 mx-auto px-5 py-2.5 bg-rhozly-primary text-white rounded-xl text-sm font-black hover:opacity-90 transition-opacity"
          >
            <PenLine size={15} /> Write a Guide
          </button>
        </div>
      ) : (
        <div
          data-testid="community-guides-list"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          {guides.map((guide) => (
            <GuideCard
              key={guide.id}
              guide={guide}
              currentUserId={currentUserId}
              onClick={() => setActiveGuideId(guide.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function GuideCard({
  guide,
  currentUserId,
  onClick,
}: {
  guide: CommunityGuide;
  currentUserId: string | null;
  onClick(): void;
}) {
  const authorName = guide.user_profiles?.display_name ?? "Member";

  return (
    <button
      data-testid={`community-guide-card-${guide.id}`}
      onClick={onClick}
      className="group text-left bg-white rounded-2xl border border-rhozly-outline/10 overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col h-full hover:-translate-y-1"
    >
      {/* Cover placeholder */}
      <div className="h-28 bg-gradient-to-br from-rhozly-surface-low to-rhozly-surface flex items-center justify-center shrink-0">
        <BookOpen size={32} className="text-rhozly-primary/20 group-hover:text-rhozly-primary/30 transition-colors" />
      </div>

      <div className="p-5 flex flex-col flex-1">
        {/* Author */}
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 rounded-full bg-rhozly-primary/10 flex items-center justify-center text-rhozly-primary text-[10px] font-black shrink-0">
            {authorName[0]?.toUpperCase() ?? "?"}
          </div>
          <span className="text-xs font-bold text-rhozly-on-surface/50 truncate">{authorName}</span>
          {currentUserId === guide.author_id && (
            <span className="ml-auto text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-rhozly-primary/10 text-rhozly-primary shrink-0">
              You
            </span>
          )}
        </div>

        <h3 className="text-lg font-black leading-tight mb-1.5 text-rhozly-on-surface group-hover:text-rhozly-primary transition-colors line-clamp-2">
          {guide.title}
        </h3>
        {guide.subtitle && (
          <p className="text-sm font-bold text-rhozly-on-surface/50 line-clamp-2 mb-3 leading-snug">
            {guide.subtitle}
          </p>
        )}

        <div className="mt-auto pt-3 border-t border-rhozly-outline/5">
          {/* Labels */}
          {guide.labels.length > 0 && (
            <div className="flex gap-1 flex-wrap mb-2">
              {guide.labels.slice(0, 3).map((l) => (
                <span key={l} className="text-[10px] font-black text-rhozly-primary/60 uppercase">
                  #{l}
                </span>
              ))}
              {guide.labels.length > 3 && (
                <span className="text-[10px] font-black text-rhozly-on-surface/30 uppercase">
                  +{guide.labels.length - 3}
                </span>
              )}
            </div>
          )}
          {/* Stats */}
          <div className="flex items-center gap-3 text-[10px] font-black text-rhozly-on-surface/40 uppercase tracking-widest">
            <span className="flex items-center gap-1">
              <Star size={10} /> {guide.star_count}
            </span>
            <span className="flex items-center gap-1">
              <MessageCircle size={10} /> {guide.comment_count}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

function SortBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick(): void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black transition-colors ${
        active
          ? "bg-rhozly-primary text-white"
          : "text-rhozly-on-surface/50 hover:bg-rhozly-surface-lowest hover:text-rhozly-on-surface"
      }`}
    >
      {children}
    </button>
  );
}
