import React, { useState, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { CheckCircle2, Clock, Circle, X, Search, ChevronRight } from "lucide-react";
import { flowRegistry } from "./flowRegistry";
import type { FlowCategory, OnboardingState } from "./types";

interface Props {
  onboardingState: OnboardingState;
  onClose: () => void;
  onStartFlow: (flowId: string) => void;
}

const CATEGORY_ORDER: FlowCategory[] = [
  "Getting Started",
  "Garden",
  "Planning",
  "Tools",
  "Community",
];

const CATEGORY_COLOUR: Record<FlowCategory, string> = {
  "Getting Started": "bg-emerald-100 text-emerald-700",
  Garden:            "bg-teal-100 text-teal-700",
  Planning:          "bg-blue-100 text-blue-700",
  Tools:             "bg-violet-100 text-violet-700",
  Community:         "bg-amber-100 text-amber-700",
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

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return flowRegistry.filter(
      (f) => !q || f.title.toLowerCase().includes(q) || f.description.toLowerCase().includes(q),
    );
  }, [query]);

  const onPage = filtered.filter(
    (f) => f.route === pathname || f.route === "global",
  );
  const allOthers = filtered.filter(
    (f) => f.route !== pathname && f.route !== "global",
  );

  // Group allOthers by category
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
    const status = onboardingState[flowId] ?? "not-started";
    return (
      <div className="flex items-start gap-3 py-3 px-4 hover:bg-rhozly-surface-low/60 transition-colors rounded-2xl group">
        <StatusIcon status={status} />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-black text-rhozly-on-surface leading-tight truncate">{title}</p>
          <p className="text-[11px] font-medium text-rhozly-on-surface/50 mt-0.5 leading-snug line-clamp-2">{description}</p>
          <div className="flex items-center gap-2 mt-1.5">
            <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full ${CATEGORY_COLOUR[category]}`}>
              {category}
            </span>
            <span className="text-[10px] font-bold text-rhozly-on-surface/30">~{estimated_minutes} min</span>
          </div>
        </div>
        <button
          onClick={() => { onStartFlow(flowId); onClose(); }}
          className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-xl text-[11px] font-black bg-rhozly-primary/8 text-rhozly-primary hover:bg-rhozly-primary hover:text-white transition-all opacity-0 group-hover:opacity-100"
        >
          {status === "completed" ? "Rerun" : "Start"} <ChevronRight size={11} />
        </button>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-rhozly-bg">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-rhozly-outline/10 shrink-0 bg-gradient-to-r from-rhozly-primary to-rhozly-primary-container">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-white/50">Rhozly</p>
          <h2 className="text-base font-black text-white leading-tight">Help & Guides</h2>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-xl hover:bg-white/20 transition-colors"
          aria-label="Close help center"
        >
          <X size={18} className="text-white/70" />
        </button>
      </div>

      {/* Search */}
      <div className="px-4 py-3 border-b border-rhozly-outline/10 shrink-0">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-rhozly-on-surface/30" />
          <input
            type="text"
            placeholder="Search guides…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 rounded-xl text-[13px] font-medium bg-rhozly-surface-low border border-rhozly-outline/15 focus:outline-none focus:ring-2 focus:ring-rhozly-primary/30 placeholder:text-rhozly-on-surface/30"
          />
        </div>
      </div>

      {/* Scrollable list */}
      <div className="flex-1 overflow-y-auto py-2">
        {/* On this page */}
        {onPage.length > 0 && (
          <div className="mb-2">
            <p className="px-5 py-2 text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40">
              On this page
            </p>
            {onPage.map((f) => (
              <FlowRow
                key={f.id}
                flowId={f.id}
                title={f.title}
                description={f.description}
                category={f.category}
                estimated_minutes={f.estimated_minutes}
              />
            ))}
          </div>
        )}

        {/* All other guides by category */}
        {CATEGORY_ORDER.map((cat) => {
          const flows = grouped.get(cat) ?? [];
          if (flows.length === 0) return null;
          return (
            <div key={cat} className="mb-2">
              <p className="px-5 py-2 text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40">
                {cat}
              </p>
              {flows.map((f) => (
                <FlowRow
                  key={f.id}
                  flowId={f.id}
                  title={f.title}
                  description={f.description}
                  category={f.category}
                  estimated_minutes={f.estimated_minutes}
                />
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

      {/* Footer */}
      <div className="px-5 py-3 border-t border-rhozly-outline/10 shrink-0 bg-rhozly-surface-low/50">
        <p className="text-[10px] font-bold text-rhozly-on-surface/30 text-center">
          {Object.values(onboardingState).filter((v) => v === "completed").length} of {flowRegistry.length} guides completed
        </p>
      </div>
    </div>
  );
}
