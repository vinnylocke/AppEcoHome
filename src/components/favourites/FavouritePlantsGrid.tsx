// Cross-home favourites — the Favourites scope body of The Shed (Phase 1).
//
// Renders the user's favourite plants (live data through the immutable plant
// reference; tombstone card when the reference is gone), with "Add to this
// home" (copy semantics, zero AI/API calls, open to any home member) and
// Remove actions. Strict source × tier gating: above-tier sources are
// view-only — add-to-home is disabled with an upsell tooltip.
//
// See docs/plans/cross-home-favourites.md.

import React, { useMemo, useState } from "react";
import {
  Database,
  Edit3,
  Heart,
  Home as HomeIcon,
  Library,
  Loader2,
  Lock,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "react-hot-toast";
import SmartImage from "../SmartImage";
import { PlantInitialTile } from "../ui/PlantInitialTile";
import EmptyState from "../shared/EmptyState";
import { Logger } from "../../lib/errorHandler";
import { logEvent, EVENT } from "../../events/registry";
import {
  isSourceLockedForTier,
  lockedSourceMessage,
} from "../../lib/favouriteIdentity";
import {
  addFavouritePlantToHome,
  isFavouriteInHome,
  unfavouritePlant,
} from "../../services/favouritesService";
import type { FavouritePlant } from "../../types";

const HINT_KEY = "rhozly_favourites_hint_shown";

interface HomePlantLite {
  id: number;
  forked_from_plant_id?: number | null;
  common_name?: string;
  is_archived?: boolean;
}

interface Props {
  homeId: string;
  homeName?: string | null;
  homePlants: HomePlantLite[];
  favourites: FavouritePlant[];
  loading: boolean;
  searchQuery: string;
  aiEnabled: boolean;
  perenualEnabled: boolean;
  /** Parent re-lists favourites after a mutation. */
  onFavouritesChanged: () => void;
  /** Parent refreshes the shed after an add-to-home copy lands. */
  onHomePlantsChanged: () => void;
}

function sourceBadge(source: string, isLibrary: boolean) {
  const cls =
    source === "api"
      ? "text-rhozly-primary"
      : source === "verdantly" || isLibrary
        ? "text-emerald-600"
        : source === "ai"
          ? "text-amber-500"
          : "text-rhozly-on-surface/60";
  const icon =
    source === "api" || source === "verdantly" ? (
      <Database size={10} />
    ) : isLibrary ? (
      <Library size={10} />
    ) : source === "ai" ? (
      <Sparkles size={10} />
    ) : (
      <Edit3 size={10} />
    );
  const label =
    source === "api"
      ? "Perenual"
      : source === "verdantly"
        ? "Verdantly"
        : isLibrary
          ? "Library"
          : source === "ai"
            ? "AI"
            : "Manual";
  return (
    <span
      className={`bg-white/90 backdrop-blur-md px-3 py-1 rounded-full text-[11px] font-black uppercase flex items-center gap-1.5 shadow-sm border border-white/20 ${cls}`}
    >
      {icon}
      {label}
    </span>
  );
}

export default function FavouritePlantsGrid({
  homeId,
  homeName,
  homePlants,
  favourites,
  loading,
  searchQuery,
  aiEnabled,
  perenualEnabled,
  onFavouritesChanged,
  onHomePlantsChanged,
}: Props) {
  const [hintDismissed, setHintDismissed] = useState(
    () => localStorage.getItem(HINT_KEY) === "true",
  );
  const [busyFavId, setBusyFavId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return favourites;
    return favourites.filter((f) => {
      const name = (f.plant?.common_name ?? f.common_name).toLowerCase();
      const sci = (f.plant?.scientific_name ?? f.scientific_name ?? []) as string[];
      return (
        name.includes(q) ||
        sci.some((s) => (s ?? "").toLowerCase().includes(q))
      );
    });
  }, [favourites, searchQuery]);

  const dismissHint = () => {
    setHintDismissed(true);
    localStorage.setItem(HINT_KEY, "true");
  };

  const handleAddToHome = async (fav: FavouritePlant) => {
    setBusyFavId(fav.id);
    try {
      await addFavouritePlantToHome(fav, homeId);
      logEvent(EVENT.FAVOURITE_ADDED_TO_HOME, {
        plant_ref_id: fav.plant_id,
        source: fav.plant?.source ?? fav.source,
      });
      toast.success(
        homeName ? `Added to ${homeName}.` : "Added to this home.",
      );
      onHomePlantsChanged();
    } catch (err: any) {
      Logger.error(
        "Add favourite to home failed",
        err,
        { favouriteId: fav.id },
        "Could not add this favourite to your home — please try again.",
      );
    } finally {
      setBusyFavId(null);
    }
  };

  const handleRemove = async (fav: FavouritePlant) => {
    setBusyFavId(fav.id);
    try {
      await unfavouritePlant(fav.id);
      logEvent(EVENT.PLANT_UNFAVOURITED, {
        plant_ref_id: fav.plant_id,
        source: fav.plant?.source ?? fav.source,
      });
      toast.success("Removed from favourites.");
      onFavouritesChanged();
    } catch (err: any) {
      Logger.error(
        "Remove favourite failed",
        err,
        { favouriteId: fav.id },
        "Could not remove this favourite — please try again.",
      );
    } finally {
      setBusyFavId(null);
    }
  };

  return (
    <div data-testid="favourites-grid" className="pb-32">
      {/* First-visit hint banner */}
      {!hintDismissed && (
        <div
          data-testid="favourites-hint-banner"
          className="flex items-start gap-3 bg-rhozly-primary/5 border border-rhozly-primary/10 rounded-2xl px-4 py-3 mb-4"
        >
          <Heart size={16} className="text-rhozly-primary shrink-0 mt-0.5" />
          <div className="flex-1 text-xs font-bold text-rhozly-on-surface/60 leading-snug">
            <span className="font-black text-rhozly-on-surface/80">
              Favourites follow you, not the home.
            </span>{" "}
            Tap the ♡ on any plant in your Home tab to keep it here across
            every home you tend. Use <span className="font-black">Add to this home</span> to
            copy one into the garden you're in right now.
          </div>
          <button
            data-testid="favourites-hint-dismiss"
            onClick={dismissHint}
            className="text-rhozly-on-surface/30 hover:text-rhozly-on-surface/60 transition-colors shrink-0 mt-0.5"
            aria-label="Dismiss favourites hint"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {loading ? (
        <div className="min-h-[240px] flex items-center justify-center">
          <Loader2 size={22} className="animate-spin text-rhozly-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="min-h-[400px] flex items-center justify-center py-8">
          <EmptyState
            size="lg"
            chrome="none"
            icon={<Heart size={32} />}
            title={searchQuery ? "No matching favourites" : "No favourites yet"}
            body={
              searchQuery
                ? "Try a different search term."
                : "Tap the ♡ on any plant in your Home tab to keep it with you across homes."
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filtered.map((fav) => {
            const live = fav.plant ?? null;
            const isTombstone = !live;
            const source = (live?.source as string) ?? fav.source;
            const isLibrary =
              source === "ai" &&
              (live != null
                ? live.home_id === null || (live as any).forked_from_plant_id != null
                : false);
            const name = live?.common_name ?? fav.common_name;
            const sci =
              ((live?.scientific_name ?? fav.scientific_name ?? []) as string[])[0] ??
              "Unknown Species";
            const image = live?.thumbnail_url ?? fav.image_url ?? "";
            const locked = isSourceLockedForTier(source, {
              aiEnabled,
              perenualEnabled,
            });
            const inHome = isFavouriteInHome(fav, homePlants);
            const busy = busyFavId === fav.id;
            const savedFrom = fav.favourited_from_home?.name ?? null;
            const savedDate = new Date(fav.created_at).toLocaleDateString();

            return (
              <div
                key={fav.id}
                data-testid={`favourite-card-${fav.plant_id ?? fav.id}`}
                className="relative bg-rhozly-surface-lowest rounded-3xl overflow-hidden border-2 border-rhozly-outline/20 shadow-sm flex flex-col"
              >
                <div className="h-40 relative overflow-hidden bg-rhozly-primary/5">
                  {image ? (
                    <SmartImage
                      src={image}
                      alt={name}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <PlantInitialTile
                      plant={{
                        scientific_name:
                          ((live?.scientific_name ?? fav.scientific_name) as string[] | null) ??
                          null,
                        common_name: name ?? null,
                      }}
                    />
                  )}
                  <div className="absolute bottom-3 left-3 z-10 flex flex-col items-start gap-1.5">
                    {sourceBadge(source, isLibrary)}
                  </div>
                </div>
                <div className="p-5 flex-1 flex flex-col">
                  <h3 className="text-lg font-black text-rhozly-on-surface leading-tight mb-0.5">
                    {name}
                  </h3>
                  <p className="text-xs font-bold text-rhozly-on-surface/40 italic truncate">
                    {sci}
                  </p>
                  <p className="text-[10px] font-bold text-rhozly-on-surface/40 mt-1.5">
                    {savedFrom ? `Saved from ${savedFrom} · ` : ""}Saved {savedDate}
                  </p>
                  {isTombstone && (
                    <p
                      data-testid={`favourite-tombstone-${fav.id}`}
                      className="mt-2 text-[10px] font-black uppercase tracking-widest text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1 self-start"
                    >
                      Original removed — saved copy
                    </p>
                  )}
                  <div className="mt-auto pt-4 flex items-center gap-2">
                    {inHome ? (
                      <span
                        data-testid={`favourite-in-home-${fav.id}`}
                        className="flex-1 h-10 px-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-widest"
                      >
                        <HomeIcon size={13} /> In this home
                      </span>
                    ) : (
                      <button
                        data-testid={`favourite-add-to-home-${fav.id}`}
                        onClick={() => !locked && handleAddToHome(fav)}
                        disabled={busy || locked}
                        title={
                          locked
                            ? lockedSourceMessage(source)
                            : "Copy this plant into your current home"
                        }
                        className={`flex-1 h-10 px-3 rounded-2xl flex items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-widest transition-all ${
                          locked
                            ? "bg-rhozly-surface-low text-rhozly-on-surface/30 cursor-not-allowed"
                            : "bg-rhozly-primary/10 text-rhozly-primary hover:bg-rhozly-primary hover:text-white"
                        }`}
                      >
                        {busy ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : locked ? (
                          <Lock size={13} />
                        ) : (
                          <Plus size={13} />
                        )}
                        Add to this home
                      </button>
                    )}
                    <button
                      data-testid={`favourite-remove-${fav.id}`}
                      onClick={() => handleRemove(fav)}
                      disabled={busy}
                      aria-label={`Remove ${name} from favourites`}
                      title="Remove from favourites"
                      className="w-10 h-10 rounded-2xl text-rhozly-on-surface/45 hover:bg-rose-50 hover:text-rose-600 flex items-center justify-center transition-colors"
                    >
                      <Heart size={16} className="fill-current" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
