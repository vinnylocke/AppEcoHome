// Cross-home favourites — the Favourites scope body of the Nursery (Phase 3).
//
// Renders the user's favourite seed packets. SNAPSHOT-ONLY: packets have no
// canonical library, so every card renders from the immutable identity columns +
// the snapshot (there is no live-ref join). "Add to this home" recreates the
// packet via createSeedPacket (copy semantics, zero AI/API calls, open to any
// home member — NO tier gating, since packets have no source) and copies the
// favourite-scoped image back into the home. Remove deletes the favourite.
//
// Mirrors FavouriteAilmentsGrid.tsx. See docs/plans/cross-home-favourites.md.

import React, { useMemo, useState } from "react";
import {
  Calendar,
  Heart,
  Home as HomeIcon,
  Loader2,
  Package,
  Plus,
} from "lucide-react";
import { toast } from "react-hot-toast";
import EmptyState from "../shared/EmptyState";
import { Logger } from "../../lib/errorHandler";
import { logEvent, EVENT } from "../../events/registry";
import type { SeedPacketWithGermination } from "../../services/nurseryService";
import {
  addFavouritePacketToHome,
  isFavouritePacketInHome,
  unfavouriteSeedPacket,
} from "../../services/favouritesService";
import type { FavouriteSeedPacket } from "../../types";

const HINT_KEY = "rhozly_nursery_favourites_hint_shown";

interface HomeNurseryEntry {
  packet: SeedPacketWithGermination;
  plant: { common_name?: string | null } | null;
}

interface Props {
  homeId: string;
  homeName?: string | null;
  homeEntries: HomeNurseryEntry[];
  favourites: FavouriteSeedPacket[];
  loading: boolean;
  searchQuery: string;
  /** Parent re-lists favourites after a mutation. */
  onFavouritesChanged: () => void;
  /** Parent refreshes the nursery after an add-to-home copy lands. */
  onHomePacketsChanged: () => void;
}

