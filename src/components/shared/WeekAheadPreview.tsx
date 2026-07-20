import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarRange, ChevronRight, Loader2 } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Logger } from "../../lib/errorHandler";

// ─── WeekAheadPreview ──────────────────────────────────────────────────
//
// Dashboard sneak-peek card. Reads the latest weekly_overviews row for
// the home and renders a chip strip summarising the upcoming week —
// task count, weather alerts, sow/harvest windows. Tapping the card
// navigates to /weekly. When no overview exists yet, the card shows a
// generic "tap to generate" CTA.

interface WeeklyPayload {
  task_counts?: Record<string, number>;
  weather_events?: { kind: string }[];
  sow_this_week?: unknown[];
  harvest_this_week?: unknown[];
  prune_this_week?: unknown[];
  week_start?: string;
  week_end?: string;
}

interface Props { homeId: string }

function formatRange(startStr?: string, endStr?: string): string {
  if (!startStr || !endStr) return "";
  const start = new Date(startStr + "T12:00:00Z");
  const end = new Date(endStr + "T12:00:00Z");
  const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  return `${fmt(start)} – ${fmt(end)}`;
}

// Derive the chip-strip text from the payload. Pure — easy to unit test.
export function describeWeekChips(p: WeeklyPayload | null): string[] {
  if (!p) return [];
  const out: string[] = [];

  // Redesign Stage 2 — the task-count and weather-alert chips were stripped:
  // the hero + task list own today's numbers and the global banner owns
  // alerts. The Week card leads with its OWN fact family — the week's
  // sow / harvest / prune windows.
  const sow = p.sow_this_week?.length ?? 0;
  if (sow > 0) out.push(`${sow} to sow`);

  const harvest = p.harvest_this_week?.length ?? 0;
  if (harvest > 0) out.push(`${harvest} to harvest`);

  const prune = p.prune_this_week?.length ?? 0;
  if (prune > 0) out.push(`${prune} pruning window${prune === 1 ? "" : "s"}`);

  return out;
}

export default function WeekAheadPreview({ homeId }: Props) {
  const navigate = useNavigate();
  const [payload, setPayload] = useState<WeeklyPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("weekly_overviews")
          .select("payload")
          .eq("home_id", homeId)
          .order("week_start", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (cancelled) return;
        if (error) throw error;
        setPayload((data?.payload as WeeklyPayload | undefined) ?? null);
      } catch (err) {
        if (cancelled) return;
        Logger.error("WeekAheadPreview load failed", err);
        setPayload(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [homeId]);

  const chips = describeWeekChips(payload);
  const range = formatRange(payload?.week_start, payload?.week_end);
  const hasData = !!payload && chips.length > 0;

  return (
    <button
      type="button"
      onClick={() => navigate("/weekly")}
      data-testid="dash-week-ahead-card"
      className="w-full text-left rounded-3xl bg-gradient-to-br from-amber-50 to-amber-50/40 border border-amber-200/60 p-4 sm:p-5 shadow-sm hover:shadow-md hover:border-amber-300/80 transition-all group"
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-9 h-9 rounded-2xl bg-amber-100 flex items-center justify-center text-amber-700">
          <CalendarRange size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-amber-700/80">
              Your week ahead
            </p>
            {range && (
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-700/60 shrink-0">
                {range}
              </p>
            )}
          </div>

          {loading ? (
            <div className="flex items-center gap-2 mt-1.5 text-amber-700/60">
              <Loader2 size={14} className="animate-spin" />
              <span className="text-xs font-bold">Loading…</span>
            </div>
          ) : hasData ? (
            <>
              <p className="text-sm font-black text-amber-900 leading-snug mt-1">
                {chips.join(" · ")}
              </p>
              <p className="text-[11px] font-bold text-amber-700/70 mt-1 inline-flex items-center gap-1 group-hover:gap-1.5 transition-all">
                Open week
                <ChevronRight size={12} />
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-black text-amber-900 leading-snug mt-1">
                Plan your Sunday
              </p>
              <p className="text-[11px] font-bold text-amber-700/70 mt-1 inline-flex items-center gap-1 group-hover:gap-1.5 transition-all">
                Tap to generate this week's overview
                <ChevronRight size={12} />
              </p>
            </>
          )}
        </div>
      </div>
    </button>
  );
}
