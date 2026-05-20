import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom"; // 🚀 IMPORT THE PORTAL
import { X, Droplets, Calendar, Database, Loader2, RefreshCw, BookOpen, Sun, Sprout, Activity, MapPin } from "lucide-react";
import { useNavigate } from "react-router-dom";
import ManualPlantCreation from "./ManualPlantCreation";
import PlantScheduleTab from "./PlantScheduleTab";
import PlantGuidesTab from "./PlantGuidesTab";
import LightTab from "./LightTab";
import CompanionPlantsTab from "./CompanionPlantsTab";
import { getProviderPlantDetails } from "../lib/plantProvider";
import { getProviderLabel } from "../lib/verdantlyUtils";
import { supabase } from "../lib/supabase";
import toast from "react-hot-toast";
import { useAiPlantFreshness } from "../hooks/useAiPlantFreshness";
import CareUpdateCallout from "./aiPlants/CareUpdateCallout";
import SourceChip from "./aiPlants/SourceChip";
import DetachConfirmModal from "./aiPlants/DetachConfirmModal";
import ResetConfirmModal from "./aiPlants/ResetConfirmModal";
import { diffOverriddenFields, mergeOverriddenFields } from "../lib/aiPlantOverrides";
import { PlantDoctorService } from "../services/plantDoctorService";

function formatRelativeDate(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000));
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months === 1) return "a month ago";
  return `${months} months ago`;
}

/**
 * Build a user-friendly rate-limit toast string from the server's
 * `rate_limit_minutes` + `retry_after` payload. Phrases both the cadence
 * AND the time remaining so the user knows the rule AND when to try next.
 */
function formatRateLimitMessage(rateLimitMinutes: number | undefined, retryAt: Date | null): string {
  const cadencePhrase = (() => {
    if (rateLimitMinutes == null) return "You can only refresh this plant occasionally.";
    if (rateLimitMinutes < 60) {
      const m = Math.round(rateLimitMinutes);
      return m === 1
        ? "You can refresh this plant once per minute."
        : `You can refresh this plant once every ${m} minutes.`;
    }
    if (rateLimitMinutes < 60 * 24) {
      const h = Math.round(rateLimitMinutes / 60);
      return h === 1
        ? "You can refresh this plant once per hour."
        : `You can refresh this plant once every ${h} hours.`;
    }
    const d = Math.round(rateLimitMinutes / (60 * 24));
    return d === 1
      ? "You can refresh this plant once per day."
      : `You can refresh this plant once every ${d} days.`;
  })();

  if (!retryAt) return cadencePhrase;
  const remainingMs = retryAt.getTime() - Date.now();
  if (remainingMs <= 0) return cadencePhrase;
  const remainingPhrase = (() => {
    const seconds = Math.ceil(remainingMs / 1000);
    if (seconds < 60) return `try again in ${seconds}s`;
    const minutes = Math.ceil(seconds / 60);
    if (minutes < 60) return `try again in ${minutes} min`;
    const hours = Math.ceil(minutes / 60);
    if (hours < 24) return `try again in ${hours}h`;
    const days = Math.ceil(hours / 24);
    return `try again in ${days}d`;
  })();
  return `${cadencePhrase} You can ${remainingPhrase}.`;
}

const FIELD_LABELS: Record<string, string> = {
  common_name: "Plant name",
  scientific_name: "Scientific name",
  description: "Description",
  plant_type: "Plant type",
  cycle: "Life cycle",
  care_level: "Care level",
  growth_rate: "Growth rate",
  maintenance: "Maintenance",
  watering_min_days: "Watering — min days",
  watering_max_days: "Watering — max days",
  sunlight: "Sunlight",
  flowering_season: "Flowering season",
  harvest_season: "Harvest season",
  pruning_month: "Pruning months",
  propagation: "Propagation",
  attracts: "Attracts",
  is_toxic_pets: "Toxic to pets",
  is_toxic_humans: "Toxic to humans",
  indoor: "Suitable indoors",
  is_edible: "Edible",
  drought_tolerant: "Drought tolerant",
  tropical: "Tropical",
  medicinal: "Medicinal",
  cuisine: "Culinary use",
};