export default function FavouriteSeedPacketsGrid({
  homeId,
  homeName,
  homeEntries,
  favourites,
  loading,
  searchQuery,
  onFavouritesChanged,
  onHomePacketsChanged,
}: Props) {
  const [hintDismissed, setHintDismissed] = useState(
    () => localStorage.getItem(HINT_KEY) === "true",
  );
  const [busyFavId, setBusyFavId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return favourites;
    return favourites.filter((f) => {
      const variety = (f.variety ?? "").toLowerCase();
      const plant = (f.plant_common_name ?? "").toLowerCase();
      const vendor = (f.vendor ?? "").toLowerCase();
      return variety.includes(q) || plant.includes(q) || vendor.includes(q);
    });
  }, [favourites, searchQuery]);

  const dismissHint = () => {
    setHintDismissed(true);
    localStorage.setItem(HINT_KEY, "true");
  };

  const handleAddToHome = async (fav: FavouriteSeedPacket) => {
    setBusyFavId(fav.id);
    try {
      await addFavouritePacketToHome(fav, homeId);
      logEvent(EVENT.FAVOURITE_SEED_PACKET_ADDED_TO_HOME, {
        identity_key: fav.identity_key,
      });
      toast.success(homeName ? `Added to ${homeName}.` : "Added to this home.");
      onHomePacketsChanged();
    } catch (err: any) {
      Logger.error(
        "Add favourite packet to home failed",
        err,
        { favouriteId: fav.id },
        "Could not add this packet to your home — please try again.",
      );
    } finally {
      setBusyFavId(null);
    }
  };

  const handleRemove = async (fav: FavouriteSeedPacket) => {
    setBusyFavId(fav.id);
    try {
      await unfavouriteSeedPacket(fav.id);
      logEvent(EVENT.SEED_PACKET_UNFAVOURITED, { identity_key: fav.identity_key });
      toast.success("Removed from favourites.");
      onFavouritesChanged();
    } catch (err: any) {
      Logger.error(
        "Remove favourite packet failed",
        err,
        { favouriteId: fav.id },
        "Could not remove this favourite — please try again.",
      );
    } finally {
      setBusyFavId(null);
    }
  };

  return (
    <div data-testid="nursery-favourites-grid" className="pb-32">
      {/* First-visit hint banner */}
      {!hintDismissed && (
        <div
          data-testid="nursery-favourites-hint-banner"
          className="flex items-start gap-3 bg-rhozly-primary/5 border border-rhozly-primary/10 rounded-2xl px-4 py-3 mb-4"
        >
          <Heart size={16} className="text-rhozly-primary shrink-0 mt-0.5" />
          <div className="flex-1 text-xs font-bold text-rhozly-on-surface/60 leading-snug">
            <span className="font-black text-rhozly-on-surface/80">
              Favourites follow you, not the home.
            </span>{" "}
            Heart a packet to remember the variety for next season, in any home.
            Use <span className="font-black">Add to this home</span> to recreate
            it in the garden you're in right now.
          </div>
          <button
            data-testid="nursery-favourites-hint-dismiss"
            onClick={dismissHint}
            className="text-rhozly-on-surface/30 hover:text-rhozly-on-surface/60 transition-colors shrink-0 mt-0.5"
            aria-label="Dismiss favourites hint"
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
        <div className="min-h-[300px] flex items-center justify-center py-8">
          <EmptyState
            size="lg"
            chrome="none"
            icon={<Heart size={32} />}
            title={searchQuery ? "No matching favourites" : "No favourite seeds yet"}
            body={
              searchQuery
                ? "Try a different search term."
                : "Heart a packet to remember the variety for next season, in any home."
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((fav) => {
            const title =
              [fav.variety?.trim(), fav.plant_common_name?.trim()]
                .filter(Boolean)
                .join(" · ") ||
              fav.plant_common_name ||
              fav.variety ||
              "Untitled packet";
            const image = fav.copied_image_url ?? "";
            const inHome = isFavouritePacketInHome(fav, homeEntries);
            const busy = busyFavId === fav.id;
            const savedFrom = fav.favourited_from_home?.name ?? null;
            const savedDate = new Date(fav.created_at).toLocaleDateString();
            const sowBy = (fav.snapshot?.sow_by as string | null) ?? null;

            return (
              <div
                key={fav.id}
                data-testid={`favourite-packet-card-${fav.id}`}
                className="relative bg-rhozly-surface-lowest rounded-3xl overflow-hidden border-2 border-rhozly-outline/20 shadow-sm flex flex-col"
              >
                <div className="h-32 relative overflow-hidden bg-rhozly-surface-low flex items-center justify-center">
                  {image ? (
                    <img
                      src={image}
                      alt={title}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-rhozly-on-surface/15">
                      <Package size={56} />
                    </span>
                  )}
                </div>
                <div className="p-5 flex-1 flex flex-col">
                  <h3 className="text-base font-black text-rhozly-on-surface leading-tight mb-0.5">
                    {title}
                  </h3>
                  {fav.vendor && (
                    <p className="text-xs font-bold text-rhozly-on-surface/40 truncate">
                      {fav.vendor}
                    </p>
                  )}
                  <p className="text-[10px] font-bold text-rhozly-on-surface/40 mt-1.5 flex items-center gap-1">
                    {savedFrom ? `Saved from ${savedFrom} · ` : ""}Saved {savedDate}
                  </p>
                  {sowBy && (
                    <p className="text-[10px] font-bold text-rhozly-on-surface/50 mt-1 flex items-center gap-1">
                      <Calendar size={10} /> Sow by{" "}
                      {new Date(sowBy).toLocaleDateString(undefined, {
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                  )}
                  <p
                    data-testid={`favourite-packet-tombstone-${fav.id}`}
                    className="mt-2 text-[10px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1 self-start"
                  >
                    Saved variety
                  </p>
                  <div className="mt-auto pt-4 flex items-center gap-2">
                    {inHome ? (
                      <span
                        data-testid={`favourite-packet-in-home-${fav.id}`}
                        className="flex-1 h-10 px-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-widest"
                      >
                        <HomeIcon size={13} /> In this home
                      </span>
                    ) : (
                      <button
                        data-testid={`favourite-packet-add-to-home-${fav.id}`}
                        onClick={() => handleAddToHome(fav)}
                        disabled={busy}
                        title="Recreate this packet in your current home"
                        className="flex-1 h-10 px-3 rounded-2xl flex items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-widest transition-all bg-rhozly-primary/10 text-rhozly-primary hover:bg-rhozly-primary hover:text-white"
                      >
                        {busy ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <Plus size={13} />
                        )}
                        Add to this home
                      </button>
                    )}
                    <button
                      data-testid={`favourite-packet-remove-${fav.id}`}
                      onClick={() => handleRemove(fav)}
                      disabled={busy}
                      aria-label={`Remove ${title} from favourites`}
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
