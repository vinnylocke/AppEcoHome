import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  BookmarkPlus,
  BookmarkCheck,
  Leaf,
  BookOpenCheck,
  Users as UsersIcon,
  Sun,
} from "lucide-react";
import toast from "react-hot-toast";
import { Logger } from "../../lib/errorHandler";
import {
  ensureCataloguePlantFromSearchResult,
  loadCataloguePlant,
  type CataloguePlant,
} from "../../lib/plantCatalogue";
import { saveToShed } from "../../lib/saveToShed";
import { useShedPlantMatcher } from "../../hooks/useShedPlantMatcher";
import { PlantDoctorService } from "../../services/plantDoctorService";
import { fetchCompanions as prefetchCompanions } from "../../lib/companionCache";
import ManualPlantCreation from "../ManualPlantCreation";
import PlantResultThumb from "../PlantResultThumb";
import GrowGuideTab from "../GrowGuideTab";
import CompanionPlantsTab from "../CompanionPlantsTab";
import LightTab from "../LightTab";
import type { ProviderSearchResult } from "../../lib/verdantlyUtils";

interface Props {
  homeId: string;
  aiEnabled: boolean;
  isPremium: boolean;
}

type Tab = "care" | "grow" | "companions" | "light";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "care",       label: "Care Guide", icon: <Leaf size={14} /> },
  { id: "grow",       label: "Grow Guide", icon: <BookOpenCheck size={14} /> },
  { id: "companions", label: "Companions", icon: <UsersIcon size={14} /> },
  { id: "light",      label: "Light",      icon: <Sun size={14} /> },
];

/**
 * The Library — single-plant preview screen.
 *
 * Mounted at `/library/plant/:plantId`. Drives all four tabs against a
 * catalogue plant id (either a global row or a home-scoped row, both work).
 * The Save button forks the catalogue row into the user's shed when first
 * tapped; if the plant is already in the shed the button is disabled and
 * reads "In your Shed".
 *
 * State machine:
 *   loading      — fetching the row
 *   error        — fetch / save failed
 *   ready        — row loaded; tab content lazy-renders
 *   saving       — Save in flight; the button is busy
 */
