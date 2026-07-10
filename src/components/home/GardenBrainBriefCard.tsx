// Garden Brain Phase 2 — "Your daily brief" on the dashboard.
//
// Renders today's daily_briefs row: the summary voice (AI on Sage/Evergreen,
// deterministic template below), the ranked items (simple density: top 3;
// detailed: all + reasons), and the good-news lines. Feedback thumbs write
// ai_feedback; Refresh (Sage+ — the server enforces tier + rate limit)
// regenerates with the comment threaded into the prompt.

import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Loader2, RefreshCw, Sparkles, ThumbsDown, ThumbsUp } from "lucide-react";
import toast from "react-hot-toast";
import { supabase } from "../../lib/supabase";
import { Logger } from "../../lib/errorHandler";
import { getLocalDateString } from "../../lib/dateUtils";
import { readSnapshot, writeSnapshot } from "../../lib/snapshotCache";

interface BriefItem {
  kind: string;
  title: string;
  reason: string;
  route: string;
}

interface BriefRow {
  brief_date: string;
  generated_by: "deterministic" | "ai";
  payload: {
    summary: string;
    items: BriefItem[];
    goodNews: string[];
    stats: { overdue: number; dueToday: number; windowsOpen: number };
  };
}

export default function GardenBrainBriefCard({
  homeId,
  userId,
  density,
}: {
  homeId: string;
  userId: string | null;
  density: "simple" | "detailed";
}) {
  const navigate = useNavigate();
  const [brief, setBrief] = useState<BriefRow | null>(null);
  const [rated, setRated] = useState<1 | -1 | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [commentOpen, setCommentOpen] = useState(false);
  const [comment, setComment] = useState("");

  const load = useCallback(async () => {
    if (!homeId) return;
    const cached = readSnapshot<BriefRow | null>("daily-brief", homeId);
    if (cached?.data) setBrief(cached.data);
    try {
      const todayStr = getLocalDateString(new Date());
      const { data } = await supabase
        .from("daily_briefs")
        .select("brief_date, generated_by, payload")
        .eq("home_id", homeId)
        .lte("brief_date", todayStr)
        .order("brief_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      // Only show today's (or yesterday's, pre-cron edge) brief — a week-old
      // brief is worse than none.
      if (data && data.brief_date >= getLocalDateString(new Date(Date.now() - 86_400_000))) {
        setBrief(data as BriefRow);
        writeSnapshot("daily-brief", homeId, data);
      } else {
        setBrief(null);
      }
    } catch (err) {
      Logger.error("Daily brief load failed", err, { homeId });
    }
  }, [homeId]);

  useEffect(() => { void load(); }, [load]);

  const rate = async (rating: 1 | -1) => {
    setRated(rating);
    if (rating === -1) setCommentOpen(true);
    try {
      await supabase.from("ai_feedback").insert({
        user_id: userId,
        home_id: homeId,
        function_name: "generate-daily-brief",
        action: "daily_brief",
        rating,
        target_kind: "daily_brief",
        target_id: brief?.brief_date ?? null,
      });
    } catch {
      /* feedback is best-effort */
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      const { error } = await supabase.functions.invoke("generate-daily-brief", {
        body: { homeId, regenerate: true, feedback: comment.trim() || undefined },
      });
      if (error) throw error;
      setCommentOpen(false);
      setComment("");
      await load();
      toast.success("Brief refreshed.");
    } catch (err) {
      Logger.error("Brief regenerate failed", err, { homeId }, "Couldn't refresh the brief — it may be limited to Sage and Evergreen.");
    } finally {
      setRefreshing(false);
    }
  };

  if (!brief) return null;
  const { payload } = brief;
  const items = density === "simple" ? payload.items.slice(0, 3) : payload.items;

  return (
    <div data-testid="daily-brief-card" className="bg-white rounded-3xl border border-rhozly-outline/10 shadow-sm p-4 sm:p-5 space-y-3">
      <div className="flex items-center gap-2">
        <div className="bg-rhozly-primary/10 p-1.5 rounded-xl"><Sparkles size={16} className="text-rhozly-primary" /></div>
        <h3 className="text-sm font-black text-rhozly-on-surface">Your daily brief</h3>
        {brief.generated_by === "ai" && (
          <span className="text-[10px] font-black uppercase tracking-widest text-rhozly-primary/60">head gardener</span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button
            data-testid="daily-brief-thumbs-up"
            onClick={() => void rate(1)}
            disabled={rated !== null}
            className={`p-1.5 rounded-lg transition ${rated === 1 ? "bg-emerald-50 text-emerald-600" : "text-rhozly-on-surface/30 hover:text-emerald-600"}`}
            aria-label="This brief was helpful"
          >
            <ThumbsUp size={13} />
          </button>
          <button
            data-testid="daily-brief-thumbs-down"
            onClick={() => void rate(-1)}
            disabled={rated !== null}
            className={`p-1.5 rounded-lg transition ${rated === -1 ? "bg-rose-50 text-rose-600" : "text-rhozly-on-surface/30 hover:text-rose-600"}`}
            aria-label="This brief wasn't helpful"
          >
            <ThumbsDown size={13} />
          </button>
          {brief.generated_by === "ai" && (
            <button
              data-testid="daily-brief-refresh"
              onClick={() => void refresh()}
              disabled={refreshing}
              className="p-1.5 rounded-lg text-rhozly-on-surface/30 hover:text-rhozly-primary transition disabled:opacity-50"
              aria-label="Refresh the brief"
            >
              {refreshing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            </button>
          )}
        </div>
      </div>

      <p data-testid="daily-brief-summary" className="text-xs font-bold text-rhozly-on-surface/80 leading-relaxed">
        {payload.summary}
      </p>

      {commentOpen && (
        <div className="flex gap-2">
          <input
            data-testid="daily-brief-feedback-input"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="What would make it better?"
            className="flex-1 text-xs font-medium rounded-xl border border-rhozly-outline/15 px-3 py-2"
          />
          {brief.generated_by === "ai" && (
            <button
              onClick={() => void refresh()}
              disabled={refreshing}
              className="text-[11px] font-black px-3 rounded-xl bg-rhozly-primary text-white disabled:opacity-50"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {items.length > 0 && (
        <div className="space-y-1.5">
          {items.map((item, i) => (
            <button
              key={`${item.kind}-${i}`}
              data-testid={`daily-brief-item-${item.kind}`}
              onClick={() => navigate(item.route)}
              className="w-full text-left rounded-xl border border-rhozly-outline/10 px-3 py-2 hover:border-rhozly-primary/30 transition flex items-start gap-2"
            >
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black text-rhozly-on-surface leading-snug">{item.title}</p>
                {density === "detailed" && (
                  <p className="text-[11px] font-medium text-rhozly-on-surface/55 leading-snug mt-0.5">{item.reason}</p>
                )}
              </div>
              <ChevronRight size={14} className="text-rhozly-on-surface/25 shrink-0 mt-0.5" />
            </button>
          ))}
        </div>
      )}

      {payload.goodNews.length > 0 && (
        <div data-testid="daily-brief-goodnews" className="text-[11px] font-bold text-emerald-700 bg-emerald-50 rounded-xl px-3 py-2 space-y-0.5">
          {payload.goodNews.map((g, i) => (<p key={i}>🌱 {g}</p>))}
        </div>
      )}
    </div>
  );
}
