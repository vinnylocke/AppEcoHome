import React, { useEffect, useRef, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Search, X, Loader2, MapPin, ChevronRight, ClipboardList } from "lucide-react";
import { supabase } from "../lib/supabase";
import { IconPlant, IconPlanner, IconAilment, IconGuides } from "../constants/icons";

interface Props {
  homeId: string | null;
}

// UX review 2026-06-15, item 2.3. Show the right modifier symbol per platform
// so Windows / Linux users don't see ⌘K and assume the shortcut is Mac-only.
const IS_MAC = typeof navigator !== "undefined" && /mac/i.test(navigator.platform);
const MOD_SYMBOL = IS_MAC ? "⌘" : "Ctrl";
const SHORTCUT_LABEL = `${MOD_SYMBOL}${IS_MAC ? "K" : "+K"}`;

interface ResultRow {
  id: string;
  label: string;
  sub?: string;
  group: "plants" | "tasks" | "plans" | "areas" | "guides" | "ailments";
  navigate: string;
}

const GROUP_META: Record<ResultRow["group"], { label: string; icon: React.ComponentType<{ size?: number; className?: string }>; colour: string }> = {
  plants:   { label: "Plants",    icon: IconPlant,     colour: "text-emerald-600" },
  tasks:    { label: "Tasks",     icon: ClipboardList, colour: "text-sky-600"     },
  plans:    { label: "Plans",     icon: IconPlanner,   colour: "text-violet-600"  },
  areas:    { label: "Areas",     icon: MapPin,        colour: "text-amber-600"   },
  guides:   { label: "Guides",    icon: IconGuides,    colour: "text-rose-600"    },
  ailments: { label: "Ailments",  icon: IconAilment,   colour: "text-orange-600"  },
};

const TYPE_FILTER_ALIAS: Record<string, ResultRow["group"]> = {
  plant: "plants",     plants: "plants",
  task:  "tasks",      tasks:  "tasks",
  plan:  "plans",      plans:  "plans",
  area:  "areas",      areas:  "areas",
  guide: "guides",     guides: "guides",
  ailment: "ailments", ailments: "ailments",
};

interface ParsedQuery {
  /** type filter, if user typed `type:plant tomato` */
  group: ResultRow["group"] | null;
  /** the remaining keyword after stripping filter syntax */
  keyword: string;
  /** the raw original input for display */
  raw: string;
}

function parseQuery(input: string): ParsedQuery {
  const trimmed = input.trim();
  // Match `type:something rest of query` (case-insensitive)
  const m = trimmed.match(/^type:(\w+)\s*(.*)$/i);
  if (m) {
    const alias = m[1].toLowerCase();
    const group = TYPE_FILTER_ALIAS[alias] ?? null;
    return { group, keyword: m[2].trim(), raw: trimmed };
  }
  return { group: null, keyword: trimmed, raw: trimmed };
}

const RECENT_LS_KEY = "rhozly_global_search_recent";

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_LS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((s) => typeof s === "string").slice(0, 5) : [];
  } catch { return []; }
}

function pushRecent(query: string) {
  try {
    const trimmed = query.trim();
    if (!trimmed) return;
    const current = loadRecent().filter((s) => s.toLowerCase() !== trimmed.toLowerCase());
    const next = [trimmed, ...current].slice(0, 5);
    localStorage.setItem(RECENT_LS_KEY, JSON.stringify(next));
  } catch { /* ignore */ }
}

