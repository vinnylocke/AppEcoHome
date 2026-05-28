import React, { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Loader2,
  Link2,
  Sparkles,
  Lock,
  AlertCircle,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Logger } from "../../lib/errorHandler";
import {
  PlantDoctorService,
  type PlantGrowGuide,
} from "../../services/plantDoctorService";
import { getHemisphere, type Hemisphere } from "../../lib/seasonal";
import {
  sowingCalendarFromGrowGuide,
  type SowingCalendarBand,
} from "../../lib/sowingCalendarFromGrowGuide";
import SowingCalendarMonthStrip from "./SowingCalendarMonthStrip";
import AddToCalendarSheet from "../growGuide/AddToCalendarSheet";
import type { SchedulableTask } from "../../lib/scheduleFromSchedulableTask";
import EmptyState from "../shared/EmptyState";

interface Props {
  homeId: string;
  /** The packet whose calendar this tab renders. */
  packet: {
    id: string;
    plant_id: number | null;
    plant_name?: string | null;
    variety?: string | null;
  };
  aiEnabled: boolean;
  /** Open the existing "link plant" flow on the edit modal. */
  onRequestLinkPlant: () => void;
}

/**
 * Sowing Calendar tab inside SeedPacketDetailModal.
 *
 * Walks four states:
 *   1. Packet has no linked plant_id → empty state pointing at link-plant flow.
 *   2. Linked plant has no grow_guide row → "Generate sowing calendar" CTA (AI-gated).
 *   3. Grow guide loaded → render hemisphere-aware month strip + per-band Add-to-calendar.
 *   4. No sowing-classifiable tasks in the guide → polite empty state.
 *
 * All bands are passed `seed_packet_id` when added to the calendar so the
 * resulting tasks auto-create Nursery sowings on completion.
 */
