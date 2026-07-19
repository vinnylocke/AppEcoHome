import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Activity,
  Zap,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  User,
  Loader2,
  Download,
  TrendingUp,
  Printer,
  Bot,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { usePermissions } from "../context/HomePermissionsContext";
import InfoTooltip from "./InfoTooltip";
import { getLocalDateString } from "../lib/taskEngine";

interface Props {
  homeId: string;
}

interface UserEvent {
  id: string;
  user_id: string;
  event_type: string;
  meta: Record<string, unknown>;
  created_at: string;
}

interface AiUsageRow {
  id: string;
  created_at: string;
  user_id: string;
  function_name: string;
  action: string | null;
  model: string | null;
  prompt_tokens: number | null;
  candidates_tokens: number | null;
  total_tokens: number | null;
  /** Number of images generated in this call (Imagen). Zero for text/vision-only rows. */
  image_count: number | null;
  /** Per-call image generation cost. Already included in estimated_cost_usd. */
  image_cost_usd: number | null;
  estimated_cost_usd: number | null;
}

interface AiActionRow {
  id: string;
  created_at: string;
  user_id: string;
  tool_name: string;
  risk_level: "auto" | "confirm" | "strong_confirm";
  status: "pending" | "confirmed" | "executed" | "failed" | "cancelled" | "expired";
  preview: string | null;
  tool_args: Record<string, unknown> | null;
  error_message: string | null;
}

const EVENT_LABELS: Record<string, string> = {
  TASK_CREATED: "Created a task",
  TASK_COMPLETED: "Completed a task",
  TASK_UNCOMPLETED: "Marked task incomplete",
  TASK_POSTPONED: "Postponed a task",
  TASK_SKIPPED: "Skipped a task",
  PLANT_ADDED: "Added a plant",
  PLANT_ARCHIVED: "Archived a plant",
  PLANT_VIEWED: "Viewed plant details",
  PLANT_ASSIGNED: "Assigned plant to area",
  PLANT_INSTANCE_PLANTED: "Marked plant as planted",
  PLANT_INSTANCE_ARCHIVED: "Archived plant instance",
  PLANT_INSTANCE_RESTORED: "Restored plant instance",
  PLANT_INSTANCE_DELETED: "Deleted plant instance",
  AILMENT_ADDED: "Added an ailment",
  AILMENT_ARCHIVED: "Archived an ailment",
  AILMENT_RESTORED: "Restored an ailment",
  AILMENT_DELETED: "Deleted an ailment",
  AILMENT_LINKED: "Linked ailment to plant",
  PLAN_CREATED: "Created a garden plan",
  PLAN_RESTORED: "Restored a garden plan",
  PLAN_COMPLETED: "Completed a garden plan",
  PLAN_ARCHIVED: "Archived a garden plan",
  PLAN_DELETED: "Deleted a garden plan",
  VISUALISER_CAPTURE: "Captured visualiser image",
  VISUALISER_ANALYSE: "Ran AI placement analysis",
  GARDEN_QUIZ_DONE: "Completed habit quiz",
  AREA_SCAN_COMPLETED: "Completed area scan",
  SCAN_TASK_ACCEPTED: "Accepted scan-generated task",
  SCAN_AILMENT_LINKED: "Linked ailment from area scan",
  AI_IDENTIFY: "Identified a plant with AI",
  AI_DIAGNOSE: "Diagnosed a plant with AI",
  PLANT_DOCTOR_CHAT_MESSAGE: "Sent Plant Doctor message",
  BLUEPRINT_CREATED: "Created a Routine",
  BLUEPRINT_DELETED: "Deleted a Routine",
  YIELD_RECORDED: "Recorded a yield",
  JOURNAL_ENTRY_ADDED: "Added a journal entry",
  GUIDE_PUBLISHED: "Published a guide",
  GUIDE_STARRED: "Starred a guide",
  GUIDE_COMMENTED: "Commented on a guide",
  SHOPPING_LIST_CREATED: "Created a shopping list",
  SHOPPING_ITEM_ADDED: "Added a shopping item",
  LOCATION_CREATED: "Created a location",
  AREA_CREATED: "Created a garden area",
};