function humanise(field: string): string {
  return FIELD_LABELS[field] ?? field.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

// 🧠 IMPORT THE AI CONTEXT
import { usePlantDoctor } from "../context/PlantDoctorContext";
import { useFocusTrap } from "../hooks/useFocusTrap";

interface PlantEditModalProps {
  homeId: string;
  plant: any;
  onSave: (updatedData: any) => void;
  onClose: () => void;
  isSaving?: boolean;
  aiEnabled?: boolean;
  isPremium?: boolean;
}

export default function PlantEditModal({
  homeId,
  plant,
  onSave,
  onClose,
  isSaving,
  aiEnabled = false,
  isPremium = false,
}: PlantEditModalProps) {
  // 🧠 GRAB THE SETTER FROM CONTEXT
  const { setPageContext } = usePlantDoctor();
  const trapRef = useFocusTrap<HTMLDivElement>(true);

  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("care");
  const [fullPlantData, setFullPlantData] = useState<any>(plant);
  const [isFetchingApiData, setIsFetchingApiData] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [loadSuccess, setLoadSuccess] = useState(false);
  const liveRegionRef = useRef<HTMLSpanElement>(null);

  // Wave 5 — AI freshness state for this plant (when source = "ai").
  // Resolves shallow forks via forked_from_plant_id automatically.
  const { byPlantId: freshnessByPlantId } = useAiPlantFreshness(
    plant?.source === "ai"
      ? [{
          id: plant.id,
          source: plant.source,
          home_id: plant.home_id ?? null,
          forked_from_plant_id: plant.forked_from_plant_id ?? null,
          overridden_fields: plant.overridden_fields ?? null,
        }]
      : [],
  );
  const freshness = plant?.source === "ai" ? freshnessByPlantId[plant.id] : null;

  // The edge function enforces the rate limit (per-env: minutes-configurable
  // via AI_REFRESH_RATE_LIMIT_MINUTES). The `refreshing` state below prevents
  // double-clicks during an in-flight request. We trust the server to reject
  // too-soon retries with a `rate_limited` error which we toast for the user.
  const [refreshing, setRefreshing] = useState(false);

  /**
   * Self-heal an orphan AI plant (home-scoped row with no
   * `forked_from_plant_id`) by finding or generating the global
   * catalogue parent, then linking this home row to it. Throws on
   * failure so the caller can log + toast a useful message.
   */
  const healOrphan = async (): Promise<number> => {
    if (!plant?.common_name) {
      throw new Error("heal_missing_common_name");
    }
    // generateCareGuide on the edge fn does "find existing global by
    // scientific_name_key OR insert one on miss". Either way, we get back
    // db_plant_id which is the global we want to link to.
    const guide = await PlantDoctorService.generateCareGuide(plant.common_name, homeId);
    const globalId = guide?.db_plant_id;
    if (globalId == null) {
      throw new Error("heal_no_db_plant_id_returned");
    }

    // Link this home row to the resolved global.
    const { error: updErr } = await supabase
      .from("plants")
      .update({
        forked_from_plant_id: globalId,
        overridden_fields: [],
      })
      .eq("id", plant.id);
    if (updErr) throw new Error(`heal_link_update_failed: ${updErr.message}`);

    // Seed user_plant_ack at the global's current freshness_version so
    // the freshness chip doesn't fire immediately on the now-linked row.
    const { data: userData } = await supabase.auth.getUser();
    const callerId = userData?.user?.id;
    if (callerId) {
      const { error: ackErr } = await supabase.from("user_plant_ack").upsert(
        {
          user_id: callerId,
          plant_id: globalId,
          seen_freshness_version: guide.freshness_version ?? 1,
          acked_at: new Date().toISOString(),
        },
        { onConflict: "user_id,plant_id" },
      );
      // Ack-seed failure isn't fatal — chip might flash but the link still
      // worked. Log so we know.
      if (ackErr) console.warn("ai-plant heal: ack-seed failed", ackErr.message);
    }
    return globalId;
  };

  const handleManualRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      // For orphan rows (the freshness hook returned null), heal first then
      // refresh. The heal call itself does the work of a fresh catalogue
      // entry — so after a successful heal we can skip the explicit refresh
      // and report "up to date" directly.
      if (!freshness) {
        await healOrphan();
        toast.success("Care guide is up to date.");
        // Tell the parent to re-fetch so the modal re-renders with the
        // linked state. Closing + reopening matches existing reset UX.
        onClose();
        return;
      }

      const { data, error } = await supabase.functions.invoke("manual-refresh-ai-plant", {
        body: { plantId: freshness.global_plant_id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.changed) {
        toast.success(
          `Care guide refreshed — ${(data.changed_fields ?? []).length} field${(data.changed_fields ?? []).length === 1 ? "" : "s"} updated.`,
        );
      } else {
        toast.success("Care guide is up to date.");
      }
    } catch (err: any) {
      // Always log the underlying error so we can debug from the console
      // when the toast hides what actually went wrong.
      console.error("ai-plant refresh failed", err);

      // Supabase functions return non-2xx bodies via err.context (a Response).
      // We parse it to surface specifics like rate_limit_minutes / retry_after.
      let body: any = null;
      if (err?.context && typeof err.context.json === "function") {
        try {
          body = await err.context.clone().json();
        } catch { /* not json */ }
      }
      const code: string = body?.error ?? err?.message ?? String(err ?? "");

      if (code === "rate_limited" || code.includes("429")) {
        // Build a specific message from the server's rate_limit_minutes + retry_after.
        const minutes: number | undefined = body?.rate_limit_minutes;
        const retryAt: Date | null = body?.retry_after ? new Date(body.retry_after) : null;
        toast.error(formatRateLimitMessage(minutes, retryAt));
      } else if (code.includes("ai_tier_required")) {
        toast.error("This requires Sage or Evergreen.");
      } else if (code.includes("heal_no_db_plant_id_returned")) {
        toast.error("AI service didn't return a catalogue ID. Check the plant-doctor function is deployed.");
      } else if (code.includes("heal_link_update_failed")) {
        toast.error("Couldn't link the plant to the catalogue — check permissions.");
      } else {
        // Surface the underlying error message so the user has something
        // to act on instead of the generic "try again".
        toast.error(`Couldn't refresh care guide: ${code || "unknown error"}`);
      }
    } finally {
      setRefreshing(false);
    }
  };

  // Wave 6 — override-on-edit + reset state
  const [pendingDetach, setPendingDetach] = useState<{
    payload: Record<string, unknown>;
    changedFields: string[];
  } | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  const overriddenFields: string[] = Array.isArray(plant?.overridden_fields)
    ? (plant.overridden_fields as string[])
    : [];
  const isAiCustomFork = plant?.source === "ai" && overriddenFields.length > 0;
  const isAiCatalogueTracking = plant?.source === "ai" && overriddenFields.length === 0;

  /**
   * Intercept the form's Save. For catalogue-tracking AI plants where the
   * user actually changed an AI care field, we open the DetachConfirmModal
   * before calling the parent `onSave`. For custom forks, we merge any new
   * overrides into the existing list and save without a modal. Non-AI plants
   * pass straight through.
   */
  const handleSaveWithOverride = (payload: Record<string, unknown>) => {
    if (plant?.source !== "ai") {
      onSave(payload);
      return;
    }

    const changed = diffOverriddenFields(plant, payload);

    if (isAiCatalogueTracking && changed.length > 0) {
      setPendingDetach({ payload, changedFields: changed });
      return;
    }

    if (isAiCustomFork && changed.length > 0) {
      onSave({
        ...payload,
        overridden_fields: mergeOverriddenFields(overriddenFields, changed),
      });
      return;
    }

    // No care-field change OR already custom but no new overrides
    onSave(payload);
  };

  const confirmDetach = () => {
    if (!pendingDetach) return;
    onSave({
      ...pendingDetach.payload,
      overridden_fields: mergeOverriddenFields(overriddenFields, pendingDetach.changedFields),
    });
    setPendingDetach(null);
  };

  const handleReset = async () => {
    if (!plant?.id) return;
    setResetting(true);
    try {
      const { error } = await supabase.rpc("revert_ai_plant_fork_in_place", {
        p_fork_id: plant.id,
      });
      if (error) throw error;
      toast.success(`${plant.common_name} reverted — auto-updates re-enabled.`);
      setResetOpen(false);
      onClose();
    } catch (err: any) {
      const msg = err?.message ?? "";
      if (msg.includes("parent_unavailable")) {
        toast.error("Catalogue version is unavailable. Try again later.");
      } else if (msg.includes("not_a_home_member")) {
        toast.error("You don't have permission to reset this plant.");
      } else {
        toast.error("Couldn't reset — try again.");
      }
    } finally {
      setResetting(false);
    }
  };

  // Contextual at-a-glance data: instance count, areas covered, latest lux, open tasks
  const [glance, setGlance] = useState<{
    instances: number;
    areas: number;
    openTasks: number;
    overdueTasks: number;
    latestLux: number | null;
    latestLuxAreaName: string | null;
    activeAilments: number;
  } | null>(null);

  useEffect(() => {
    if (!homeId || !plant?.id) return;
    let cancelled = false;
    (async () => {
      // Inventory items for this plant — gives us instance count + areas
      const { data: items } = await supabase
        .from("inventory_items")
        .select("id, area_id, areas(name)")
        .eq("home_id", homeId)
        .eq("plant_id", plant.id);
      if (cancelled) return;
      const instanceIds = (items ?? []).map((i: any) => i.id);
      const areaIds = new Set((items ?? []).map((i: any) => i.area_id).filter(Boolean));

      // Open tasks across these instances
      const todayStr = new Date().toISOString().split("T")[0];
      const [tasksRes, ailmentRes, luxRes] = await Promise.all([
        instanceIds.length === 0
          ? Promise.resolve({ data: [] })
          : supabase
              .from("tasks")
              .select("id, due_date")
              .in("inventory_item_id", instanceIds)
              .neq("status", "Completed")
              .neq("status", "Skipped"),
        instanceIds.length === 0
          ? Promise.resolve({ count: 0 })
          : supabase
              .from("plant_instance_ailments")
              .select("id", { count: "exact", head: true })
              .eq("home_id", homeId)
              .eq("status", "active")
              .in("plant_instance_id", instanceIds),
        areaIds.size === 0
          ? Promise.resolve({ data: [] })
          : supabase
              .from("area_lux_readings")
              .select("lux_value, area_id, recorded_at, areas(name)")
              .in("area_id", Array.from(areaIds))
              .order("recorded_at", { ascending: false })
              .limit(1),
      ]);
      if (cancelled) return;

      const tasks = (tasksRes as any).data ?? [];
      const overdueTasks = tasks.filter((t: any) => t.due_date < todayStr).length;
      const luxRow = ((luxRes as any).data ?? [])[0];

      setGlance({
        instances: instanceIds.length,
        areas: areaIds.size,
        openTasks: tasks.length,
        overdueTasks,
        latestLux: luxRow?.lux_value ?? null,
        latestLuxAreaName: luxRow?.areas?.name ?? null,
        activeAilments: (ailmentRes as any).count ?? 0,
      });
    })();
    return () => { cancelled = true; };
  }, [homeId, plant?.id]);

  const tabs = [
    { id: "care", label: "Care Guide", icon: Droplets },
    { id: "schedules", label: "Automations", icon: Calendar },
    { id: "light", label: "Light", icon: Sun },
    { id: "guides", label: "Guides", icon: BookOpen },
    { id: "companions", label: "Companions", icon: Sprout },
  ];

  // 🧠 LIVE AI SYNC: Update the AI on the Master Plant Template being viewed/edited
  useEffect(() => {
    setPageContext({
      action: "Managing Master Plant Data (The Shed)",
      activeTab: activeTab,
      plantTemplate: {
        name: fullPlantData?.common_name,
        source: plant.source, // 'api' or 'manual'
        careLevel: fullPlantData?.care_level,
        cycle: fullPlantData?.cycle,
        wateringNeeds: fullPlantData?.watering,
        sunlightNeeds: fullPlantData?.sunlight,
      },
      isEditingRestricted: plant.source === "api" || plant.source === "verdantly",
    });

    // Cleanup on close
    return () => setPageContext(null);
  }, [fullPlantData, activeTab, plant.source, setPageContext]);

  const fetchApiDetails = async () => {
    if (
      (plant.source === "api" && plant.perenual_id) ||
      (plant.source === "verdantly" && plant.verdantly_id)
    ) {
      setIsFetchingApiData(true);
      setFetchError(false);
      setLoadSuccess(false);
      try {
        const apiData = await getProviderPlantDetails({
          source: plant.source,
          perenual_id: plant.perenual_id ? Number(plant.perenual_id) : null,
          verdantly_id: plant.verdantly_id ?? null,
        });

        // Perenual images are Wasabi signed URLs that expire after 24h.
        // If the stored URL is missing or a Wasabi URL, fetch a fresh one directly.
        const isStale = (url?: string) =>
          !url || url.includes("wasabisys.com") || url.includes("X-Amz-");

        let imageUrl = plant.thumbnail_url;
        if (isStale(imageUrl)) {
          try {
            const { data: fresh } = await supabase.functions.invoke("perenual-proxy", {
              body: { action: "details", id: plant.perenual_id },
            });
            imageUrl =
              fresh?.default_image?.regular_url ||
              fresh?.default_image?.thumbnail ||
              apiData.image_url ||
              "";
          } catch {
            imageUrl = apiData.image_url || "";
          }
        }

        setFullPlantData({
          ...plant,
          ...apiData,
          thumbnail_url: imageUrl,
          image_url: imageUrl,
        });
        setLoadSuccess(true);
        setTimeout(() => setLoadSuccess(false), 3000);
      } catch (error) {
        setFetchError(true);
        toast.error("Failed to load live care guide.");
      } finally {
        setIsFetchingApiData(false);
      }
    } else {
      setFullPlantData(plant);
    }
  };

  useEffect(() => {
    fetchApiDetails();
  }, [plant]);

  // 🚀 SSR Safety Check
  if (typeof document === "undefined") return null;

  // 🚀 PORTAL WRAPPER
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-rhozly-bg/95 backdrop-blur-xl animate-in fade-in duration-300">
      <div ref={trapRef} role="dialog" aria-modal="true" aria-label="Edit plant" className="bg-rhozly-surface-lowest w-full max-w-3xl h-[90vh] flex flex-col rounded-3xl shadow-2xl border border-rhozly-outline/20 overflow-hidden">
        {/* Header */}
        <div className="px-6 sm:px-8 pt-6 sm:pt-8 pb-3 shrink-0">
          <div className="flex justify-between items-start gap-3">
            <div className="min-w-0">
              <h3 className="text-2xl sm:text-3xl font-black text-rhozly-on-surface leading-tight">
                {plant.common_name}
              </h3>
              <p className="text-[10px] font-black text-rhozly-primary uppercase tracking-widest mt-1">
                Care &amp; Management
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center p-3 bg-rhozly-surface-low rounded-2xl hover:bg-rhozly-surface hover:scale-110 transition-all"
            >
              <X size={24} />
            </button>
          </div>

          {/* At-a-glance contextual strip */}
          {glance && glance.instances > 0 && (
            <div
              data-testid="plant-edit-glance-strip"
              className="mt-4 flex items-center gap-2 flex-wrap"
            >
              <button
                onClick={() => navigate("/garden-layout")}
                className="flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-black hover:bg-emerald-100 transition-colors"
                aria-label={`${glance.instances} planted in ${glance.areas} areas — view on layout`}
              >
                <Sprout size={12} />
                {glance.instances} planted · {glance.areas} area{glance.areas !== 1 ? "s" : ""}
              </button>
              {glance.overdueTasks > 0 ? (
                <button
                  onClick={() => { setActiveTab("schedules"); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-full bg-rose-50 border border-rose-200 text-rose-700 text-xs font-black hover:bg-rose-100 transition-colors"
                  aria-label={`${glance.overdueTasks} overdue tasks`}
                >
                  ⏰ {glance.overdueTasks} overdue
                </button>
              ) : glance.openTasks > 0 ? (
                <button
                  onClick={() => { setActiveTab("schedules"); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-full bg-sky-50 border border-sky-200 text-sky-700 text-xs font-black hover:bg-sky-100 transition-colors"
                  aria-label={`${glance.openTasks} upcoming tasks`}
                >
                  <Calendar size={12} />
                  {glance.openTasks} upcoming task{glance.openTasks !== 1 ? "s" : ""}
                </button>
              ) : null}
              {glance.activeAilments > 0 && (
                <button
                  onClick={() => navigate("/shed?tab=watchlist")}
                  className="flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-xs font-black hover:bg-amber-100 transition-colors"
                  aria-label={`${glance.activeAilments} active ailments`}
                >
                  <Activity size={12} />
                  {glance.activeAilments} ailment{glance.activeAilments !== 1 ? "s" : ""}
                </button>
              )}
              {glance.latestLux != null && (
                <span
                  className="flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-full bg-rhozly-surface-low border border-rhozly-outline/15 text-rhozly-on-surface/70 text-xs font-black"
                  title={glance.latestLuxAreaName ? `Latest reading from ${glance.latestLuxAreaName}` : "Latest lux reading"}
                >
                  <Sun size={12} className="text-amber-500" />
                  {Math.round(glance.latestLux).toLocaleString()} lx
                </span>
              )}
              <button
                onClick={() => {
                  try {
                    const sunlight = Array.isArray(fullPlantData?.sunlight)
                      ? (fullPlantData.sunlight[0] ?? null)
                      : (typeof fullPlantData?.sunlight === "string" ? fullPlantData.sunlight : null);
                    sessionStorage.setItem(
                      "rhozly:sun-tracker-plant",
                      JSON.stringify({
                        id: String(plant.id),
                        name: plant.common_name || "Plant",
                        sunlight,
                        source: "shed",
                      }),
                    );
                  } catch { /* ignore */ }
                  navigate("/sun-trajectory?mode=garden");
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-full bg-orange-50 border border-orange-200 text-orange-700 text-xs font-black hover:bg-orange-100 transition-colors"
                aria-label="Find a spot in the Sun Tracker"
              >
                <MapPin size={12} />
                Find a spot
              </button>
            </div>
          )}
        </div>

        {/* sr-only live region for async feedback */}
        <span ref={liveRegionRef} role="status" aria-live="polite" className="sr-only">
          {loadSuccess ? "Care guide loaded successfully." : ""}
        </span>

        {/* Tab Navigation — scroll-snap on mobile for clean horizontal scrolling */}
        <div className="flex gap-1 sm:gap-2 border-b-2 border-rhozly-outline/20 bg-rhozly-surface-low/50 shrink-0 shadow-sm overflow-x-auto px-2 sm:px-8 scrollbar-none snap-x snap-mandatory">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              data-testid={`plant-modal-tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`shrink-0 snap-start flex items-center gap-1.5 sm:gap-2 px-3 sm:px-6 py-4 sm:py-5 text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all border-b-4 ${
                activeTab === tab.id
                  ? "border-rhozly-primary text-rhozly-primary"
                  : "border-transparent text-rhozly-on-surface/30 hover:text-rhozly-on-surface"
              }`}
            >
              <tab.icon size={14} className="sm:w-4 sm:h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar relative">
          {isFetchingApiData ? (
            <div className="h-full flex flex-col items-center justify-center opacity-50 animate-in fade-in">
              <Loader2
                className="animate-spin text-rhozly-primary mb-4"
                size={32}
              />
              <p className="font-bold text-sm">Loading encyclopedia data...</p>
            </div>
          ) : fetchError ? (
            <div className="h-full flex flex-col items-center justify-center gap-4 animate-in fade-in">
              <p className="font-bold text-sm text-rhozly-on-surface/60">
                Could not load the live care guide.
              </p>
              <button
                onClick={fetchApiDetails}
                className="flex items-center gap-2 px-5 py-3 min-h-[44px] bg-rhozly-primary text-white text-xs font-black uppercase tracking-widest rounded-2xl hover:opacity-90 transition-opacity"
              >
                <RefreshCw size={14} />
                Retry
              </button>
            </div>
          ) : activeTab === "care" ? (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
              {(plant.source === "api" || plant.source === "verdantly") && (
                <p className="text-[10px] text-rhozly-on-surface/40 font-semibold uppercase tracking-widest mb-4">
                  Read-only — data sourced from {getProviderLabel(plant.source) ?? "the plant encyclopedia"}
                </p>
              )}

              {/* Wave 5 — AI catalogue freshness callout + Refresh now action */}
              {freshness?.has_update && (
                <CareUpdateCallout
                  updatedFields={freshness.updated_care_fields}
                  lastGeneratedAt={freshness.last_care_generated_at}
                  onAcknowledge={freshness.acknowledge}
                />
              )}
              {plant.source === "ai" && (
                <>
                  <div className="flex flex-wrap items-center gap-2 mb-3 px-1">
                    <SourceChip source={plant.source} overriddenFields={overriddenFields} />
                    {freshness?.last_care_generated_at && (
                      <span className="text-[10px] font-bold text-rhozly-on-surface/50">
                        Care guide refreshed {formatRelativeDate(freshness.last_care_generated_at)}
                      </span>
                    )}
                    <div className="flex-1" />
                    {/* Refresh button is always visible for AI plants. It's
                        disabled when the user has edited fields (the
                        explanation below tells them how to rejoin via Revert)
                        and on the local 7-day rate-limit cache. On orphan
                        rows it triggers the self-heal flow inside the handler. */}
                    {aiEnabled && (
                      <button
                        data-testid="ai-care-refresh-now"
                        onClick={handleManualRefresh}
                        disabled={refreshing || isAiCustomFork}
                        title={
                          isAiCustomFork
                            ? "You've edited this plant — Refresh is disabled. Use Revert to rejoin auto-updates."
                            : "Check for updates to this AI care guide"
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[32px] border border-amber-300 text-amber-700 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-amber-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {refreshing ? (
                          <>
                            <Loader2 size={12} className="animate-spin" /> Refreshing…
                          </>
                        ) : (
                          <>
                            <RefreshCw size={12} /> Refresh Care Guide
                          </>
                        )}
                      </button>
                    )}
                    {isAiCustomFork && (
                      <button
                        data-testid="ai-care-reset"
                        onClick={() => setResetOpen(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[32px] border border-purple-300 text-purple-700 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-purple-50 transition-colors"
                      >
                        <RefreshCw size={12} /> Revert Care Guide
                      </button>
                    )}
                  </div>
                  {isAiCustomFork && (
                    <div className="bg-purple-50 border border-purple-200 rounded-2xl px-3 py-2 mb-4">
                      <p className="text-[10px] font-black uppercase tracking-widest text-purple-800 mb-1">
                        You've edited these fields
                      </p>
                      <p className="text-xs font-bold text-purple-900/80 mb-2">
                        {overriddenFields.map(humanise).join(" · ")}
                      </p>
                      <p className="text-[11px] font-bold text-purple-900/70 leading-snug">
                        Because you've customised this plant, its care guide no
                        longer auto-updates. Use <span className="font-black">Revert</span> to
                        rejoin automatic updates (your edits will be lost).
                      </p>
                    </div>
                  )}
                </>
              )}

              <ManualPlantCreation
                initialData={fullPlantData}
                onSave={handleSaveWithOverride}
                submitLabel="Save Updates"
                isSaving={isSaving}
                isReadOnly={plant.source === "api" || plant.source === "verdantly"}
                // Wave 7 (D9) — yellow highlight on fields the catalogue cron
                // updated but the user hasn't ack'd, purple on fields the
                // user has explicitly overridden. Both lists default to []
                // for non-AI plants (the hook returns null + the prop array
                // is empty) so the form looks unchanged.
                highlightedFields={
                  freshness?.has_update ? freshness.updated_care_fields : []
                }
                overriddenFields={overriddenFields}
              />
            </div>
          ) : activeTab === "schedules" ? (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
              <PlantScheduleTab homeId={homeId} plant={fullPlantData} />
            </div>
          ) : activeTab === "light" ? (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
              <LightTab plantId={plant.id} plantName={plant.common_name} />
            </div>
          ) : activeTab === "guides" ? (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
              <PlantGuidesTab
                plantId={plant.id}
                commonName={plant.common_name}
              />
            </div>
          ) : (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
              <CompanionPlantsTab
                source={plant.source}
                verdantlyId={plant.verdantly_id ?? null}
                plantName={plant.common_name}
                homeId={homeId}
                aiEnabled={aiEnabled}
                isPremium={isPremium}
              />
            </div>
          )}
        </div>
      </div>
      {/* Wave 6 — confirm modals for fork-on-edit + reset */}
      {pendingDetach && (
        <DetachConfirmModal
          changedFields={pendingDetach.changedFields}
          isSaving={!!isSaving}
          onCancel={() => setPendingDetach(null)}
          onConfirm={confirmDetach}
        />
      )}
      {resetOpen && (
        <ResetConfirmModal
          plantName={plant.common_name || "this plant"}
          isResetting={resetting}
          onCancel={() => setResetOpen(false)}
          onConfirm={handleReset}
        />
      )}
    </div>,
    document.body,
  );
}
