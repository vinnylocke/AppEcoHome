// Cross-home favourites — the Favourites scope body of the Watchlist (Phase 2).
//
// Renders the user's favourite ailments (live data through the immutable
// ailment_library reference; tombstone card when the reference is gone or the
// ailment was never in the library), with "Add to this home" (copy semantics,
// zero AI/API calls, open to any home member) and Remove actions. Strict
// source × tier gating: above-tier sources are view-only — add-to-home is
// disabled with an upsell tooltip.
//
// Mirrors FavouritePlantsGrid.tsx. See docs/plans/cross-home-favourites.md.

import React, { useMemo, useState } from "react";
import {
  Biohazard,
  Edit3,
  Binoculars,
  Home as HomeIcon,
  Library,
  Loader2,
  Lock,
  Plus,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { IconPest, IconPlant, IconPlantDB, IconAI } from "../../constants/icons";
import SmartImage from "../SmartImage";
import EmptyState from "../shared/EmptyState";
import { Logger } from "../../lib/errorHandler";
import { logEvent, EVENT } from "../../events/registry";
import {
  isAilmentSourceLockedForTier,
  lockedAilmentSourceMessage,
} from "../../lib/favouriteIdentity";
import {
  addFavouriteAilmentToHome,
  isFavouriteAilmentInHome,
  unfavouriteAilment,
} from "../../services/favouritesService";
import type { FavouriteAilment } from "../../types";

const HINT_KEY = "rhozly_watchlist_favourites_hint_shown";

type AilmentType = "invasive_plant" | "pest" | "disease";

interface HomeAilmentLite {
  name?: string;
}

interface Props {
  homeId: string;
  homeName?: string | null;
  homeAilments: HomeAilmentLite[];
  favourites: FavouriteAilment[];
  loading: boolean;
  searchQuery: string;
  aiEnabled: boolean;
  perenualEnabled: boolean;
  /** Parent re-lists favourites after a mutation. */
  onFavouritesChanged: () => void;
  /** Parent refreshes the watchlist after an add-to-home copy lands. */
  onHomeAilmentsChanged: () => void;
}

const TYPE_ICON: Record<AilmentType, React.ReactNode> = {
  pest: <IconPest size={64} />,
  disease: <Biohazard size={64} />,
  invasive_plant: <IconPlant size={64} />,
};

function sourceBadge(source: string) {
  const cls =
    source === "perenual"
      ? "text-rhozly-primary"
      : source === "library"
        ? "text-emerald-600"
        : source === "ai"
          ? "text-amber-500"
          : "text-rhozly-on-surface/60";
  const icon =
    source === "perenual" ? (
      <IconPlantDB size={10} />
    ) : source === "library" ? (
      <Library size={10} />
    ) : source === "ai" ? (
      <IconAI size={10} />
    ) : (
      <Edit3 size={10} />
    );
  const label =
    source === "perenual"
      ? "Plant Database"
      : source === "library"
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

export default function FavouriteAilmentsGrid({
  homeId,
  homeName,
  homeAilments,
  favourites,
  loading,
  searchQuery,
  aiEnabled,
  perenualEnabled,
  onFavouritesChanged,
  onHomeAilmentsChanged,
}: Props) {
  const [hintDismissed, setHintDismissed] = useState(
    () => localStorage.getItem(HINT_KEY) === "true",
  );
  const [busyFavId, setBusyFavId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return favourites;
    return favourites.filter((f) => {
      const name = (f.library?.name ?? f.name).toLowerCase();
      const sci = (
        (f.library?.scientific_name ??
          (f.snapshot?.scientific_name as string | null) ??
          "") as string
      ).toLowerCase();
      return name.includes(q) || sci.includes(q);
    });
  }, [favourites, searchQuery]);

  const dismissHint = () => {
    setHintDismissed(true);
    localStorage.setItem(HINT_KEY, "true");
  };

  const handleAddToHome = async (fav: FavouriteAilment) => {
    setBusyFavId(fav.id);
    try {
      await addFavouriteAilmentToHome(fav, homeId);
      logEvent(EVENT.FAVOURITE_AILMENT_ADDED_TO_HOME, {
        ailment_library_id: fav.ailment_library_id,
        source: fav.source,
      });
      toast.success(homeName ? `Added to ${homeName}.` : "Added to this home.");
      onHomeAilmentsChanged();
    } catch (err: any) {
      Logger.error(
        "Add favourite ailment to home failed",
        err,
        { favouriteId: fav.id },
        "Could not add this ailment to your home — please try again.",
      );
    } finally {
      setBusyFavId(null);
    }
  };

  const handleRemove = async (fav: FavouriteAilment) => {
    setBusyFavId(fav.id);
    try {
      await unfavouriteAilment(fav.id);
      logEvent(EVENT.AILMENT_UNFAVOURITED, {
        ailment_library_id: fav.ailment_library_id,
        source: fav.source,
      });
      toast.success("Removed from your watchlist.");
      onFavouritesChanged();
    } catch (err: any) {
      Logger.error(
        "Remove favourite ailment failed",
        err,
        { favouriteId: fav.id },
        "Could not remove this watchlist entry — please try again.",
      );
    } finally {
      setBusyFavId(null);
    }
  };

  return (
    <div data-testid="watchlist-favourites-grid" className="pb-32">
      {/* First-visit hint banner */}
      {!hintDismissed && (
        <div
          data-testid="watchlist-favourites-hint-banner"
          className="flex items-start gap-3 bg-rhozly-primary/5 border border-rhozly-primary/10 rounded-2xl px-4 py-3 mb-4"
        >
          <Binoculars size={16} className="text-rhozly-primary shrink-0 mt-0.5" />
          <div className="flex-1 text-xs font-bold text-rhozly-on-surface/60 leading-snug">
            <span className="font-black text-rhozly-on-surface/80">
              Your watchlist follows you, not the home.
            </span>{" "}
            Tap the 🔭 on any entry to carry its prevention and remedy
            steps to every garden you tend. Use{" "}
            <span className="font-black">Add to this home</span> to copy one into
            the garden you're in right now.
          </div>
          <button
            data-testid="watchlist-favourites-hint-dismiss"
            onClick={dismissHint}
            className="text-rhozly-on-surface/30 hover:text-rhozly-on-surface/60 transition-colors shrink-0 mt-0.5"
            aria-label="Dismiss watchlist hint"
          >
            <Plus size={14} className="rotate-45" />
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
            icon={<Binoculars size={32} />}
            title={searchQuery ? "Nothing matching on your watchlist" : "Nothing on your watchlist yet"}
            body={
              searchQuery
                ? "Try a different search term."
                : "Watch an ailment to carry its prevention and remedy steps to every garden you tend."
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((fav) => {
            const lib = fav.library ?? null;
            const isTombstone = !lib;
            const source = fav.source;
            const type = fav.ailment_type;
            const name = lib?.name ?? fav.name;
            const sci =
              (lib?.scientific_name as string | null) ??
              (fav.snapshot?.scientific_name as string | null) ??
              null;
            const image =
              fav.thumbnail_url ??
              (lib?.thumbnail_url as string | null) ??
              (lib?.image_url as string | null) ??
              "";
            const prevention = (
              (fav.snapshot?.prevention_steps as unknown[]) ?? []
            ).length;
            const remedy = ((fav.snapshot?.remedy_steps as unknown[]) ?? [])
              .length;
            const stepCount = prevention + remedy;
            const locked = isAilmentSourceLockedForTier(source, {
              aiEnabled,
              perenualEnabled,
            });
            const inHome = isFavouriteAilmentInHome(fav, homeAilments);
            const busy = busyFavId === fav.id;
            const savedFrom = fav.favourited_from_home?.name ?? null;
            const savedDate = new Date(fav.created_at).toLocaleDateString();

            return (
              <div
                key={fav.id}
                data-testid={`favourite-ailment-card-${fav.ailment_library_id ?? fav.id}`}
                className="relative bg-rhozly-surface-lowest rounded-3xl overflow-hidden border-2 border-rhozly-outline/20 shadow-sm flex flex-col"
              >
                <div className="h-40 relative overflow-hidden bg-rhozly-surface-low flex items-center justify-center">
                  {image ? (
                    <SmartImage
                      src={image}
                      alt={name}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-rhozly-on-surface/15">
                      {TYPE_ICON[type]}
                    </span>
                  )}
                  <div className="absolute bottom-3 left-3 z-10 flex flex-col items-start gap-1.5">
                    {sourceBadge(source)}
                  </div>
                </div>
                <div className="p-5 flex-1 flex flex-col">
                  <h3 className="text-lg font-black text-rhozly-on-surface leading-tight mb-0.5">
                    {name}
                  </h3>
                  {sci && (
                    <p className="text-xs font-bold text-rhozly-on-surface/40 italic truncate">
                      {sci}
                    </p>
                  )}
                  <p className="text-[10px] font-bold text-rhozly-on-surface/40 mt-1.5">
                    {savedFrom ? `Saved from ${savedFrom} · ` : ""}Saved{" "}
                    {savedDate}
                    {stepCount > 0
                      ? ` · ${stepCount} step${stepCount !== 1 ? "s" : ""}`
                      : ""}
                  </p>
                  {isTombstone && (
                    <p
                      data-testid={`favourite-ailment-tombstone-${fav.id}`}
                      className="mt-2 text-[10px] font-black uppercase tracking-widest text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1 self-start"
                    >
                      Saved copy
                    </p>
                  )}
                  <div className="mt-auto pt-4 flex items-center gap-2">
                    {inHome ? (
                      <span
                        data-testid={`favourite-ailment-in-home-${fav.id}`}
                        className="flex-1 h-10 px-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-widest"
                      >
                        <HomeIcon size={13} /> In this home
                      </span>
                    ) : (
                      <button
                        data-testid={`favourite-ailment-add-to-home-${fav.id}`}
                        onClick={() => !locked && handleAddToHome(fav)}
                        disabled={busy || locked}
                        title={
                          locked
                            ? lockedAilmentSourceMessage(source)
                            : "Copy this ailment into your current home"
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
                      data-testid={`favourite-ailment-remove-${fav.id}`}
                      onClick={() => handleRemove(fav)}
                      disabled={busy}
                      aria-label={`Remove ${name} from your watchlist`}
                      title="Remove from your watchlist"
                      className="w-10 h-10 rounded-2xl text-rhozly-on-surface/45 hover:bg-rose-50 hover:text-rose-600 flex items-center justify-center transition-colors"
                    >
                      <Binoculars size={16} />
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
