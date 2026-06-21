import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, RefreshCw, ThumbsUp, ThumbsDown, MessageSquareText } from "lucide-react";
import { supabase } from "../../lib/supabase";

interface FeedbackRow {
  id: string;
  created_at: string;
  user_id: string | null;
  home_id: string | null;
  surface: string;
  target_kind: string | null;
  target_id: string | null;
  target_label: string | null;
  rating: number;
  comment: string | null;
}

interface Props {
  isAdmin: boolean;
}

const COLS =
  "id, created_at, user_id, home_id, surface, target_kind, target_id, target_label, rating, comment";

export default function ContentFeedbackAdmin({ isAdmin }: Props) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<FeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [surfaceFilter, setSurfaceFilter] = useState("");
  const [ratingFilter, setRatingFilter] = useState<"all" | "up" | "down">("all");

  useEffect(() => {
    if (!isAdmin) navigate("/dashboard", { replace: true });
  }, [isAdmin, navigate]);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("content_feedback")
      .select(COLS)
      .order("created_at", { ascending: false })
      .limit(300);
    if (surfaceFilter) q = q.eq("surface", surfaceFilter);
    if (ratingFilter !== "all") q = q.eq("rating", ratingFilter === "up" ? 1 : -1);
    const { data } = await q;
    setRows((data as FeedbackRow[]) ?? []);
    setLoading(false);
  }, [surfaceFilter, ratingFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const surfaces = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => set.add(r.surface));
    return Array.from(set).sort();
  }, [rows]);

  const ups = rows.filter((r) => r.rating === 1).length;
  const downs = rows.filter((r) => r.rating === -1).length;

  if (!isAdmin) return null;

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 space-y-4" data-testid="content-feedback-admin">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-rhozly-on-surface flex items-center gap-2">
            <MessageSquareText size={18} className="text-rhozly-primary" /> Content Feedback
          </h1>
          <p className="text-xs font-bold text-rhozly-on-surface/40 mt-0.5">
            User 👍/👎 + reports on guides, documentation and workflows.
          </p>
        </div>
        <button
          data-testid="content-feedback-refresh"
          onClick={() => void load()}
          className="flex items-center gap-1.5 text-xs font-black text-rhozly-primary px-3 py-2 rounded-xl hover:bg-rhozly-surface transition-colors"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Filters + summary */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          data-testid="content-feedback-surface-filter"
          value={surfaceFilter}
          onChange={(e) => setSurfaceFilter(e.target.value)}
          className="text-xs font-bold bg-white border border-rhozly-outline/20 rounded-lg px-2 py-1.5"
        >
          <option value="">All surfaces</option>
          {surfaces.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <div className="flex bg-rhozly-surface-low rounded-lg p-0.5 text-xs font-black">
          {(["all", "up", "down"] as const).map((r) => (
            <button
              key={r}
              data-testid={`content-feedback-rating-${r}`}
              onClick={() => setRatingFilter(r)}
              className={`px-2.5 py-1 rounded-md transition-colors ${ratingFilter === r ? "bg-white text-rhozly-primary shadow-sm" : "text-rhozly-on-surface/50"}`}
            >
              {r === "all" ? "All" : r === "up" ? "👍" : "👎"}
            </button>
          ))}
        </div>
        <span className="text-xs font-bold text-rhozly-on-surface/40 ml-auto">
          <span className="text-emerald-600">{ups} 👍</span> · <span className="text-red-600">{downs} 👎</span>
        </span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-rhozly-on-surface/40">
          <Loader2 size={22} className="animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <div className="py-16 text-center text-sm font-bold text-rhozly-on-surface/30">
          No feedback yet.
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div
              key={r.id}
              data-testid="content-feedback-row"
              className="bg-white border border-rhozly-outline/15 rounded-xl p-3 flex items-start gap-3"
            >
              {r.rating === 1 ? (
                <ThumbsUp size={15} className="text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <ThumbsDown size={15} className="text-red-600 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-black uppercase tracking-widest text-rhozly-primary bg-rhozly-primary/10 px-1.5 py-0.5 rounded">
                    {r.surface}
                  </span>
                  {r.target_label && (
                    <span className="text-xs font-black text-rhozly-on-surface truncate">{r.target_label}</span>
                  )}
                </div>
                {r.comment && (
                  <p className="text-sm font-medium text-rhozly-on-surface/80 mt-1 leading-snug">“{r.comment}”</p>
                )}
                <p className="text-[10px] font-bold text-rhozly-on-surface/30 mt-1">
                  {new Date(r.created_at).toLocaleString()}
                  {r.target_id ? ` · ${r.target_id}` : ""}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