export default function SowingCalendarTab({
  homeId,
  packet,
  aiEnabled,
  onRequestLinkPlant,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [guide, setGuide] = useState<PlantGrowGuide | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hemisphere, setHemisphere] = useState<Hemisphere>("northern");
  const [activeAddTasks, setActiveAddTasks] = useState<SchedulableTask[] | null>(
    null,
  );

  // Resolve hemisphere from the home record (country + timezone).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("homes")
        .select("country, timezone")
        .eq("id", homeId)
        .maybeSingle();
      if (cancelled) return;
      setHemisphere(getHemisphere(data?.country ?? undefined, data?.timezone ?? undefined));
    })();
    return () => {
      cancelled = true;
    };
  }, [homeId]);

  // Load the grow guide for the linked plant. No-op when packet has no plant.
  useEffect(() => {
    if (!packet.plant_id) {
      setLoading(false);
      setGuide(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const { data, error: queryErr } = await supabase
          .from("plant_grow_guides")
          .select("guide_data")
          .eq("plant_id", packet.plant_id!)
          .maybeSingle();
        if (queryErr) throw queryErr;
        if (cancelled) return;
        setGuide((data?.guide_data as PlantGrowGuide) ?? null);
      } catch (err: any) {
        Logger.error("SowingCalendarTab: load failed", err, { plantId: packet.plant_id });
        if (!cancelled) setError(err?.message ?? "Couldn't load the calendar.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [packet.plant_id]);

  const bands = useMemo<SowingCalendarBand[]>(
    () => sowingCalendarFromGrowGuide(guide ?? null),
    [guide],
  );

  // Hemisphere-aware month order: northern = Jan→Dec, southern = Jul→Jun
  // so the user's spring + summer fall in the middle of the strip.
  const monthOrder = useMemo<number[]>(() => {
    if (hemisphere === "southern") {
      return [6, 7, 8, 9, 10, 11, 0, 1, 2, 3, 4, 5];
    }
    return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  }, [hemisphere]);

  const todayMonth = new Date().getMonth();

  const handleGenerate = async () => {
    if (!packet.plant_id || !aiEnabled) return;
    setGenerating(true);
    try {
      const response = await PlantDoctorService.generateGrowGuide(
        packet.plant_id,
        homeId,
      );
      if (response?.guide_data) {
        setGuide(response.guide_data);
      }
    } catch (err: any) {
      Logger.error("SowingCalendarTab: generate failed", err, { plantId: packet.plant_id });
      setError(err?.message ?? "Couldn't generate the calendar. Try again later.");
    } finally {
      setGenerating(false);
    }
  };

  // ────────────────────────────────────────────────────────────────
  // State 1: packet has no linked plant.
  if (!packet.plant_id) {
    return (
      <EmptyState
        size="lg"
        icon={<Link2 size={28} />}
        title="Link a plant to see its sowing calendar"
        body={
          <>
            Pick the plant this packet is for and we'll show you when to sow it (indoors or direct), and when to transplant out — calibrated to your hemisphere.
          </>
        }
        primaryCta={{
          label: "Link plant",
          onClick: onRequestLinkPlant,
        }}
      />
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-rhozly-on-surface/40">
        <Loader2 className="animate-spin mr-2" size={18} /> Loading calendar…
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm font-bold text-red-700 flex items-start gap-2">
        <AlertCircle size={16} className="mt-0.5 shrink-0" />
        <span>{error}</span>
      </div>
    );
  }

  // State 2: no grow guide → AI-gated generate CTA.
  if (!guide) {
    return (
      <EmptyState
        size="lg"
        icon={<CalendarDays size={28} />}
        title="Generate a sowing calendar"
        body={
          aiEnabled ? (
            <>
              Rhozly will look up the propagation timing for {packet.plant_name || packet.variety || "this plant"} and show you a hemisphere-aware month strip — sow indoors, direct sow, transplant out — all in one view.
            </>
          ) : (
            <>
              The sowing calendar uses AI to read this plant's grow guide. Upgrade to Sage or Evergreen to enable it.
            </>
          )
        }
        primaryCta={
          aiEnabled
            ? {
                label: generating ? "Generating…" : "Generate now",
                onClick: handleGenerate,
                icon: generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />,
              }
            : undefined
        }
        secondaryCta={
          !aiEnabled
            ? { label: "Tap to learn more", onClick: () => null, icon: <Lock size={13} /> }
            : undefined
        }
      />
    );
  }

  // State 4: guide loaded but no sowing-classifiable tasks.
  if (bands.length === 0) {
    return (
      <EmptyState
        size="md"
        icon={<CalendarDays size={28} />}
        title="No sowing windows in this plant's guide"
        body={
          <>
            The grow guide for this plant doesn't include propagation or germination tasks — usually because it's propagated commercially (e.g. by cuttings or division) rather than from seed.
          </>
        }
      />
    );
  }

  // State 3: render the strip + per-band CTA.
  return (
    <div className="space-y-4" data-testid="sowing-calendar-tab">
      <div className="text-xs font-bold text-rhozly-on-surface/60 leading-relaxed">
        <strong className="font-black text-rhozly-on-surface">
          {hemisphere === "southern" ? "Southern" : "Northern"} hemisphere
        </strong>{" "}
        — tap any coloured band to add that sowing task to your calendar. It'll be linked to this packet, so when you mark it done a sowing is logged in the Nursery automatically.
      </div>

      <SowingCalendarMonthStrip
        bands={bands}
        monthOrder={monthOrder}
        todayMonth={todayMonth}
        onBandClick={(band) => setActiveAddTasks([band.sourceTask])}
      />

      <button
        type="button"
        onClick={() =>
          setActiveAddTasks(bands.map((b) => b.sourceTask))
        }
        data-testid="sowing-calendar-add-all"
        className="w-full bg-rhozly-primary text-white text-sm font-black px-4 py-3 rounded-2xl hover:opacity-90 active:scale-95 transition"
      >
        Set up sowing schedule
      </button>

      {activeAddTasks && packet.plant_id && (
        <AddToCalendarSheet
          open={!!activeAddTasks}
          homeId={homeId}
          plantId={packet.plant_id}
          plantName={packet.plant_name || packet.variety || "this plant"}
          schedulableTasks={activeAddTasks}
          heading="Add to your calendar"
          seedPacketId={packet.id}
          onClose={() => setActiveAddTasks(null)}
          onSaved={() => setActiveAddTasks(null)}
        />
      )}
    </div>
  );
}