export default function PlantPreview({ homeId, aiEnabled, isPremium }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const { plantId: rawId } = useParams<{ plantId: string }>();

  // The route accepts either:
  //   /library/plant/12345    → load by catalogue id (Saved-tab / share link)
  //   /library/plant/preview  → instant-render path, search result in state.
  const isPreviewRoute = rawId === "preview";
  const plantId = isPreviewRoute ? NaN : Number(rawId);
  const stateResult = (location.state as { result?: ProviderSearchResult } | null)
    ?.result;
  /**
   * Originating route — set by callers that aren't the library search
   * (e.g. SeasonalPickTile from Dashboard / Today / Quick Access). The
   * in-page back button uses this when present so a Sarah who taps a
   * pick on `/dashboard` ends up back on `/dashboard` rather than on a
   * Library search screen she never visited.
   */
  const backTo =
    (location.state as { from?: string } | null)?.from?.trim() || "/library/search";

  const [plant, setPlant] = useState<CataloguePlant | null>(null);
  // `loading` only blocks the screen until we have *something* to show.
  // Once we have a search-result hero we flip to false even if the
  // catalogue ensure is still running in the background; that fires the
  // Care Guide tab into its own "ensuring..." state instead of blanking
  // the whole page.
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("care");
  const [saving, setSaving] = useState(false);
  // True while we're firing `ensureCataloguePlantFromSearchResult` in the
  // background after an instant-preview navigation. The Care Guide tab
  // uses this to show a skeleton; the other tabs gate their content on
  // having a real `plant.plantId` (>= 1).
  const [ensuring, setEnsuring] = useState(false);
  // Set true the moment a save succeeds. The Shed matcher hook caches its
  // table read on mount, so we can't rely on it to flip immediately after
  // an insert; this local flag bridges the gap until the next visit.
  const [justSaved, setJustSaved] = useState(false);

  const { findMatch, loading: matcherLoading } = useShedPlantMatcher(homeId);

  // ── Load path 1: numeric plant id (Saved tab / share link) ────────────
  useEffect(() => {
    if (isPreviewRoute) return;
    if (!Number.isFinite(plantId)) {
      setError("Invalid plant id.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadCataloguePlant(plantId)
      .then((data) => {
        if (cancelled) return;
        setPlant(data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        Logger.error("PlantPreview load failed", err, { plantId });
        setError(err instanceof Error ? err.message : "Couldn't load plant.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [plantId, isPreviewRoute]);

  // ── Load path 2: instant-preview from a search result ─────────────────
  // Renders a placeholder plant from the search-result data immediately
  // (so the hero, common name, scientific name and thumbnail show
  // straight away), then fires `ensureCataloguePlantFromSearchResult` in
  // the background. Once it resolves the URL is swapped to the real
  // catalogue id so Back / refresh land on the canonical route.
  useEffect(() => {
    if (!isPreviewRoute) return;
    if (!stateResult) {
      // Hard navigation to /library/plant/preview without state — nothing
      // we can render. Redirect back to search.
      navigate("/library/search", { replace: true });
      return;
    }
    // Synthesize a placeholder CataloguePlant from the search-result data
    // so the hero + the (empty) Care Guide form render instantly.
    const placeholder: CataloguePlant = {
      plantId: -1, // sentinel — tabs wait until this becomes a real id
      source:
        stateResult._provider === "ai"
          ? "ai"
          : stateResult._provider === "verdantly"
          ? "verdantly"
          : "api",
      details: {
        common_name: stateResult.common_name,
        scientific_name: stateResult.scientific_name ?? [],
        other_names: [],
        family: null,
        plant_type: null,
        cycle: null,
        image_url: stateResult.thumbnail_url ?? null,
        thumbnail_url: stateResult.thumbnail_url ?? null,
        watering: null,
        watering_benchmark: null,
        watering_min_days: null,
        watering_max_days: null,
        sunlight: [],
        care_level: null,
        hardiness_min: null,
        hardiness_max: null,
        is_edible: false,
        is_toxic_pets: false,
        is_toxic_humans: false,
        attracts: [],
        description: null,
        maintenance: null,
        growth_rate: null,
        growth_habit: null,
        drought_tolerant: false,
        salt_tolerant: false,
        thorny: false,
        invasive: false,
        tropical: false,
        indoor: false,
        pest_susceptibility: [],
        flowers: false,
        cones: false,
        fruits: false,
        edible_leaf: false,
        cuisine: false,
        medicinal: false,
        leaf: false,
        flowering_season: null,
        harvest_season: null,
        pruning_month: [],
        propagation: [],
        perenual_id: stateResult.perenual_id ?? null,
        verdantly_id: stateResult.verdantly_id ?? null,
        source:
          stateResult._provider === "ai"
            ? "ai"
            : stateResult._provider === "verdantly"
            ? "verdantly"
            : "api",
      },
      fromCache: false,
    };

    setPlant(placeholder);
    setLoading(false);
    setEnsuring(true);
    setError(null);

    let cancelled = false;
    ensureCataloguePlantFromSearchResult(stateResult, { homeId })
      .then((real) => {
        if (cancelled) return;
        setPlant(real);
        // Replace the URL so Back/refresh land on the canonical route and
        // a re-search of the same result doesn't recreate the row.
        navigate(`/library/plant/${real.plantId}`, { replace: true });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        Logger.error("PlantPreview ensure failed", err, {
          provider: stateResult._provider,
          name: stateResult.common_name,
        });
        toast.error(
          err instanceof Error
            ? err.message
            : "Couldn't load the full plant details.",
        );
      })
      .finally(() => {
        if (!cancelled) setEnsuring(false);
      });

    return () => {
      cancelled = true;
    };
    // We intentionally only re-run this when the search result identity
    // changes; navigating to a real plantId tears the component down.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPreviewRoute, stateResult?.id, stateResult?._provider]);

  // ── Pre-warm the per-tab edge functions in the background ─────────────
  // The moment we have a real catalogue id, fire the Grow Guide and
  // Companions requests so the data is ready (or already arrived) by the
  // time the user taps either tab. Both go through cache layers — Grow
  // Guide is cached server-side in `plant_grow_guides`; Companions is
  // cached client-side via `companionCache` so this and the tab's own
  // mount-fetch share one network call.
  useEffect(() => {
    if (!plant || plant.plantId <= 0) return;
    // Grow Guide: only worth pre-warming for Sage+ users (the edge fn
    // returns a 402-equivalent for non-AI tiers); fire-and-forget.
    if (aiEnabled) {
      PlantDoctorService.generateGrowGuide(plant.plantId, homeId).catch(() => {
        // ignore — the tab will surface any real error when the user opens it
      });
    }
    // Companions: kicked off via the shared promise cache so the tab's
    // own fetchCompanions() call resolves instantly from the same
    // in-flight promise.
    prefetchCompanions({
      source: plant.source,
      verdantlyId: plant.details.verdantly_id ?? null,
      plantName: plant.details.common_name,
      aiEnabled,
    }).catch(() => { /* silent */ });
  }, [plant?.plantId, plant?.source, plant?.details.verdantly_id, plant?.details.common_name, homeId, aiEnabled]);

  const inShed = useMemo(() => {
    if (!plant) return null;
    // Match against the plant's catalogue identity. If the catalogue row
    // is itself home-scoped (someone tapped a Saved-tab card), it lives
    // in their own shed by definition.
    const result = findMatch({
      source: plant.source,
      perenual_id: plant.details.perenual_id ?? null,
      verdantly_id: plant.details.verdantly_id ?? null,
      common_name: plant.details.common_name,
    });
    return result;
  }, [plant, findMatch]);

  const handleSave = async () => {
    if (!plant || saving || inShed) return;
    setSaving(true);
    try {
      await saveToShed(
        {
          common_name: plant.details.common_name,
          scientific_name: plant.details.scientific_name,
          thumbnail_url: plant.details.thumbnail_url ?? null,
          source: plant.source,
          perenual_id: plant.details.perenual_id ?? null,
          verdantly_id: plant.details.verdantly_id ?? null,
          sunlight: plant.details.sunlight,
          watering_min_days: plant.details.watering_min_days ?? null,
          watering_max_days: plant.details.watering_max_days ?? null,
          harvest_season: plant.details.harvest_season,
          pruning_month: plant.details.pruning_month,
          // For AI plants forked from the global catalogue, mark the
          // parent link so the existing shallow-fork tooling stays
          // consistent (Wave 3 of AI Plant Overhaul).
          ...(plant.source === "ai" && plant.plantId
            ? { forked_from_plant_id: plant.plantId, overridden_fields: [] }
            : {}),
        },
        plant.details as any,
        homeId,
      );

      toast.success(`${plant.details.common_name} added to your Shed.`);
      setJustSaved(true);
    } catch (err: unknown) {
      Logger.error("PlantPreview save failed", err, { plantId });
      toast.error(
        err instanceof Error ? err.message : "Couldn't save plant — try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const showAsSaved = !!inShed || justSaved;

  // ── Loading / error states ─────────────────────────────────────────────
  if (loading) {
    return (
      <div
        data-testid="plant-preview-loading"
        className="flex items-center gap-2 px-4 py-8 text-sm text-rhozly-on-surface/55 justify-center"
      >
        <Loader2 className="animate-spin" size={16} />
        Loading plant…
      </div>
    );
  }

  if (error || !plant) {
    return (
      <div
        data-testid="plant-preview-error"
        className="px-4 py-3 rounded-2xl bg-red-50 border border-red-100 text-sm text-red-800 flex items-start gap-3 mx-4 mt-4"
      >
        <AlertCircle size={16} className="shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="font-bold mb-1">Couldn't open this plant.</p>
          <p className="text-xs leading-snug mb-2">{error}</p>
          <button
            type="button"
            onClick={() => navigate("/library/search")}
            className="px-3 py-1.5 rounded-xl bg-red-600 text-white text-xs font-black uppercase tracking-widest hover:opacity-90 transition"
          >
            Back to search
          </button>
        </div>
      </div>
    );
  }

  const sciLine = plant.details.scientific_name[0] ?? null;

  return (
    <div data-testid="plant-preview" className="min-h-full pb-12">
      {/* Header — sticky back + Save */}
      <header
        data-testid="plant-preview-header"
        className="sticky top-0 z-20 -mx-4 px-4 py-3 bg-rhozly-bg/95 backdrop-blur-md border-b border-rhozly-outline/15 flex items-center gap-2 mb-4"
      >
        <button
          type="button"
          data-testid="plant-preview-back"
          onClick={() => navigate(backTo)}
          className="w-10 h-10 rounded-2xl bg-white border border-rhozly-outline/15 text-rhozly-on-surface/70 hover:text-rhozly-primary hover:border-rhozly-primary/30 flex items-center justify-center transition"
          aria-label={backTo === "/library/search" ? "Back to search" : "Back"}
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <p
            data-testid="plant-preview-name"
            className="font-display font-black text-rhozly-on-surface text-base leading-tight truncate"
          >
            {plant.details.common_name}
          </p>
          {sciLine && (
            <p className="text-[11px] font-bold italic text-rhozly-on-surface/45 truncate">
              {sciLine}
            </p>
          )}
        </div>
        <button
          type="button"
          data-testid="plant-preview-save"
          onClick={handleSave}
          disabled={showAsSaved || saving || matcherLoading || ensuring}
          className={`inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-2xl text-xs font-black uppercase tracking-widest transition ${
            showAsSaved
              ? "bg-rhozly-surface-low text-rhozly-on-surface/45 cursor-default"
              : "bg-rhozly-primary text-white hover:opacity-90 disabled:opacity-50"
          }`}
          title={ensuring ? "Loading the full plant details before saving…" : undefined}
        >
          {saving || ensuring ? (
            <Loader2 size={14} className="animate-spin" />
          ) : showAsSaved ? (
            <>
              <BookmarkCheck size={14} />
              In your Shed
            </>
          ) : (
            <>
              <BookmarkPlus size={14} />
              Save
            </>
          )}
        </button>
      </header>

      {/* Hero image — self-resolves by name for library rows (null image). */}
      <div
        data-testid="plant-preview-hero"
        className="rounded-3xl overflow-hidden mb-4 bg-rhozly-primary/5 aspect-[16/9] flex items-center justify-center text-rhozly-primary/40"
      >
        <PlantResultThumb
          name={plant.details.common_name}
          url={plant.details.thumbnail_url}
          source={plant.source}
          iconSize={32}
        />
      </div>

      {/* Tab bar */}
      <div
        data-testid="plant-preview-tabs"
        className="flex items-center gap-1.5 overflow-x-auto pb-3 -mx-1 px-1 scrollbar-hide"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            data-testid={`plant-preview-tab-${t.id}`}
            aria-pressed={activeTab === t.id}
            onClick={() => setActiveTab(t.id)}
            className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-2xl text-[11px] font-black uppercase tracking-widest transition ${
              activeTab === t.id
                ? "bg-rhozly-primary text-white shadow-sm"
                : "bg-white border border-rhozly-outline/15 text-rhozly-on-surface/65 hover:border-rhozly-primary/30"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Active tab body — only the active tab is rendered so we don't
          auto-generate everything on first mount. Tabs ARE remounted when
          switched away/back; the GrowGuideTab and CompanionPlantsTab both
          cache-first so this is cheap. The Grow Guide / Companions /
          Light tabs gate their content on having a real catalogue id —
          while the background `ensureCataloguePlantFromSearchResult` is
          running, plant.plantId is -1 and these tabs show a "Loading
          plant…" placeholder instead of firing edge-fn calls against a
          bogus id. */}
      <div data-testid="plant-preview-tab-body" className="mt-2">
        {activeTab === "care" && (
          <div className="rounded-3xl bg-white border border-rhozly-outline/15 overflow-hidden p-4 relative">
            {/* Library uses the same read-only ManualPlantCreation form that
                The Shed's Care Guide tab uses, so the field layout (sunlight,
                cycle, watering, propagation, pruning, edibility, toxicity,
                wildlife, etc.) is consistent across both surfaces. */}
            <ManualPlantCreation
              initialData={plant.details}
              isReadOnly={true}
              submitLabel=""
            />
            {ensuring && (
              <div
                data-testid="plant-preview-care-ensuring"
                className="absolute inset-0 bg-white/85 backdrop-blur-sm flex items-center justify-center"
              >
                <div className="flex items-center gap-2 text-sm font-bold text-rhozly-on-surface/65">
                  <Loader2 size={16} className="animate-spin text-rhozly-primary" />
                  Loading the care guide…
                </div>
              </div>
            )}
          </div>
        )}
        {activeTab === "grow" && (
          plant.plantId > 0 ? (
            <GrowGuideTab
              plantId={plant.plantId}
              commonName={plant.details.common_name}
              source={plant.source}
              homeId={homeId}
              aiEnabled={aiEnabled}
              autoGenerate
            />
          ) : (
            <div
              data-testid="plant-preview-grow-waiting"
              className="rounded-3xl bg-white border border-rhozly-outline/15 p-6 text-center text-sm font-bold text-rhozly-on-surface/55 flex items-center justify-center gap-2"
            >
              <Loader2 size={16} className="animate-spin text-rhozly-primary" />
              Preparing the plant…
            </div>
          )
        )}
        {activeTab === "companions" && (
          plant.plantId > 0 ? (
            <CompanionPlantsTab
              source={plant.source}
              verdantlyId={plant.details.verdantly_id ?? null}
              plantName={plant.details.common_name}
              homeId={homeId}
              aiEnabled={aiEnabled}
              isPremium={isPremium}
            />
          ) : (
            <div
              data-testid="plant-preview-companions-waiting"
              className="rounded-3xl bg-white border border-rhozly-outline/15 p-6 text-center text-sm font-bold text-rhozly-on-surface/55 flex items-center justify-center gap-2"
            >
              <Loader2 size={16} className="animate-spin text-rhozly-primary" />
              Preparing the plant…
            </div>
          )
        )}
        {activeTab === "light" && (
          plant.plantId > 0 ? (
            <LightTab
              plantId={plant.plantId}
              plantName={plant.details.common_name}
              homeId={homeId}
            />
          ) : (
            <div
              data-testid="plant-preview-light-waiting"
              className="rounded-3xl bg-white border border-rhozly-outline/15 p-6 text-center text-sm font-bold text-rhozly-on-surface/55 flex items-center justify-center gap-2"
            >
              <Loader2 size={16} className="animate-spin text-rhozly-primary" />
              Preparing the plant…
            </div>
          )
        )}
      </div>
    </div>
  );
}
