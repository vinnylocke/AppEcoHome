import React, { useEffect, useMemo, useState } from "react";
import {
  Sparkles,
  Loader2,
  RefreshCw,
  Lock,
  BookOpenCheck,
  AlertCircle,
  CalendarPlus,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { Logger } from "../lib/errorHandler";
import toast from "react-hot-toast";
import {
  PlantDoctorService,
  type PlantGrowGuide,
} from "../services/plantDoctorService";
import GuideSectionCard from "./growGuide/GuideSectionCard";
import AddToCalendarSheet from "./growGuide/AddToCalendarSheet";
import {
  flattenSectionsForCalendar,
  type SchedulableTask,
} from "../lib/scheduleFromSchedulableTask";

interface Props {
  plantId: number;
  commonName: string;
  source: "manual" | "api" | "ai" | "verdantly";
  homeId: string;
  aiEnabled: boolean;
  /**
   * When true, the tab fires `handleGenerate` automatically the first
   * time it mounts and the plant has no cached guide. Used by The Library
   * preview screen so users don't have to tap a separate Generate button
   * after they've already tapped the tab.
   *
   * The Plant Edit Modal keeps the manual button-driven flow (default
   * false) so users with many plants don't burn AI credit on every visit.
   */
  autoGenerate?: boolean;
}

interface LoadedGuide {
  guide: PlantGrowGuide;
  lastGeneratedAt: string;
  freshnessVersion: number;
}

const STALE_DAYS = 90;

function isStale(lastGeneratedAt: string): boolean {
  const ts = new Date(lastGeneratedAt).getTime();
  return Date.now() - ts > STALE_DAYS * 864e5;
}

function relativeDays(iso: string): string {
  const days = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 864e5));
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.round(days / 365);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

/**
 * The Grow Guide tab — a comprehensive 9-section AI-generated guide for
 * a plant species. Catalogue-level (one guide per plants.id, shared
 * across all home members and across home boundaries for global rows).
 *
 * States:
 *   - loading: initial cache check
 *   - empty:   no row in plant_grow_guides yet → Generate button
 *   - loaded:  guide is present; rendered with collapsible sections
 *   - loaded stale: same as loaded + Refresh affordance
 *   - generating: spinner overlay while Gemini call is in flight
 *   - error:   inline banner + Retry
 */