const FUNCTION_LABELS: Record<string, string> = {
  "plant-doctor": "Plant Doctor",
  "plant-doctor-ai": "Plant Doctor",
  "generate-tasks": "Task Generator",
  "scan-area": "Area Scan",
  "generate-guide": "Guide Studio",
  "generate-landscape-plan": "Garden Plan",
  "smart-plant-scheduler": "Planting Scheduler",
  "search-plants-ai": "Plant Search AI",
  "generate-swipe-plants": "Plant Discovery",
  "visualiser-analyse": "Plant Visualiser",
  "app-help": "App Help",
  "generate-ailment-suggestions": "Ailment Suggestions",
  "predict-yield": "Yield Predictor",
  "refresh-behaviour-summary": "Behaviour Summary",
  "garden-manager-report": "Head Gardener — Report",
  "synthesize-garden-brief": "Head Gardener — Brief",
  "head-gardener-chat": "Head Gardener — Chat",
  "insights-feed": "AI Insights Summary",
};

const PAGE_SIZE = 100;

function todayStr() {
  return getLocalDateString(new Date());
}

function thirtyDaysAgoStr() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

function toRangeStart(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toISOString();
}

function toRangeEnd(dateStr: string) {
  return new Date(dateStr + "T23:59:59.999").toISOString();
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" }) +
    " " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function fmtCost(usd: number | null) {
  if (usd == null) return "—";
  if (usd === 0) return "$0.00";
  if (usd < 0.0001) return "< $0.0001";
  return "$" + usd.toFixed(8).replace(/\.?0+$/, "");
}

function fmtCostSummary(usd: number) {
  if (usd === 0) return "$0.00";
  if (usd < 0.01) return "< $0.01";
  return "$" + usd.toFixed(4);
}

function fmtNum(n: number | null) {
  if (n == null) return "—";
  return n.toLocaleString();
}

function metaLabel(key: string) {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function AuditPage({ homeId }: Props) {
  const { role, can, homeMembers } = usePermissions();
  const canViewAll = role === "owner" || role === "admin" || can("audit.view_all");

  const [activeTab, setActiveTab] = useState<"activity" | "ai_usage" | "ai_actions">("activity");
  const [dateFrom, setDateFrom] = useState(thirtyDaysAgoStr);
  const [dateTo, setDateTo] = useState(todayStr);
  const [selectedUserId, setSelectedUserId] = useState<string>("all");

  const [events, setEvents] = useState<UserEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsHasMore, setEventsHasMore] = useState(false);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  const [aiUsage, setAiUsage] = useState<AiUsageRow[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiHasMore, setAiHasMore] = useState(false);

  const [aiActions, setAiActions] = useState<AiActionRow[]>([]);
  const [aiActionsLoading, setAiActionsLoading] = useState(false);
  const [aiActionsHasMore, setAiActionsHasMore] = useState(false);
  const [expandedActionId, setExpandedActionId] = useState<string | null>(null);

  const userMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const member of homeMembers) {
      m[member.user_id] = member.display_name || member.email || member.user_id;
    }
    return m;
  }, [homeMembers]);

  const fetchEvents = useCallback(async (append = false) => {
    setEventsLoading(true);
    try {
      let query = supabase
        .from("user_events")
        .select("id, user_id, event_type, meta, created_at")
        .gte("created_at", toRangeStart(dateFrom))
        .lte("created_at", toRangeEnd(dateTo))
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE + 1);

      if (selectedUserId !== "all") {
        query = query.eq("user_id", selectedUserId);
      }

      if (append) {
        query = query.range(events.length, events.length + PAGE_SIZE);
      }

      const { data } = await query;
      const rows = (data ?? []) as UserEvent[];
      const hasMore = rows.length > PAGE_SIZE;
      if (hasMore) rows.pop();

      setEvents((prev) => (append ? [...prev, ...rows] : rows));
      setEventsHasMore(hasMore);
    } finally {
      setEventsLoading(false);
    }
  }, [dateFrom, dateTo, selectedUserId, events.length]);

  const fetchAiUsage = useCallback(async (append = false) => {
    setAiLoading(true);
    try {
      let query = supabase
        .from("ai_usage_log")
        .select("id, created_at, user_id, function_name, action, model, prompt_tokens, candidates_tokens, total_tokens, image_count, image_cost_usd, estimated_cost_usd")
        .eq("home_id", homeId)
        .gte("created_at", toRangeStart(dateFrom))
        .lte("created_at", toRangeEnd(dateTo))
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE + 1);

      if (selectedUserId !== "all") {
        query = query.eq("user_id", selectedUserId);
      }

      if (append) {
        query = query.range(aiUsage.length, aiUsage.length + PAGE_SIZE);
      }

      const { data } = await query;
      const rows = (data ?? []) as AiUsageRow[];
      const hasMore = rows.length > PAGE_SIZE;
      if (hasMore) rows.pop();

      setAiUsage((prev) => (append ? [...prev, ...rows] : rows));
      setAiHasMore(hasMore);
    } finally {
      setAiLoading(false);
    }
  }, [homeId, dateFrom, dateTo, selectedUserId, aiUsage.length]);

  const fetchAiActions = useCallback(async (append = false) => {
    setAiActionsLoading(true);
    try {
      let query = supabase
        .from("chat_tool_calls")
        .select("id, created_at, user_id, tool_name, risk_level, status, preview, tool_args, error_message")
        .eq("home_id", homeId)
        .gte("created_at", toRangeStart(dateFrom))
        .lte("created_at", toRangeEnd(dateTo))
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE + 1);

      if (selectedUserId !== "all") {
        query = query.eq("user_id", selectedUserId);
      }

      if (append) {
        query = query.range(aiActions.length, aiActions.length + PAGE_SIZE);
      }

      const { data } = await query;
      const rows = (data ?? []) as AiActionRow[];
      const hasMore = rows.length > PAGE_SIZE;
      if (hasMore) rows.pop();

      setAiActions((prev) => (append ? [...prev, ...rows] : rows));
      setAiActionsHasMore(hasMore);
    } finally {
      setAiActionsLoading(false);
    }
  }, [homeId, dateFrom, dateTo, selectedUserId, aiActions.length]);

  useEffect(() => {
    setEvents([]);
    setAiUsage([]);
    setAiActions([]);
    setEventsHasMore(false);
    setAiHasMore(false);
    setAiActionsHasMore(false);
  }, [dateFrom, dateTo, selectedUserId, activeTab]);

  useEffect(() => {
    if (activeTab === "activity") fetchEvents(false);
    else if (activeTab === "ai_usage") fetchAiUsage(false);
    else fetchAiActions(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, dateFrom, dateTo, selectedUserId]);

  const featureSummaries = useMemo(() => {
    const map = new Map<string, { callCount: number; totalTokens: number; totalCost: number }>();
    for (const row of aiUsage) {
      const key = row.function_name;
      const existing = map.get(key) ?? { callCount: 0, totalTokens: 0, totalCost: 0 };
      map.set(key, {
        callCount: existing.callCount + 1,
        totalTokens: existing.totalTokens + (row.total_tokens ?? 0),
        totalCost: existing.totalCost + (row.estimated_cost_usd ?? 0),
      });
    }
    return Array.from(map.entries())
      .map(([fn, s]) => ({ functionName: fn, ...s }))
      .sort((a, b) => b.totalCost - a.totalCost);
  }, [aiUsage]);

  // Today / This Week / This Month cost rollup — answers the most-asked
  // admin question ("what did we spend today?") without relying on the date
  // filter. Always computed against absolute calendar windows so the values
  // remain stable regardless of the visible date range.
  const costByRange = useMemo(() => {
    if (aiUsage.length === 0) return null;
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000); // rolling 7 days incl. today
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    let today = 0;
    let week = 0;
    let month = 0;
    for (const row of aiUsage) {
      const ts = new Date(row.created_at);
      const cost = row.estimated_cost_usd ?? 0;
      if (ts >= monthStart) month += cost;
      if (ts >= weekStart) week += cost;
      if (ts >= todayStart) today += cost;
    }
    return { today, week, month };
  }, [aiUsage]);

  // Cost forecast — projects monthly spend from the current daily run-rate
  // across the active date range. Only meaningful when the range covers ≥1 day
  // entirely in this calendar month.
  const costForecast = useMemo(() => {
    if (aiUsage.length === 0) return null;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const daysElapsed = Math.max(1, Math.floor((today.getTime() - monthStart.getTime()) / (1000 * 60 * 60 * 24)) + 1);
    const daysInMonth = monthEnd.getDate();

    // Sum spend that falls within the current month
    let monthSpend = 0;
    for (const row of aiUsage) {
      const ts = new Date(row.created_at);
      if (ts >= monthStart && ts <= now) {
        monthSpend += row.estimated_cost_usd ?? 0;
      }
    }
    if (monthSpend === 0) return null;
    const dailyRate = monthSpend / daysElapsed;
    const projected = dailyRate * daysInMonth;
    return { monthSpend, projected, daysElapsed, daysInMonth };
  }, [aiUsage]);

  const downloadCsv = () => {
    if (aiUsage.length === 0) return;
    const header = ["Time", "User", "Feature", "Model", "Input tokens", "Output tokens", "Total tokens", "Images", "Image cost USD", "Total cost USD"];
    const csvEscape = (v: any) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = aiUsage.map((r) => [
      r.created_at,
      userMap[r.user_id] ?? r.user_id,
      FUNCTION_LABELS[r.function_name] ?? r.function_name,
      r.model ?? "",
      r.prompt_tokens ?? 0,
      r.candidates_tokens ?? 0,
      r.total_tokens ?? 0,
      r.image_count ?? 0,
      (r.image_cost_usd ?? 0).toFixed(4),
      (r.estimated_cost_usd ?? 0).toFixed(4),
    ]);
    const csv = [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `rhozly-ai-usage-${dateFrom}-to-${dateTo}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const resetFilters = () => {
    const t = todayStr();
    setDateFrom(t);
    setDateTo(t);
    setSelectedUserId("all");
  };

  const isDefaultFilters = dateFrom === todayStr() && dateTo === todayStr() && selectedUserId === "all";

  return (
    <div id="audit-print-root" className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-rhozly-on-surface">Audit Log</h1>
        <p className="text-sm font-bold text-rhozly-on-surface/40 mt-0.5">Home activity and AI usage</p>
        <p className="text-[10px] font-bold text-rhozly-on-surface/40 mt-0.5 hidden print:block">
          Generated {new Date().toLocaleString("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>

      {/* Filter bar */}
      <div className="bg-white border border-rhozly-outline/20 rounded-2xl p-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-[9px] font-black uppercase tracking-widest text-rhozly-on-surface/30">From</label>
          <input
            data-testid="audit-date-from"
            type="date"
            value={dateFrom}
            max={dateTo}
            onChange={(e) => setDateFrom(e.target.value)}
            className="text-sm font-bold text-rhozly-on-surface border border-rhozly-outline/20 rounded-xl px-3 py-1.5 outline-none focus:border-rhozly-primary bg-rhozly-surface/40"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[9px] font-black uppercase tracking-widest text-rhozly-on-surface/30">To</label>
          <input
            data-testid="audit-date-to"
            type="date"
            value={dateTo}
            min={dateFrom}
            onChange={(e) => setDateTo(e.target.value)}
            className="text-sm font-bold text-rhozly-on-surface border border-rhozly-outline/20 rounded-xl px-3 py-1.5 outline-none focus:border-rhozly-primary bg-rhozly-surface/40"
          />
        </div>

        {canViewAll && homeMembers.length > 0 && (
          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-black uppercase tracking-widest text-rhozly-on-surface/30">Member</label>
            <select
              data-testid="audit-user-filter"
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="text-sm font-bold text-rhozly-on-surface border border-rhozly-outline/20 rounded-xl px-3 py-1.5 outline-none focus:border-rhozly-primary bg-rhozly-surface/40"
            >
              <option value="all">All members</option>
              {homeMembers.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.display_name || m.email || m.user_id}
                </option>
              ))}
            </select>
          </div>
        )}

        {!isDefaultFilters && (
          <button
            data-testid="audit-reset-filters"
            onClick={resetFilters}
            className="flex items-center gap-1.5 text-xs font-black text-rhozly-on-surface/40 hover:text-rhozly-primary transition-colors px-3 py-2 rounded-xl hover:bg-rhozly-surface-low self-end"
          >
            <RotateCcw size={12} />
            Reset
          </button>
        )}
      </div>

      {/* Tab switcher */}
      <div className="flex gap-2">
        <button
          data-testid="audit-tab-activity"
          onClick={() => setActiveTab("activity")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-black transition-colors ${activeTab === "activity" ? "bg-rhozly-primary text-white" : "text-rhozly-on-surface/50 hover:bg-rhozly-surface-low"}`}
        >
          <Activity size={14} />
          Activity Log
        </button>
        <button
          data-testid="audit-tab-ai-usage"
          onClick={() => setActiveTab("ai_usage")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-black transition-colors ${activeTab === "ai_usage" ? "bg-rhozly-primary text-white" : "text-rhozly-on-surface/50 hover:bg-rhozly-surface-low"}`}
        >
          <Zap size={14} />
          AI Usage
        </button>
        <button
          data-testid="audit-tab-ai-actions"
          onClick={() => setActiveTab("ai_actions")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-black transition-colors ${activeTab === "ai_actions" ? "bg-rhozly-primary text-white" : "text-rhozly-on-surface/50 hover:bg-rhozly-surface-low"}`}
        >
          <Bot size={14} />
          AI Actions
        </button>
      </div>

      {/* Activity Log tab */}
      {activeTab === "activity" && (
        <div className="space-y-2">
          {eventsLoading && events.length === 0 ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-white border border-rhozly-outline/10 rounded-2xl p-4 animate-pulse">
                  <div className="flex gap-3 items-center">
                    <div className="w-8 h-8 rounded-full bg-rhozly-surface-low shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-32 bg-rhozly-surface-low rounded-full" />
                      <div className="h-2.5 w-48 bg-rhozly-surface-low rounded-full" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : events.length === 0 ? (
            <div className="bg-white border border-rhozly-outline/10 rounded-2xl p-8 text-center">
              <Activity size={32} className="mx-auto mb-3 text-rhozly-on-surface/20" />
              <p className="text-sm font-black text-rhozly-on-surface/40">No activity in this date range</p>
              <p className="text-xs font-bold text-rhozly-on-surface/25 mt-1">Try expanding the date range</p>
            </div>
          ) : (
            <>
              {events.map((event) => {
                const isExpanded = expandedEventId === event.id;
                const label = EVENT_LABELS[event.event_type] ?? event.event_type.toLowerCase().replace(/_/g, " ");
                const memberName = userMap[event.user_id] ?? event.user_id;
                const metaEntries = Object.entries(event.meta ?? {}).filter(([, v]) => v != null && v !== "");

                return (
                  <div
                    key={event.id}
                    className="bg-white border border-rhozly-outline/10 rounded-2xl overflow-hidden"
                  >
                    <button
                      data-testid={`audit-event-${event.id}`}
                      onClick={() => setExpandedEventId(isExpanded ? null : event.id)}
                      className="w-full flex items-center gap-3 p-4 text-left hover:bg-rhozly-surface/30 transition-colors"
                    >
                      <div className="w-8 h-8 rounded-full bg-rhozly-primary/10 flex items-center justify-center shrink-0">
                        <User size={14} className="text-rhozly-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-black text-rhozly-on-surface truncate">{label}</p>
                        <p className="text-xs font-bold text-rhozly-on-surface/40 truncate">
                          {memberName} · {fmtDate(event.created_at)}
                        </p>
                      </div>
                      <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-rhozly-surface text-rhozly-on-surface/40 shrink-0 hidden sm:block">
                        {event.event_type}
                      </span>
                      {metaEntries.length > 0 && (
                        isExpanded
                          ? <ChevronDown size={14} className="text-rhozly-on-surface/30 shrink-0" />
                          : <ChevronRight size={14} className="text-rhozly-on-surface/30 shrink-0" />
                      )}
                    </button>

                    {isExpanded && metaEntries.length > 0 && (
                      <div className="px-4 pb-4 pt-0">
                        <div className="ml-11 bg-rhozly-surface/60 rounded-xl p-3 border border-rhozly-outline/10">
                          <table className="w-full text-xs">
                            <tbody>
                              {metaEntries.map(([key, val]) => (
                                <tr key={key} className="border-b border-rhozly-outline/10 last:border-0">
                                  <td className="py-1 pr-3 font-black text-rhozly-on-surface/40 whitespace-nowrap">{metaLabel(key)}</td>
                                  <td className="py-1 font-bold text-rhozly-on-surface break-all">{String(val)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {eventsHasMore && (
                <button
                  data-testid="audit-events-load-more"
                  onClick={() => fetchEvents(true)}
                  disabled={eventsLoading}
                  className="w-full py-3 rounded-2xl text-sm font-black text-rhozly-primary border border-rhozly-primary/20 hover:bg-rhozly-primary/5 transition-colors flex items-center justify-center gap-2"
                >
                  {eventsLoading ? <Loader2 size={14} className="animate-spin" /> : null}
                  Load more
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* AI Usage tab */}
      {activeTab === "ai_usage" && (
        <div className="space-y-4">
          {/* Feature summary cards */}
          {aiLoading && aiUsage.length === 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="bg-white border border-rhozly-outline/10 rounded-2xl p-4 animate-pulse space-y-2">
                  <div className="h-3 w-24 bg-rhozly-surface-low rounded-full" />
                  <div className="h-2.5 w-16 bg-rhozly-surface-low rounded-full" />
                  <div className="h-2.5 w-20 bg-rhozly-surface-low rounded-full" />
                </div>
              ))}
            </div>
          ) : featureSummaries.length === 0 ? (
            <div className="bg-white border border-rhozly-outline/10 rounded-2xl p-8 text-center">
              <Zap size={32} className="mx-auto mb-3 text-rhozly-on-surface/20" />
              <p className="text-sm font-black text-rhozly-on-surface/40">No AI usage in this date range</p>
              <p className="text-xs font-bold text-rhozly-on-surface/25 mt-1">Try expanding the date range</p>
            </div>
          ) : (
            <>
              {/* Today / This Week / This Month cost strip — answers "what did we spend?" at a glance */}
              {costByRange && (
                <div className="grid grid-cols-3 gap-2 sm:gap-3" data-testid="audit-cost-by-range">
                  <div className="bg-white border border-rhozly-outline/10 rounded-2xl p-3 sm:p-4">
                    <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/30">Today</p>
                    <p className="text-lg sm:text-2xl font-black text-rhozly-on-surface mt-1" data-testid="audit-cost-today">
                      ${costByRange.today.toFixed(2)}
                    </p>
                  </div>
                  <div className="bg-white border border-rhozly-outline/10 rounded-2xl p-3 sm:p-4">
                    <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/30">
                      <span className="inline-flex items-center gap-1">This Week <InfoTooltip content="Rolling 7-day window — sum of estimated AI cost from 6 days ago through today" size={10} /></span>
                    </p>
                    <p className="text-lg sm:text-2xl font-black text-rhozly-on-surface mt-1" data-testid="audit-cost-week">
                      ${costByRange.week.toFixed(2)}
                    </p>
                  </div>
                  <div className="bg-white border border-rhozly-outline/10 rounded-2xl p-3 sm:p-4">
                    <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/30">This Month</p>
                    <p className="text-lg sm:text-2xl font-black text-rhozly-on-surface mt-1" data-testid="audit-cost-month">
                      ${costByRange.month.toFixed(2)}
                    </p>
                  </div>
                </div>
              )}

              {/* Forecast + export bar */}
              <div className="flex items-center gap-3 flex-wrap">
                {costForecast && (
                  <div
                    data-testid="audit-cost-forecast"
                    className="flex-1 min-w-[260px] flex items-center gap-2.5 bg-violet-50 border border-violet-200 rounded-2xl px-4 py-2.5"
                  >
                    <TrendingUp size={14} className="text-violet-700 shrink-0" />
                    <p className="text-xs font-bold text-violet-900 leading-snug">
                      <span className="font-black">On track for ${costForecast.projected.toFixed(2)}</span> this month
                      <span className="text-violet-700/70"> · ${costForecast.monthSpend.toFixed(2)} spent across {costForecast.daysElapsed} of {costForecast.daysInMonth} days</span>
                    </p>
                  </div>
                )}
                <button
                  data-testid="audit-export-csv"
                  onClick={downloadCsv}
                  className="flex items-center gap-1.5 bg-rhozly-primary text-white text-xs font-black px-3 py-2 min-h-[40px] rounded-xl hover:opacity-90 active:scale-95 transition"
                >
                  <Download size={13} />
                  Export CSV
                </button>
                <button
                  data-testid="audit-export-pdf"
                  onClick={() => window.print()}
                  title="Print or save as PDF"
                  className="flex items-center gap-1.5 bg-rhozly-surface-low text-rhozly-on-surface text-xs font-black px-3 py-2 min-h-[40px] rounded-xl hover:bg-rhozly-surface active:scale-95 transition print:hidden"
                >
                  <Printer size={13} />
                  Print / PDF
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {featureSummaries.map((s) => (
                  <div key={s.functionName} className="bg-white border border-rhozly-outline/10 rounded-2xl p-4">
                    <p className="text-sm font-black text-rhozly-on-surface truncate">
                      {FUNCTION_LABELS[s.functionName] ?? s.functionName}
                    </p>
                    <p className="text-[10px] font-bold text-rhozly-on-surface/40 mt-1">
                      {s.callCount} {s.callCount === 1 ? "call" : "calls"} · {fmtNum(s.totalTokens)} tokens
                    </p>
                    <p className="text-base font-black text-rhozly-primary mt-1">{fmtCostSummary(s.totalCost)}</p>
                  </div>
                ))}
              </div>

              <div className="border-t border-rhozly-outline/10" />

              {/* Individual rows */}
              <div className="bg-white border border-rhozly-outline/10 rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-rhozly-outline/10">
                        <th className="text-left px-4 py-3 font-black text-rhozly-on-surface/40 whitespace-nowrap">Time</th>
                        {canViewAll && <th className="text-left px-4 py-3 font-black text-rhozly-on-surface/40 whitespace-nowrap">User</th>}
                        <th className="text-left px-4 py-3 font-black text-rhozly-on-surface/40 whitespace-nowrap">Feature</th>
                        <th className="text-left px-4 py-3 font-black text-rhozly-on-surface/40 whitespace-nowrap">Model</th>
                        <th className="hidden sm:table-cell text-right px-4 py-3 font-black text-rhozly-on-surface/40 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 justify-end">Input <InfoTooltip content="Tokens in your request — the instructions, context, and image data sent to the AI model" size={11} /></span>
                        </th>
                        <th className="hidden sm:table-cell text-right px-4 py-3 font-black text-rhozly-on-surface/40 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 justify-end">Output <InfoTooltip content="Tokens in the AI's reply — the response text generated" size={11} /></span>
                        </th>
                        <th className="text-right px-4 py-3 font-black text-rhozly-on-surface/40 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 justify-end"><span className="sm:hidden">Tokens</span><span className="hidden sm:inline">Total</span> <InfoTooltip content="Total tokens processed (Prompt + Output). Tokens are units of text — roughly 1 token ≈ 4 characters" size={11} /></span>
                        </th>
                        <th className="hidden sm:table-cell text-right px-4 py-3 font-black text-rhozly-on-surface/40 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 justify-end">Images <InfoTooltip content="Imagen-generated images in this call (Reimagine concept images). Each image at $0.02-$0.06 depending on tier" size={11} /></span>
                        </th>
                        <th className="text-right px-4 py-3 font-black text-rhozly-on-surface/40 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 justify-end">Cost <InfoTooltip content="Estimated cost in USD for this AI call — sums token cost + image generation cost" size={11} /></span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {aiUsage.map((row) => (
                        <tr key={row.id} className="border-b border-rhozly-outline/5 last:border-0 hover:bg-rhozly-surface/30 transition-colors">
                          <td className="px-4 py-2.5 font-bold text-rhozly-on-surface/60 whitespace-nowrap">{fmtDate(row.created_at)}</td>
                          {canViewAll && (
                            <td className="px-4 py-2.5 font-bold text-rhozly-on-surface/60 truncate max-w-[120px]">
                              {userMap[row.user_id] ?? row.user_id}
                            </td>
                          )}
                          <td className="px-4 py-2.5 font-bold text-rhozly-on-surface whitespace-nowrap">
                            {FUNCTION_LABELS[row.function_name] ?? row.function_name}
                          </td>
                          <td className="px-4 py-2.5 font-bold text-rhozly-on-surface/40 whitespace-nowrap text-[10px]">
                            {row.model ?? "—"}
                          </td>
                          <td className="hidden sm:table-cell px-4 py-2.5 font-bold text-rhozly-on-surface/60 text-right tabular-nums">{fmtNum(row.prompt_tokens)}</td>
                          <td className="hidden sm:table-cell px-4 py-2.5 font-bold text-rhozly-on-surface/60 text-right tabular-nums">{fmtNum(row.candidates_tokens)}</td>
                          <td className="px-4 py-2.5 font-bold text-rhozly-on-surface text-right tabular-nums">{fmtNum(row.total_tokens)}</td>
                          <td className="hidden sm:table-cell px-4 py-2.5 font-bold text-rhozly-on-surface/60 text-right tabular-nums">
                            {row.image_count && row.image_count > 0
                              ? <span className="text-rhozly-primary">{row.image_count}</span>
                              : "—"}
                          </td>
                          <td className="px-4 py-2.5 font-black text-rhozly-primary text-right tabular-nums whitespace-nowrap">{fmtCost(row.estimated_cost_usd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {aiHasMore && (
                  <div className="px-4 py-3 border-t border-rhozly-outline/10">
                    <button
                      data-testid="audit-ai-load-more"
                      onClick={() => fetchAiUsage(true)}
                      disabled={aiLoading}
                      className="w-full py-2 rounded-xl text-sm font-black text-rhozly-primary border border-rhozly-primary/20 hover:bg-rhozly-primary/5 transition-colors flex items-center justify-center gap-2"
                    >
                      {aiLoading ? <Loader2 size={14} className="animate-spin" /> : null}
                      Load more
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* AI Actions tab — every tool the agent ran in this home */}
      {activeTab === "ai_actions" && (
        <div className="space-y-3">
          {aiActionsLoading && aiActions.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-rhozly-on-surface/40">
              <Loader2 size={20} className="animate-spin" />
            </div>
          ) : aiActions.length === 0 ? (
            <div className="text-center py-12 text-sm font-bold text-rhozly-on-surface/40">
              No AI actions in this range. When the assistant creates tasks, plants,
              schedules etc. on your behalf, they'll be logged here.
            </div>
          ) : (
            <div className="bg-white border border-rhozly-outline/10 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-rhozly-outline/10">
                      <th className="text-left px-4 py-3 font-black text-rhozly-on-surface/40 whitespace-nowrap">Time</th>
                      {canViewAll && <th className="text-left px-4 py-3 font-black text-rhozly-on-surface/40 whitespace-nowrap">User</th>}
                      <th className="text-left px-4 py-3 font-black text-rhozly-on-surface/40 whitespace-nowrap">Action</th>
                      <th className="text-left px-4 py-3 font-black text-rhozly-on-surface/40 whitespace-nowrap">Status</th>
                      <th className="hidden sm:table-cell text-left px-4 py-3 font-black text-rhozly-on-surface/40">What</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aiActions.map((row) => {
                      const statusColour =
                        row.status === "executed" ? "text-emerald-600 bg-emerald-50" :
                        row.status === "failed" ? "text-rose-600 bg-rose-50" :
                        row.status === "cancelled" ? "text-rhozly-on-surface/40 bg-rhozly-surface-low" :
                        row.status === "expired" ? "text-amber-600 bg-amber-50" :
                        "text-blue-600 bg-blue-50";
                      const isExpanded = expandedActionId === row.id;
                      return (
                        <React.Fragment key={row.id}>
                          <tr
                            className="border-b border-rhozly-outline/5 last:border-0 hover:bg-rhozly-surface/30 transition-colors cursor-pointer"
                            onClick={() => setExpandedActionId(isExpanded ? null : row.id)}
                          >
                            <td className="px-4 py-2.5 font-bold text-rhozly-on-surface/60 whitespace-nowrap">{fmtDate(row.created_at)}</td>
                            {canViewAll && (
                              <td className="px-4 py-2.5 font-bold text-rhozly-on-surface/60 truncate max-w-[120px]">
                                {userMap[row.user_id] ?? row.user_id}
                              </td>
                            )}
                            <td className="px-4 py-2.5 font-bold text-rhozly-on-surface whitespace-nowrap">
                              {metaLabel(row.tool_name)}
                              {row.risk_level === "strong_confirm" && (
                                <span className="ml-1.5 text-[9px] font-black uppercase text-amber-600">destructive</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 whitespace-nowrap">
                              <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide ${statusColour}`}>
                                {row.status}
                              </span>
                            </td>
                            <td className="hidden sm:table-cell px-4 py-2.5 font-bold text-rhozly-on-surface/55 max-w-[320px] truncate">
                              {row.preview ?? "—"}
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr className="bg-rhozly-surface/20">
                              <td colSpan={canViewAll ? 5 : 4} className="px-4 py-3">
                                <p className="sm:hidden font-bold text-rhozly-on-surface/70 mb-2">{row.preview ?? "—"}</p>
                                {row.error_message && (
                                  <p className="text-rose-600 font-bold mb-2">Error: {row.error_message}</p>
                                )}
                                <pre className="text-[10px] text-rhozly-on-surface/45 overflow-x-auto bg-white rounded-lg p-2 border border-rhozly-outline/10">
                                  {JSON.stringify(row.tool_args ?? {}, null, 2)}
                                </pre>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {aiActionsHasMore && (
                <div className="px-4 py-3 border-t border-rhozly-outline/10">
                  <button
                    data-testid="audit-ai-actions-load-more"
                    onClick={() => fetchAiActions(true)}
                    disabled={aiActionsLoading}
                    className="w-full py-2 rounded-xl text-sm font-black text-rhozly-primary border border-rhozly-primary/20 hover:bg-rhozly-primary/5 transition-colors flex items-center justify-center gap-2"
                  >
                    {aiActionsLoading ? <Loader2 size={14} className="animate-spin" /> : null}
                    Load more
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