export default function GlobalSearch({ homeId }: Props) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [recent, setRecent] = useState<string[]>(() => loadRecent());
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Global keyboard shortcuts: Cmd/Ctrl+K, "/" (when not in an input)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isTyping = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || (target as any).isContentEditable);

      // Cmd/Ctrl+K — always opens search
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      // "/" only opens when not currently typing
      if (e.key === "/" && !isTyping && !open) {
        e.preventDefault();
        setOpen(true);
        return;
      }
      // Esc closes when open
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  // Autofocus input when modal opens
  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      // Defer until DOM is rendered
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const parsed = useMemo(() => parseQuery(query), [query]);

  // Debounced search — fetches each enabled group in parallel
  useEffect(() => {
    if (!open || !homeId) return;
    const q = parsed.keyword;
    // If the user typed only `type:plant` with no keyword, run an open-ended
    // search of that type. Otherwise require ≥ 2 chars.
    if (!parsed.group && q.length < 2) {
      setResults([]);
      return;
    }
    if (parsed.group && q.length < 1) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      // For a no-keyword type:X search, fall back to "first N items of that type"
      const like = q ? `%${q}%` : "%";
      const want = (g: ResultRow["group"]) => !parsed.group || parsed.group === g;

      try {
        const [plants, tasks, plans, areas, ailments, guides] = await Promise.all([
          want("plants")
            ? supabase
                .from("inventory_items")
                .select("id, plant_name, nickname, area_name, area_id")
                .eq("home_id", homeId)
                .or(`plant_name.ilike.${like},nickname.ilike.${like}`)
                .limit(8)
            : Promise.resolve({ data: [] }),
          want("tasks")
            ? supabase
                .from("tasks")
                .select("id, title, type, due_date, location_id")
                .eq("home_id", homeId)
                .ilike("title", like)
                .neq("status", "Completed")
                .neq("status", "Skipped")
                .order("due_date", { ascending: true })
                .limit(8)
            : Promise.resolve({ data: [] }),
          want("plans")
            ? supabase
                .from("plans")
                .select("id, name, status, description")
                .eq("home_id", homeId)
                .ilike("name", like)
                .limit(6)
            : Promise.resolve({ data: [] }),
          want("areas")
            ? supabase
                .from("areas")
                .select("id, name, location_id, locations!inner(name, home_id)")
                .eq("locations.home_id", homeId)
                .ilike("name", like)
                .limit(6)
            : Promise.resolve({ data: [] }),
          want("ailments")
            ? supabase
                .from("ailments")
                .select("id, name, type, scientific_name")
                .eq("home_id", homeId)
                .or(`name.ilike.${like},scientific_name.ilike.${like}`)
                .limit(6)
            : Promise.resolve({ data: [] }),
          want("guides")
            ? supabase
                .from("guides")
                .select("id, data, is_published")
                .eq("is_published", true)
                .limit(40)
            : Promise.resolve({ data: [] }),
        ]);
        if (cancelled) return;

        const rows: ResultRow[] = [];
        (plants.data ?? []).forEach((p: any) => rows.push({
          id: `plant-${p.id}`,
          label: p.nickname || p.plant_name || "Unnamed plant",
          sub: p.area_name ? `in ${p.area_name}` : undefined,
          group: "plants",
          navigate: "/shed",
        }));
        (tasks.data ?? []).forEach((t: any) => rows.push({
          id: `task-${t.id}`,
          label: t.title || "Task",
          sub: t.due_date ? `${t.type ?? "Task"} · due ${formatDueDate(t.due_date)}` : (t.type ?? ""),
          group: "tasks",
          navigate: "/schedule",
        }));
        (plans.data ?? []).forEach((p: any) => rows.push({
          id: `plan-${p.id}`,
          label: p.name || "Plan",
          sub: p.status ?? undefined,
          group: "plans",
          navigate: "/planner",
        }));
        (areas.data ?? []).forEach((a: any) => rows.push({
          id: `area-${a.id}`,
          label: a.name || "Area",
          sub: a.locations?.name ? `in ${a.locations.name}` : undefined,
          group: "areas",
          navigate: "/management",
        }));
        (ailments.data ?? []).forEach((a: any) => rows.push({
          id: `ailment-${a.id}`,
          label: a.name || "Ailment",
          sub: [a.type, a.scientific_name].filter(Boolean).join(" · ") || undefined,
          group: "ailments",
          navigate: "/shed?tab=watchlist",
        }));
        // Guides need client-side filtering since data is JSON
        const lowerQ = q.toLowerCase();
        ((guides.data ?? []) as any[]).slice(0, 200).forEach((g: any) => {
          if (!g.data) return;
          const title = (g.data.title ?? "").toLowerCase();
          const subtitle = (g.data.subtitle ?? "").toLowerCase();
          let bodyMatch = false;
          if (lowerQ && Array.isArray(g.data.sections)) {
            for (const s of g.data.sections) {
              if (typeof s?.content === "string" && s.content.toLowerCase().includes(lowerQ)) { bodyMatch = true; break; }
            }
          }
          if (!lowerQ || title.includes(lowerQ) || subtitle.includes(lowerQ) || bodyMatch) {
            rows.push({
              id: `guide-${g.id}`,
              label: g.data.title ?? "Guide",
              sub: g.data.subtitle ?? undefined,
              group: "guides",
              navigate: `/guides?q=${encodeURIComponent(q || g.data.title?.split(" ")[0] || "")}`,
            });
          }
        });

        setResults(rows);
      } catch { /* ignore */ }
      finally { if (!cancelled) setLoading(false); }
    }, 250);

    return () => { cancelled = true; clearTimeout(timer); };
  }, [parsed.keyword, parsed.group, open, homeId]);

  const grouped = useMemo(() => {
    const map = new Map<ResultRow["group"], ResultRow[]>();
    for (const row of results) {
      const existing = map.get(row.group) ?? [];
      existing.push(row);
      map.set(row.group, existing);
    }
    return map;
  }, [results]);

  // Flatten results in display order so arrow keys can step through them
  const flatResults = useMemo(() => {
    const order: ResultRow["group"][] = ["plants", "tasks", "plans", "areas", "ailments", "guides"];
    const out: ResultRow[] = [];
    order.forEach((g) => { (grouped.get(g) ?? []).forEach((r) => out.push(r)); });
    return out;
  }, [grouped]);

  // Reset highlight when results change
  useEffect(() => { setActiveIndex(0); }, [flatResults.length, query]);

  const handlePick = (row: ResultRow) => {
    pushRecent(query);
    setRecent(loadRecent());
    setOpen(false);
    navigate(row.navigate);
  };

  const handleInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      if (flatResults.length === 0) return;
      e.preventDefault();
      setActiveIndex((i) => Math.min(flatResults.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      if (flatResults.length === 0) return;
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      const row = flatResults[activeIndex];
      if (row) {
        e.preventDefault();
        handlePick(row);
      }
    }
  };

  return (
    <>
      <button
        data-testid="global-search-open"
        onClick={() => setOpen(true)}
        aria-label={`Search Rhozly (${SHORTCUT_LABEL} or /)`}
        title={`Search (${SHORTCUT_LABEL})`}
        className="flex items-center gap-2 px-3 py-2 min-h-[40px] rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-bold transition-colors"
      >
        <Search size={14} />
        <span className="hidden md:inline">Search</span>
        <kbd className="hidden md:inline-flex items-center px-1.5 py-0.5 rounded-md bg-white/20 text-[10px] font-bold tracking-widest border border-white/15">
          {SHORTCUT_LABEL}
        </kbd>
      </button>

      {open && createPortal(
        <div
          data-testid="global-search-modal"
          className="fixed inset-0 z-[100] flex items-start justify-center pt-20 sm:pt-32 px-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-xl bg-rhozly-bg rounded-3xl shadow-2xl border border-rhozly-outline/15 overflow-hidden animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Search input */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-rhozly-outline/10">
              <Search size={18} className="text-rhozly-on-surface/40 shrink-0" />
              <input
                ref={inputRef}
                data-testid="global-search-input"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleInputKey}
                placeholder="Search plants, tasks, plans, areas, ailments, guides…"
                className="flex-1 bg-transparent outline-none text-base font-bold text-rhozly-on-surface placeholder:text-rhozly-on-surface/30"
              />
              {loading && <Loader2 size={16} className="animate-spin text-rhozly-primary shrink-0" />}
              <button
                onClick={() => setOpen(false)}
                aria-label="Close search"
                className="p-1 text-rhozly-on-surface/30 hover:text-rhozly-on-surface/60 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="max-h-[60vh] overflow-y-auto">
              {/* Active filter chip — shown when query starts with `type:X` */}
              {parsed.group && (
                <div className="px-5 pt-3 -mb-1">
                  <span
                    data-testid="global-search-active-filter"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rhozly-primary/10 border border-rhozly-primary/20 text-[10px] font-black uppercase tracking-widest text-rhozly-primary"
                  >
                    Filtering: {GROUP_META[parsed.group].label}
                    <button
                      onClick={() => setQuery(parsed.keyword)}
                      className="text-rhozly-primary/60 hover:text-rhozly-primary"
                      aria-label="Clear filter"
                    >
                      <X size={11} />
                    </button>
                  </span>
                </div>
              )}

              {/* Empty state — show recent + tips */}
              {parsed.keyword.length < 2 && !parsed.group && (
                <div className="p-5 space-y-4">
                  {recent.length > 0 && (
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-2">Recent</p>
                      <div className="flex flex-wrap gap-2">
                        {recent.map((r) => (
                          <button
                            key={r}
                            onClick={() => setQuery(r)}
                            className="px-3 py-1.5 min-h-[32px] rounded-full bg-rhozly-surface-low border border-rhozly-outline/15 text-xs font-bold text-rhozly-on-surface/70 hover:border-rhozly-primary/30 hover:text-rhozly-primary transition-colors"
                          >
                            {r}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-2">
                      Filter by type
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {(["plants", "tasks", "plans", "areas", "ailments", "guides"] as const).map((g) => {
                        const Icon = GROUP_META[g].icon;
                        return (
                          <button
                            key={g}
                            data-testid={`global-search-filter-${g}`}
                            onClick={() => { setQuery(`type:${g} `); inputRef.current?.focus(); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 min-h-[32px] rounded-full bg-rhozly-surface-low border border-rhozly-outline/15 text-xs font-bold text-rhozly-on-surface/70 hover:border-rhozly-primary/30 hover:text-rhozly-primary transition-colors"
                          >
                            <Icon size={11} className={GROUP_META[g].colour} />
                            {GROUP_META[g].label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="text-[11px] font-bold text-rhozly-on-surface/45 leading-relaxed pt-1 border-t border-rhozly-outline/10">
                    <p className="text-rhozly-on-surface/30 mb-1">
                      Shortcuts: <kbd className="px-1 py-0.5 rounded bg-rhozly-surface-low border border-rhozly-outline/15 font-mono">{SHORTCUT_LABEL}</kbd> open · <kbd className="px-1 py-0.5 rounded bg-rhozly-surface-low border border-rhozly-outline/15 font-mono">/</kbd> open · <kbd className="px-1 py-0.5 rounded bg-rhozly-surface-low border border-rhozly-outline/15 font-mono">↑↓</kbd> navigate · <kbd className="px-1 py-0.5 rounded bg-rhozly-surface-low border border-rhozly-outline/15 font-mono">⏎</kbd> open
                    </p>
                    <p className="text-rhozly-on-surface/30">
                      Power: type <code className="font-mono text-rhozly-primary/60">type:plant tomato</code> to filter scope.
                    </p>
                  </div>
                </div>
              )}

              {/* Results */}
              {(parsed.keyword.length >= 2 || parsed.group) && !loading && results.length === 0 && (
                <div className="px-5 py-10 text-center">
                  <p className="text-sm font-black text-rhozly-on-surface/40 mb-1">No matches found</p>
                  <p className="text-xs font-bold text-rhozly-on-surface/30">Try a shorter or different keyword.</p>
                </div>
              )}

              {results.length > 0 && (() => {
                let runningIdx = 0;
                return Array.from(grouped.entries()).map(([group, rows]) => {
                  const meta = GROUP_META[group];
                  const Icon = meta.icon;
                  return (
                    <div key={group} className="px-2 py-2">
                      <p className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40">
                        {meta.label}
                      </p>
                      {rows.map((row) => {
                        const idx = runningIdx++;
                        const isActive = idx === activeIndex;
                        return (
                          <button
                            key={row.id}
                            data-testid={`global-search-result-${row.id}`}
                            onClick={() => handlePick(row)}
                            onMouseEnter={() => setActiveIndex(idx)}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 min-h-[44px] rounded-xl transition-colors text-left group ${
                              isActive ? "bg-rhozly-primary/10" : "hover:bg-rhozly-primary/5"
                            }`}
                          >
                            <div className={`p-1.5 rounded-lg bg-rhozly-surface-low ${meta.colour} shrink-0`}>
                              <Icon size={14} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-rhozly-on-surface truncate">{row.label}</p>
                              {row.sub && <p className="text-[11px] font-bold text-rhozly-on-surface/45 truncate">{row.sub}</p>}
                            </div>
                            <ChevronRight size={13} className={`shrink-0 transition-colors ${isActive ? "text-rhozly-primary" : "text-rhozly-on-surface/30 group-hover:text-rhozly-primary"}`} />
                          </button>
                        );
                      })}
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function formatDueDate(dueDate: string): string {
  const d = new Date(dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(d);
  due.setHours(0, 0, 0, 0);
  const diff = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff === -1) return "yesterday";
  if (diff < 0) return `${Math.abs(diff)}d ago`;
  if (diff <= 7) return `in ${diff}d`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