export default function GrowGuideTab({
  plantId,
  commonName,
  source,
  homeId,
  aiEnabled,
  autoGenerate = false,
}: Props) {
  const [loaded, setLoaded] = useState<LoadedGuide | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Fire-once guard for autoGenerate — without this, a re-render after the
  // generate fails would loop and retry forever.
  const [autoGenAttempted, setAutoGenAttempted] = useState(false);
  // Bulk "Add all to calendar" sheet open state. Lives at the top of
  // the component so the rules of hooks don't trip when the loaded
  // branch returns early.
  const [bulkOpen, setBulkOpen] = useState(false);

  // Initial cache check — direct table read, no edge fn invocation needed.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const { data, error: queryErr } = await supabase
          .from("plant_grow_guides")
          .select("guide_data, last_generated_at, freshness_version")
          .eq("plant_id", plantId)
          .maybeSingle();
        if (queryErr) throw queryErr;
        if (cancelled) return;
        if (data) {
          setLoaded({
            guide: data.guide_data as PlantGrowGuide,
            lastGeneratedAt: data.last_generated_at as string,
            freshnessVersion: Number(data.freshness_version ?? 1),
          });
        } else {
          setLoaded(null);
        }
      } catch (err: any) {
        Logger.error("GrowGuideTab load failed", err, { plantId });
        if (!cancelled) setError(err?.message ?? "Couldn't load the grow guide.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [plantId]);

  // Auto-fire generation once on first mount when:
  //   - the host (e.g. The Library) asked for it (`autoGenerate`),
  //   - we've finished the initial cache check and found nothing,
  //   - the user's tier allows AI generation,
  //   - we haven't already attempted (so a failed gen doesn't loop).
  useEffect(() => {
    if (
      autoGenerate &&
      !loading &&
      !loaded &&
      !generating &&
      !autoGenAttempted &&
      aiEnabled
    ) {
      setAutoGenAttempted(true);
      handleGenerate(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoGenerate, loading, loaded, generating, autoGenAttempted, aiEnabled]);

  const handleGenerate = async (forceRegen = false) => {
    if (!aiEnabled) {
      toast.error("Upgrade to an AI tier to generate grow guides.");
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      const result = await PlantDoctorService.generateGrowGuide(plantId, homeId, {
        forceRegen,
      });
      setLoaded({
        guide: result.guide_data,
        lastGeneratedAt: result.last_generated_at,
        freshnessVersion: result.freshness_version,
      });
      if (result.refused) {
        // Server refused the manual refresh — within the 90-day
        // cool-down window. Surface the friendly message + drive the
        // chip below with `days_remaining`.
        const days = result.days_remaining ?? 0;
        toast(
          days > 0
            ? `Grow guide refreshed recently — next refresh in ${days} day${days === 1 ? "" : "s"}.`
            : "Grow guide refreshed recently.",
          { icon: "🌿" },
        );
      } else {
        toast.success(
          forceRegen
            ? result.updated_fields.length > 0
              ? `Grow guide refreshed — ${result.updated_fields.length} section${result.updated_fields.length === 1 ? "" : "s"} updated.`
              : "Grow guide is up to date."
            : "Grow guide generated.",
        );
      }
    } catch (err: any) {
      Logger.error("Grow guide generation failed", err, { plantId });
      setError(err?.message ?? "Couldn't generate the grow guide.");
    } finally {
      setGenerating(false);
    }
  };

  // ── Loading skeleton ──────────────────────────────────────────────────
  if (loading) {
    return (
      <div
        data-testid="grow-guide-loading"
        className="flex items-center gap-2 px-4 py-6 text-sm text-rhozly-on-surface/50"
      >
        <Loader2 className="animate-spin" size={16} />
        Loading guide…
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────
  if (error && !loaded) {
    return (
      <div
        data-testid="grow-guide-error"
        className="px-4 py-3 rounded-2xl bg-red-50 border border-red-100 text-sm text-red-800 flex items-start gap-3"
      >
        <AlertCircle size={16} className="shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="font-bold mb-1">Couldn't load the grow guide.</p>
          <p className="text-xs leading-snug mb-2">{error}</p>
          <button
            type="button"
            data-testid="grow-guide-retry"
            onClick={() => handleGenerate(false)}
            className="px-3 py-1.5 rounded-xl bg-red-600 text-white text-xs font-black uppercase tracking-widest hover:opacity-90 transition"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // ── Empty state ───────────────────────────────────────────────────────
  if (!loaded) {
    return (
      <div
        data-testid="grow-guide-empty"
        className="rounded-3xl bg-white border border-rhozly-primary/15 p-6 text-center"
      >
        <div className="w-12 h-12 mx-auto rounded-2xl bg-rhozly-primary/10 text-rhozly-primary flex items-center justify-center mb-3">
          <BookOpenCheck size={22} />
        </div>
        <h3 className="font-display font-black text-rhozly-on-surface text-lg mb-1">
          No grow guide yet
        </h3>
        <p className="text-sm text-rhozly-on-surface/65 leading-relaxed mb-4 max-w-md mx-auto">
          Generate a comprehensive guide for <span className="font-bold">{commonName}</span> covering watering, soil, sunlight, propagation, germination, pruning, flowering, harvesting, and life-cycle.
        </p>
        {aiEnabled ? (
          <button
            type="button"
            data-testid="grow-guide-generate"
            onClick={() => handleGenerate(false)}
            disabled={generating}
            className="inline-flex items-center gap-2 px-5 py-2.5 min-h-[44px] rounded-2xl bg-rhozly-primary text-white text-sm font-black hover:opacity-90 disabled:opacity-50 transition"
          >
            {generating ? (
              <>
                <Loader2 className="animate-spin" size={16} />
                Generating — this can take 10-15 seconds…
              </>
            ) : (
              <>
                <Sparkles size={16} />
                Generate guide
              </>
            )}
          </button>
        ) : (
          <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-rhozly-surface-low text-xs font-bold text-rhozly-on-surface/60">
            <Lock size={14} />
            Upgrade to an AI tier to generate grow guides
          </div>
        )}
        {source === "manual" && (
          <p
            data-testid="grow-guide-manual-hint"
            className="text-[11px] text-rhozly-on-surface/45 mt-3 italic max-w-md mx-auto"
          >
            Manual plants get a best-effort guide from the name + your notes. Use Visual Lens for sharper data on unknown plants.
          </p>
        )}
      </div>
    );
  }

  // ── Loaded state ──────────────────────────────────────────────────────
  const stale = isStale(loaded.lastGeneratedAt);
  const visibleSections = loaded.guide.sections.filter((s) => s.applicable);

  // Manual-refresh cool-down — matches the server's 90-day limit so the
  // Refresh button greys out client-side instead of round-tripping just
  // to be told no. The 90-day cron is the source of truth for staleness;
  // this only gates the manual button.
  const COOL_DOWN_DAYS = 90;
  const generatedMs = new Date(loaded.lastGeneratedAt).getTime();
  const daysSinceGen = (Date.now() - generatedMs) / 864e5;
  const refreshDisabled = daysSinceGen < COOL_DOWN_DAYS;
  const daysUntilRefresh = refreshDisabled
    ? Math.max(1, Math.ceil(COOL_DOWN_DAYS - daysSinceGen))
    : 0;

  // Bulk "Add all" surface — flatten schedulable_tasks across every
  // applicable section, folding each section's how-to steps into the
  // first task's description so the calendar entry carries the full
  // instructions. Order matches the guide's natural section order.
  const allSchedulable: SchedulableTask[] = flattenSectionsForCalendar(
    visibleSections,
  );
  const totalSchedulable = allSchedulable.length;

  return (
    <div data-testid="grow-guide-loaded" className="space-y-3">
      <div className="flex items-center justify-between gap-3 px-1 mb-1">
        <p className="text-xs text-rhozly-on-surface/55">
          Updated {relativeDays(loaded.lastGeneratedAt)}
          {stale && <span className="text-amber-700 ml-1">· may be out of date</span>}
        </p>
        {aiEnabled && (
          <button
            type="button"
            data-testid="grow-guide-refresh"
            onClick={() => handleGenerate(true)}
            disabled={generating || refreshDisabled}
            title={
              refreshDisabled
                ? `Grow guides refresh automatically every 90 days. Next refresh in ${daysUntilRefresh} day${daysUntilRefresh === 1 ? "" : "s"}.`
                : "Re-run the AI to check for updates"
            }
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rhozly-primary/10 text-rhozly-primary text-[10px] font-black uppercase tracking-widest hover:bg-rhozly-primary/15 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            {generating ? (
              <Loader2 className="animate-spin" size={12} />
            ) : (
              <RefreshCw size={12} />
            )}
            {refreshDisabled
              ? `Next refresh in ${daysUntilRefresh}d`
              : "Refresh"}
          </button>
        )}
      </div>

      {error && (
        <div
          data-testid="grow-guide-error-banner"
          className="px-3 py-2 rounded-xl bg-red-50 border border-red-100 text-xs text-red-800 flex items-center gap-2"
        >
          <AlertCircle size={12} />
          {error}
        </div>
      )}

      {visibleSections.length === 0 ? (
        <p
          data-testid="grow-guide-no-applicable"
          className="text-sm text-rhozly-on-surface/55 italic px-2"
        >
          The AI couldn't find any applicable guidance for this plant. Try refreshing.
        </p>
      ) : (
        <>
          {totalSchedulable > 0 && (
            <button
              type="button"
              data-testid="grow-guide-add-all"
              onClick={() => setBulkOpen(true)}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 min-h-[44px] rounded-2xl bg-rhozly-primary/10 border border-rhozly-primary/20 text-rhozly-primary text-xs font-black uppercase tracking-widest hover:bg-rhozly-primary/15 transition"
            >
              <CalendarPlus size={14} />
              Add all {totalSchedulable} tasks to calendar
            </button>
          )}
          <div className="space-y-3">
            {visibleSections.map((section, i) => (
              <GuideSectionCard
                key={section.category}
                section={section}
                defaultOpen={i === 0}
                testIdPrefix="guide-section"
                homeId={homeId}
                plantId={plantId}
                plantName={commonName}
              />
            ))}
          </div>
          {bulkOpen && (
            <AddToCalendarSheet
              open={bulkOpen}
              homeId={homeId}
              plantId={plantId}
              plantName={commonName}
              schedulableTasks={allSchedulable}
              heading={`Add all tasks for ${commonName}`}
              onClose={() => setBulkOpen(false)}
            />
          )}
        </>
      )}
    </div>
  );
}
