import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
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
  loadCataloguePlant,
  type CataloguePlant,
} from "../../lib/plantCatalogue";
import { saveToShed } from "../../lib/saveToShed";
import { useShedPlantMatcher } from "../../hooks/useShedPlantMatcher";
import PlantInfoPanel from "../PlantInfoPanel";
import GrowGuideTab from "../GrowGuideTab";
import CompanionPlantsTab from "../CompanionPlantsTab";
import LightTab from "../LightTab";

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
  const { plantId: rawId } = useParams<{ plantId: string }>();
  const plantId = Number(rawId);

  const [plant, setPlant] = useState<CataloguePlant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("care");
  const [saving, setSaving] = useState(false);
  // Set true the moment a save succeeds. The Shed matcher hook caches its
  // table read on mount, so we can't rely on it to flip immediately after
  // an insert; this local flag bridges the gap until the next visit.
  const [justSaved, setJustSaved] = useState(false);

  const { findMatch, loading: matcherLoading } = useShedPlantMatcher(homeId);

  // ── Load the plant row on mount ────────────────────────────────────────
  useEffect(() => {
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
  }, [plantId]);

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
          onClick={() => navigate("/library/search")}
          className="w-10 h-10 rounded-2xl bg-white border border-rhozly-outline/15 text-rhozly-on-surface/70 hover:text-rhozly-primary hover:border-rhozly-primary/30 flex items-center justify-center transition"
          aria-label="Back to search"
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
          disabled={showAsSaved || saving || matcherLoading}
          className={`inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-2xl text-xs font-black uppercase tracking-widest transition ${
            showAsSaved
              ? "bg-rhozly-surface-low text-rhozly-on-surface/45 cursor-default"
              : "bg-rhozly-primary text-white hover:opacity-90 disabled:opacity-50"
          }`}
        >
          {saving ? (
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

      {/* Hero image */}
      {plant.details.thumbnail_url && (
        <div
          data-testid="plant-preview-hero"
          className="rounded-3xl overflow-hidden mb-4 bg-rhozly-primary/5 aspect-[16/9]"
        >
          <img
            src={plant.details.thumbnail_url}
            alt={plant.details.common_name}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover"
          />
        </div>
      )}

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
          cache-first so this is cheap. */}
      <div data-testid="plant-preview-tab-body" className="mt-2">
        {activeTab === "care" && (
          <div className="rounded-3xl bg-white border border-rhozly-outline/15 overflow-hidden">
            <PlantInfoPanel
              details={plant.details}
              loading={false}
              plantName={plant.details.common_name}
            />
          </div>
        )}
        {activeTab === "grow" && (
          <GrowGuideTab
            plantId={plant.plantId}
            commonName={plant.details.common_name}
            source={plant.source}
            homeId={homeId}
            aiEnabled={aiEnabled}
          />
        )}
        {activeTab === "companions" && (
          <CompanionPlantsTab
            source={plant.source}
            verdantlyId={plant.details.verdantly_id ?? null}
            plantName={plant.details.common_name}
            homeId={homeId}
            aiEnabled={aiEnabled}
            isPremium={isPremium}
          />
        )}
        {activeTab === "light" && (
          <LightTab
            plantId={plant.plantId}
            plantName={plant.details.common_name}
            homeId={homeId}
          />
        )}
      </div>
    </div>
  );
}
