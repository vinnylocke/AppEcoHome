import React, { useState, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "react-hot-toast";
import { supabase } from "../lib/supabase";
import {
  Search,
  Loader2,
  ArrowLeft,
  Clock,
  BarChart,
  AlertTriangle,
  BookOpen,
  ChevronDown,
  Tag,
  Check,
  X,
  RefreshCw,
  Star,
} from "lucide-react";
import CommunityGuidesTab from "./CommunityGuidesTab";
import AppHelpSearch from "./AppHelpSearch";
import ContentFeedback from "./feedback/ContentFeedback";
import { useBetaFeedbackContext } from "../context/BetaFeedbackContext";

const GUIDE_TABS = [
  { id: "rhozly",    label: "Rhozly Guides",   testid: "guides-tab-rhozly" },
  { id: "community", label: "Community Guides", testid: "guides-tab-community" },
  { id: "help",      label: "App Help",         testid: "guides-tab-help" },
] as const;

type GuideTabId = (typeof GUIDE_TABS)[number]["id"];

export default function GuideList() {
  const { requestFeedback } = useBetaFeedbackContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<GuideTabId>(() => {
    const t = searchParams.get("tab") as GuideTabId;
    return t === "community" || t === "help" ? t : "rhozly";
  });
  const autoOpenNew = searchParams.get("open") === "new-guide" && activeTab === "community";
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setCurrentUserId(user.id);
    });
  }, []);
  const [guides, setGuides] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Filtering & Search
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get("q") ?? "");
  const [selectedLabel, setSelectedLabel] = useState<string>("All");
  // UX review 2026-06-15 item 6.1 — explicit "show only saved" filter.
  // Bookmarks already exist + sort to the top; the chip lets the gardener
  // narrow down to *just* their saved guides when they're returning for
  // something specific.
  const [savedOnly, setSavedOnly] = useState(false);

  // 🚀 NEW: Dropdown States
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [labelSearchQuery, setLabelSearchQuery] = useState("");
  const [focusedOptionIndex, setFocusedOptionIndex] = useState(-1);

  // Reading Mode
  const [activeGuide, setActiveGuide] = useState<any | null>(null);
  const [readingVisible, setReadingVisible] = useState(false);
  const [readingLoading, setReadingLoading] = useState(false);

  useEffect(() => {
    if (activeGuide) {
      setReadingLoading(true);
      setReadingVisible(false);
      setTimeout(() => {
        setReadingLoading(false);
        setReadingVisible(true);
      }, 120);
    }
  }, [activeGuide?.id]);

  const [showGuideBanner, setShowGuideBanner] = useState(() => {
    try { return !localStorage.getItem("rhozly_guides_visited"); } catch { return false; }
  });
  const dismissGuideBanner = () => {
    try { localStorage.setItem("rhozly_guides_visited", "1"); } catch { /* ignore */ }
    setShowGuideBanner(false);
  };

  // Reading section progress via nearest scrollable ancestor
  const [readProgress, setReadProgress] = useState(0);
  const readViewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!activeGuide) { setReadProgress(0); return; }
    let scrollEl: HTMLElement | null = readViewRef.current?.parentElement ?? null;
    while (scrollEl && scrollEl !== document.body) {
      const ov = window.getComputedStyle(scrollEl).overflowY;
      if (ov === "auto" || ov === "scroll") break;
      scrollEl = scrollEl.parentElement;
    }
    if (!scrollEl) return;
    const onScroll = () => {
      const scrollable = scrollEl!.scrollHeight - scrollEl!.clientHeight;
      setReadProgress(scrollable > 0 ? Math.round((scrollEl!.scrollTop / scrollable) * 100) : 100);
    };
    scrollEl.addEventListener("scroll", onScroll, { passive: true });
    return () => scrollEl!.removeEventListener("scroll", onScroll);
  }, [activeGuide]);

  // Refs for accessibility
  const dropdownTriggerRef = useRef<HTMLButtonElement>(null);

  const fetchGuides = async () => {
    setIsLoading(true);
    setFetchError(null);
    const { data, error } = await supabase
      .from("guides")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      setFetchError("Could not load guides. Please check your connection and try again.");
    } else if (data) {
      setGuides(data);
    }
    setIsLoading(false);
  };

  // Bookmarks — per-user, cross-device. Loaded once on mount.
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());
  const fetchBookmarks = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("guide_bookmarks")
      .select("guide_id")
      .eq("user_id", user.id);
    setBookmarkedIds(new Set((data ?? []).map((r: any) => r.guide_id)));
  };
  const toggleBookmark = async (guideId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const next = new Set(bookmarkedIds);
    if (next.has(guideId)) {
      next.delete(guideId);
      setBookmarkedIds(next);
      await supabase
        .from("guide_bookmarks")
        .delete()
        .eq("user_id", user.id)
        .eq("guide_id", guideId);
    } else {
      next.add(guideId);
      setBookmarkedIds(next);
      await supabase
        .from("guide_bookmarks")
        .insert({ user_id: user.id, guide_id: guideId });
    }
  };

  useEffect(() => {
    fetchGuides();
    fetchBookmarks();
  }, []);

  // Handle Escape key to close dropdown
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isDropdownOpen) {
        setIsDropdownOpen(false);
        setLabelSearchQuery("");
        setFocusedOptionIndex(-1);
        dropdownTriggerRef.current?.focus();
      }
    };

    if (isDropdownOpen) {
      document.addEventListener("keydown", handleKeyDown);
    } else {
      // Reset focused index when dropdown closes
      setFocusedOptionIndex(-1);
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isDropdownOpen]);

  const allLabels = useMemo(() => {
    const labels = new Set<string>();
    guides.forEach((g) => {
      g.labels?.forEach((l: string) => labels.add(l));
    });
    return ["All", ...Array.from(labels).sort()];
  }, [guides]);

  // 🚀 NEW: Dynamically filter the labels INSIDE the dropdown based on the dropdown's search bar
  const dropdownLabels = useMemo(() => {
    return allLabels.filter((label) =>
      label.toLowerCase().includes(labelSearchQuery.toLowerCase()),
    );
  }, [allLabels, labelSearchQuery]);

  const filteredGuides = useMemo(() => {
    const results = guides.filter((g) => {
      const title = g.data.title?.toLowerCase() || "";
      const subtitle = g.data.subtitle?.toLowerCase() || "";
      const query = searchQuery.toLowerCase().trim();

      // For queries of 2+ chars, also search the body (paragraph + image-caption sections)
      let bodyMatches = false;
      if (query.length >= 2 && Array.isArray(g.data.sections)) {
        for (const section of g.data.sections) {
          const content = typeof section?.content === "string" ? section.content.toLowerCase() : "";
          if (content.includes(query)) { bodyMatches = true; break; }
        }
      }
      const matchesSearch = !query || title.includes(query) || subtitle.includes(query) || bodyMatches;
      const matchesLabel =
        selectedLabel === "All" || g.labels?.includes(selectedLabel);
      const matchesSaved = !savedOnly || bookmarkedIds.has(g.id);

      return matchesSearch && matchesLabel && matchesSaved;
    });
    // Sort: Getting Started always first; then bookmarked guides; then the rest.
    return results.sort((a, b) => {
      const aStarter = a.data.title?.toLowerCase().includes("getting started") ? -2 : 0;
      const bStarter = b.data.title?.toLowerCase().includes("getting started") ? -2 : 0;
      const aBookmark = bookmarkedIds.has(a.id) ? -1 : 0;
      const bBookmark = bookmarkedIds.has(b.id) ? -1 : 0;
      return (aStarter + aBookmark) - (bStarter + bBookmark);
    });
  }, [guides, searchQuery, selectedLabel, bookmarkedIds, savedOnly]);

  const getCoverImage = (guideData: any) => {
    const imgSection = guideData.sections?.find((s: any) => s.type === "image");
    return imgSection ? imgSection.content : null;
  };

  // --- READING VIEW ---
  if (activeGuide) {
    const data = activeGuide.data;
    const coverImage = getCoverImage(data);

    if (readingLoading) {
      return (
        <div className="max-w-4xl mx-auto pb-20 animate-pulse">
          <div className="h-10 w-40 bg-rhozly-surface-low rounded-xl mb-6" />
          <div className="h-64 bg-rhozly-surface-low rounded-3xl mb-6" />
          <div className="space-y-3">
            <div className="h-8 w-3/4 bg-rhozly-surface-low rounded-full" />
            <div className="h-4 w-full bg-rhozly-surface-low rounded-full" />
            <div className="h-4 w-5/6 bg-rhozly-surface-low rounded-full" />
          </div>
        </div>
      );
    }

    return (
      <div
        ref={readViewRef}
        className="max-w-4xl mx-auto pb-20"
        aria-live="polite"
        style={{
          opacity: readingVisible ? 1 : 0,
          transform: readingVisible ? 'translateY(0)' : 'translateY(8px)',
          transition: 'opacity 0.2s ease, transform 0.2s ease',
        }}
      >
        {/* Reading progress bar */}
        <div className="h-1 bg-rhozly-surface-low rounded-full mb-6 overflow-hidden">
          <div
            className="h-full bg-rhozly-primary rounded-full transition-all duration-300"
            style={{ width: `${readProgress}%` }}
            role="progressbar"
            aria-valuenow={readProgress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Reading progress"
          />
        </div>

        <button
          onClick={() => { requestFeedback("guide_read"); setActiveGuide(null); }}
          className="flex items-center gap-2 px-4 py-2 bg-white rounded-xl shadow-sm text-sm font-bold text-rhozly-on-surface hover:bg-rhozly-surface-low mb-6 transition-colors"
        >
          <ArrowLeft size={16} /> Back to Library
        </button>

        <div className="bg-white rounded-3xl p-6 md:p-10 shadow-sm border border-rhozly-outline/10 overflow-hidden">
          <button
            onClick={() => { requestFeedback("guide_read"); setActiveGuide(null); }}
            className="text-xs text-rhozly-primary font-bold mb-4 flex items-center gap-1 hover:underline"
          >
            <ArrowLeft size={12} /> Guides Library
          </button>
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

          {/* Was this guide helpful? — content feedback */}
          <div className="mt-12 pt-6 border-t border-rhozly-outline/10 flex justify-center">
            <ContentFeedback
              surface="rhozly-guide"
              targetKind="guide"
              targetId={String(activeGuide.id)}
              targetLabel={data.title}
              label="Was this guide helpful?"
            />
          </div>
        </div>
      </div>
    );
  }

  // --- LIBRARY DIRECTORY VIEW ---
  return (
    <div className="pb-32 animate-in fade-in duration-500">
      {/* Tab bar */}
      <div className="flex gap-1 overflow-x-auto mb-8">
        {GUIDE_TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          const count = tab.id === "rhozly" && !isLoading ? filteredGuides.length : null;
          return (
            <button
              key={tab.id}
              data-testid={tab.testid}
              onClick={() => setActiveTab(tab.id)}
              className={`shrink-0 px-4 py-3 min-h-[44px] rounded-xl text-xs uppercase tracking-widest transition-all border-b-2 flex items-center gap-2 ${
                isActive
                  ? "font-black text-rhozly-primary border-rhozly-primary bg-rhozly-surface-low"
                  : "font-bold text-rhozly-on-surface/40 border-transparent hover:text-rhozly-on-surface/70 hover:bg-rhozly-surface-low"
              }`}
            >
              {tab.label}
              {count !== null && (
                <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md ${isActive ? "bg-rhozly-primary/15 text-rhozly-primary" : "bg-rhozly-outline/10 text-rhozly-on-surface/40"}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* App Help tab */}
      {activeTab === "help" && <AppHelpSearch />}

      {/* Community tab */}
      {activeTab === "community" && (
        <CommunityGuidesTab
          currentUserId={currentUserId}
          autoOpenNew={autoOpenNew}
          onAutoOpenConsumed={() =>
            setSearchParams((p) => { const n = new URLSearchParams(p); n.delete("open"); n.delete("tab"); return n; }, { replace: true })
          }
        />
      )}

      {/* Rhozly guides tab */}
      {activeTab === "rhozly" && <div>
      <div className="mb-8">
        <h2 className="text-3xl font-black font-display text-rhozly-on-surface">
          Rhozly Guides
        </h2>
        <p className="text-xs font-bold text-rhozly-on-surface/40 uppercase tracking-widest mt-1">
          Guides Library
        </p>
      </div>

      {/* 🚀 UPGRADED: Search & Dropdown Filter Bar */}
      <div className="bg-white p-2 rounded-2xl md:rounded-full shadow-sm border border-rhozly-outline/10 flex flex-col md:flex-row gap-2 mb-8 relative z-30">
        {/* Main Guide Search */}
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

        {/* 🚀 THE NEW SEARCHABLE DROPDOWN */}
        <div className="relative md:min-w-[220px] shrink-0">
          <div className={`w-full h-full flex items-center rounded-xl md:rounded-full transition-colors border ${isDropdownOpen ? "bg-white border-rhozly-primary/30 shadow-sm" : selectedLabel !== "All" ? "bg-rhozly-primary/10 border-rhozly-primary/20" : "bg-rhozly-surface-lowest border-transparent hover:bg-rhozly-outline/5"}`}>
            <button
              ref={dropdownTriggerRef}
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              aria-expanded={isDropdownOpen}
              className="flex-1 flex items-center gap-2 px-5 py-3 overflow-hidden min-h-[44px]"
            >
              <Tag size={16} className={`shrink-0 ${selectedLabel !== "All" ? "text-rhozly-primary" : "text-rhozly-primary"}`} />
              <span className={`text-sm font-bold truncate ${selectedLabel !== "All" ? "text-rhozly-primary" : "text-rhozly-on-surface"}`}>
                {selectedLabel === "All" ? "All Tags" : selectedLabel}
              </span>
              <ChevronDown
                size={16}
                className={`text-rhozly-on-surface/50 shrink-0 transition-transform duration-200 ml-auto ${isDropdownOpen ? "rotate-180 text-rhozly-primary" : ""}`}
              />
            </button>
            {selectedLabel !== "All" && (
              <button
                onClick={() => setSelectedLabel("All")}
                aria-label="Clear tag filter"
                className="min-w-[44px] min-h-[44px] flex items-center justify-center text-rhozly-primary/60 hover:text-rhozly-primary transition-colors"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {isDropdownOpen && (
            <>
              {/* Invisible overlay to catch clicks outside the dropdown */}
              <div
                className="fixed inset-0 z-40"
                onClick={() => {
                  setIsDropdownOpen(false);
                  setLabelSearchQuery(""); // Reset search when closing
                }}
              />

              <div className="absolute right-0 top-full mt-2 w-full md:w-72 bg-white rounded-2xl shadow-xl border border-rhozly-outline/10 z-50 overflow-hidden flex flex-col animate-in fade-in slide-in-from-top-2 duration-200">
                {/* Internal Dropdown Search */}
                <div className="p-3 border-b border-rhozly-outline/5 bg-gray-50/50">
                  <div className="flex items-center px-3 bg-white border border-rhozly-outline/10 rounded-xl shadow-sm focus-within:border-rhozly-primary/50 transition-colors">
                    <Search size={14} className="text-rhozly-on-surface/40" />
                    <input
                      type="text"
                      placeholder="Search tags..."
                      value={labelSearchQuery}
                      onChange={(e) => setLabelSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowDown") {
                          e.preventDefault();
                          setFocusedOptionIndex(0);
                        }
                      }}
                      className="w-full bg-transparent p-2 outline-none text-sm font-bold text-rhozly-on-surface placeholder:text-rhozly-on-surface/30"
                      autoFocus // Automatically focus the keyboard here when opened
                    />
                    {labelSearchQuery && (
                      <button
                        onClick={() => setLabelSearchQuery("")}
                        className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-rhozly-on-surface/40 hover:text-rhozly-on-surface/70"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Scrollable Label List */}
                <div
                  className="max-h-64 overflow-y-auto custom-scrollbar p-2"
                  role="listbox"
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setFocusedOptionIndex((prev) =>
                        prev < dropdownLabels.length - 1 ? prev + 1 : prev
                      );
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setFocusedOptionIndex((prev) => (prev > 0 ? prev - 1 : prev));
                    }
                  }}
                >
                  {dropdownLabels.length === 0 ? (
                    <div className="py-6 text-center text-xs font-bold text-rhozly-on-surface/40 flex flex-col items-center gap-2">
                      <Tag size={20} className="opacity-20" />
                      No matching tags
                    </div>
                  ) : (
                    dropdownLabels.map((label, index) => (
                      <button
                        key={label}
                        role="option"
                        aria-selected={selectedLabel === label}
                        ref={(el) => {
                          if (index === focusedOptionIndex && el) {
                            el.focus();
                          }
                        }}
                        onClick={() => {
                          setSelectedLabel(label);
                          setIsDropdownOpen(false);
                          setLabelSearchQuery(""); // Clean up for next time
                          setFocusedOptionIndex(-1);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelectedLabel(label);
                            setIsDropdownOpen(false);
                            setLabelSearchQuery("");
                            setFocusedOptionIndex(-1);
                            dropdownTriggerRef.current?.focus();
                          }
                        }}
                        className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-colors ${selectedLabel === label ? "bg-rhozly-primary/10 text-rhozly-primary" : "text-rhozly-on-surface/60 hover:bg-rhozly-surface-lowest hover:text-rhozly-on-surface"}`}
                      >
                        <span className="truncate pr-2">{label}</span>
                        {selectedLabel === label && (
                          <Check size={16} className="shrink-0" />
                        )}
                      </button>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* UX review 2026-06-15 item 6.1 — "Saved" filter chip. Only renders
          when the user has at least one bookmark; otherwise it would
          confuse new users. */}
      {bookmarkedIds.size > 0 && (
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          <button
            type="button"
            data-testid="guides-saved-filter-toggle"
            onClick={() => setSavedOnly((v) => !v)}
            aria-pressed={savedOnly}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-full text-xs font-black uppercase tracking-widest transition-colors border ${
              savedOnly
                ? "bg-amber-500 text-white border-amber-500 shadow-sm"
                : "bg-white text-rhozly-on-surface/60 border-rhozly-outline/15 hover:border-amber-300 hover:text-amber-700"
            }`}
          >
            <Star
              size={12}
              className={savedOnly ? "fill-white text-white" : "text-amber-500"}
            />
            {savedOnly ? `Saved (${bookmarkedIds.size})` : "Show saved only"}
          </button>
          {savedOnly && (
            <button
              type="button"
              onClick={() => setSavedOnly(false)}
              className="text-[11px] font-bold text-rhozly-on-surface/45 hover:text-rhozly-on-surface transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* First-visit banner */}
      {showGuideBanner && activeTab === "rhozly" && !isLoading && !fetchError && (
        <div className="flex items-center justify-between gap-3 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3 mb-6">
          <div className="flex items-center gap-3 min-w-0">
            <BookOpen size={18} className="text-emerald-600 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-black text-emerald-800">New to gardening apps?</p>
              <p className="text-xs font-bold text-emerald-600">Read our Getting Started guide first — it covers everything you need to know.</p>
            </div>
          </div>
          {filteredGuides.find(g => g.data.title?.toLowerCase().includes("getting started")) && (
            <button
              data-testid="guide-banner-open-getting-started"
              onClick={() => {
                const g = filteredGuides.find(g => g.data.title?.toLowerCase().includes("getting started"));
                if (g) { setActiveGuide(g); dismissGuideBanner(); }
              }}
              className="shrink-0 px-3 py-1.5 bg-emerald-600 text-white text-xs font-black rounded-xl hover:bg-emerald-700 transition-colors whitespace-nowrap"
            >
              Open Guide
            </button>
          )}
          <button
            data-testid="guide-banner-dismiss"
            onClick={dismissGuideBanner}
            className="shrink-0 p-1 text-emerald-500 hover:text-emerald-700 transition-colors"
            aria-label="Dismiss banner"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Guide Grid */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2
            className="animate-spin text-rhozly-primary mb-4"
            size={40}
          />
          <p className="font-bold text-rhozly-on-surface/40 uppercase tracking-widest text-xs">
            Loading Library...
          </p>
        </div>
      ) : fetchError ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-dashed border-red-200 shadow-sm">
          <AlertTriangle className="mx-auto w-12 h-12 text-red-400 mb-4" />
          <p className="font-black text-xl text-rhozly-on-surface/70 mb-2">
            Failed to load guides
          </p>
          <p className="text-sm font-bold text-rhozly-on-surface/40 mb-6 text-center max-w-xs">
            {fetchError}
          </p>
          <button
            onClick={fetchGuides}
            className="flex items-center gap-2 px-5 py-2.5 bg-rhozly-primary text-white rounded-xl text-sm font-black hover:opacity-90 transition-opacity"
          >
            <RefreshCw size={16} /> Try Again
          </button>
        </div>
      ) : filteredGuides.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-rhozly-outline/20 shadow-sm">
          <BookOpen className="mx-auto w-12 h-12 text-rhozly-on-surface/20 mb-4" />
          <p className="font-black text-xl text-rhozly-on-surface/50 mb-2">
            {/* Cast: inside the rhozly-tab block this comparison is always
                false (dead branch, pre-existing behaviour preserved). */}
            {(activeTab as string) === "community" && !searchQuery && selectedLabel === "All"
              ? "No community guides yet"
              : "No guides found"}
          </p>
          <p className="text-sm font-bold text-rhozly-on-surface/40">
            {(activeTab as string) === "community" && !searchQuery && selectedLabel === "All"
              ? "Be the first to share your garden knowledge!"
              : "Try adjusting your search or tag filters."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 relative z-10">
          {filteredGuides.map((guide) => {
            const cover = getCoverImage(guide.data);
            const isBookmarked = bookmarkedIds.has(guide.id);
            return (
              <div key={guide.id} className="relative">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => { setActiveGuide(guide); toast.success("Opening guide…", { duration: 800 }); }}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setActiveGuide(guide); toast.success("Opening guide…", { duration: 800 }); } }}
                  className="group text-left bg-white rounded-2xl border border-rhozly-outline/10 overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col h-full hover:-translate-y-1 active:scale-[0.98] cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-rhozly-primary"
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
                      <span className="bg-rhozly-surface-low text-rhozly-on-surface text-xs font-black uppercase px-2 py-1 rounded-md">
                        {guide.data.difficulty}
                      </span>
                      <span className="bg-rhozly-surface-low text-rhozly-on-surface text-xs font-black uppercase px-2 py-1 rounded-md">
                        {guide.data.estimated_minutes}m
                      </span>
                      {isBookmarked && (
                        <span className="bg-amber-100 text-amber-800 text-xs font-black uppercase px-2 py-1 rounded-md flex items-center gap-1">
                          <Star size={10} className="fill-amber-600" /> Bookmarked
                        </span>
                      )}
                    </div>
                    <h3 className="text-xl font-black leading-tight mb-2 text-rhozly-on-surface group-hover:text-rhozly-primary transition-colors line-clamp-2">
                      {guide.data.title}
                    </h3>
                    <p className="text-sm font-bold text-rhozly-on-surface/50 line-clamp-2 mb-4">
                      {guide.data.subtitle}
                    </p>

                    <div className="mt-auto pt-4 flex items-center justify-between gap-2 border-t border-rhozly-outline/5">
                      <div className="flex gap-1 flex-wrap min-w-0">
                        {guide.labels?.slice(0, 2).map((l: string) => (
                          <span
                            key={l}
                            className="text-xs font-black text-rhozly-primary/60 uppercase truncate"
                          >
                            #{l}
                          </span>
                        ))}
                        {guide.labels?.length > 2 && (
                          <span className="text-xs font-black text-rhozly-on-surface/30 uppercase">
                            +{guide.labels.length - 2}
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-black text-rhozly-primary shrink-0 group-hover:underline">
                        Read →
                      </span>
                    </div>
                  </div>
                </div>

                {/* Bookmark star — overlays the top-right of the card */}
                <button
                  onClick={(e) => { e.stopPropagation(); toggleBookmark(guide.id); }}
                  aria-label={isBookmarked ? `Remove ${guide.data.title} from bookmarks` : `Bookmark ${guide.data.title}`}
                  data-testid={`guide-bookmark-${guide.id}`}
                  className="absolute top-3 right-3 w-10 h-10 bg-white/90 backdrop-blur-sm rounded-xl shadow-md flex items-center justify-center hover:scale-110 active:scale-95 transition-transform"
                >
                  <Star
                    size={16}
                    className={isBookmarked ? "fill-amber-500 text-amber-500" : "text-rhozly-on-surface/40"}
                  />
                </button>
              </div>
            );
          })}
        </div>
      )}
      </div>}
    </div>
  );
}
