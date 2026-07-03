import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Sprout, Calendar, Package, AlertCircle, Loader2, Plus, Sun, Cloud,
  CheckCircle2, Inbox, ClipboardPaste, Camera, Heart, Loader,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { supabase } from "../../lib/supabase";
import { Logger } from "../../lib/errorHandler";
import {
  fetchNurseryPackets,
  type NurseryListEntry,
} from "../../services/nurseryService";
import {
  listFavouriteSeedPackets,
  favouriteSeedPacket,
  unfavouriteSeedPacket,
} from "../../services/favouritesService";
import { packetIdentityKey } from "../../lib/favouriteIdentity";
import { logEvent, EVENT } from "../../events/registry";
import type { FavouriteSeedPacket } from "../../types";
import AddSeedPacketModal from "./AddSeedPacketModal";
import SeedPacketDetailModal from "./SeedPacketDetailModal";
import BulkPasteSeedPacketsModal from "./BulkPasteSeedPacketsModal";
import ScanSeedPacketModal from "./ScanSeedPacketModal";
import FavouriteSeedPacketsGrid from "../favourites/FavouriteSeedPacketsGrid";
import { recordSignal } from "../../onboarding/signals";
import FeatureGate from "../shared/FeatureGate";

interface Props {
  homeId: string;
  aiEnabled?: boolean;
  /** Gates the inline "Search the plant database" path inside the packet
   *  editor (forwarded through to `PlantSearchModal`). */
  perenualEnabled?: boolean;
}

/**
 * Wave-1 surface for The Nursery — a read-only packet list inside The
 * Shed (mounted when the user flips the Plants / Nursery toggle).
 *
 * The Add / Log Sowing / Observe / Plant Out modals land in later waves.
 * For now the tab paints whatever's in `seed_packets_with_germination`,
 * shows a friendly empty state when the user hasn't added a packet yet,
 * and exposes an "Add packets" button that opens a placeholder toast
 * (Wave 2 will wire the real modal).
 */
export default function NurseryTab(props: React.ComponentProps<typeof NurseryTabInner>) {
  return (
    <FeatureGate feature="nursery">
      <NurseryTabInner {...props} />
    </FeatureGate>
  );
}

function NurseryTabInner({
  homeId,
  aiEnabled = false,
  perenualEnabled = false,
}: Props) {
  const [entries, setEntries] = useState<NurseryListEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showBulkPasteModal, setShowBulkPasteModal] = useState(false);
  const [showScanModal, setShowScanModal] = useState(false);
  const [activeEntry, setActiveEntry] = useState<NurseryListEntry | null>(null);

  // ── Cross-home favourites (Phase 3 — seed packets) ─────────────────────────
  // Scope pill: "Home" = today's home-scoped nursery; "Favourites" = the user's
  // cross-home list. Component STATE (no URL param — the Nursery toggle has none
  // today, so favourites scope stays symmetric with it). See
  // docs/plans/cross-home-favourites.md.
  const [scope, setScope] = useState<"home" | "favourites">("home");
  const [favourites, setFavourites] = useState<FavouriteSeedPacket[]>([]);
  const [favouritesLoading, setFavouritesLoading] = useState(true);
  const [homeName, setHomeName] = useState<string | null>(null);
  const [togglingKey, setTogglingKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await fetchNurseryPackets(homeId);
      setEntries(list);
    } catch (err: unknown) {
      Logger.error("NurseryTab fetch failed", err, { homeId });
      setError(err instanceof Error ? err.message : "Couldn't load your nursery.");
    } finally {
      setLoading(false);
    }
  }, [homeId]);

  const loadFavourites = useCallback(async () => {
    try {
      const rows = await listFavouriteSeedPackets();
      setFavourites(rows);
    } catch (err) {
      Logger.warn("Could not load favourite seed packets", { err });
    } finally {
      setFavouritesLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadFavourites();
  }, [loadFavourites]);

  useEffect(() => {
    if (!homeId) return;
    supabase
      .from("homes")
      .select("name")
      .eq("id", homeId)
      .maybeSingle()
      .then(({ data }) => setHomeName(data?.name ?? null));
  }, [homeId]);

  /** Identity keys of the user's favourite packets — drives heart fill. */
  const favouriteKeys = useMemo(
    () => new Set(favourites.map((f) => f.identity_key)),
    [favourites],
  );

  const handleToggleFavourite = useCallback(
    async (entry: NurseryListEntry) => {
      const key = packetIdentityKey(
        entry.packet.variety,
        entry.plant?.common_name ?? null,
      );
      if (togglingKey === key) return;
      setTogglingKey(key);
      const isFavourited = favouriteKeys.has(key);
      try {
        if (isFavourited) {
          setFavourites((prev) => prev.filter((f) => f.identity_key !== key));
          const existing = favourites.find((f) => f.identity_key === key);
          if (existing) await unfavouriteSeedPacket(existing.id);
          logEvent(EVENT.SEED_PACKET_UNFAVOURITED, { identity_key: key });
          toast.success("Removed from favourites.");
        } else {
          const row = await favouriteSeedPacket(
            {
              id: entry.packet.id,
              home_id: entry.packet.home_id,
              plant_id: entry.packet.plant_id,
              variety: entry.packet.variety,
              vendor: entry.packet.vendor,
              image_url: entry.packet.image_url,
              plant_common_name: entry.plant?.common_name ?? null,
              sow_by: entry.packet.sow_by,
              notes: entry.packet.notes,
              quantity_remaining: entry.packet.quantity_remaining,
              purchased_on: entry.packet.purchased_on,
              opened_on: entry.packet.opened_on,
            },
            homeId,
          );
          setFavourites((prev) => [row, ...prev.filter((f) => f.id !== row.id)]);
          logEvent(EVENT.SEED_PACKET_FAVOURITED, { identity_key: key });
          toast.success("Saved to your favourites — it follows you across homes.");
        }
        loadFavourites();
      } catch (err: any) {
        loadFavourites(); // roll back optimistic state
        Logger.error(
          "Favourite packet toggle failed",
          err,
          { packetId: entry.packet.id },
          "Could not update favourites — please try again.",
        );
      } finally {
        setTogglingKey(null);
      }
    },
    [favourites, favouriteKeys, togglingKey, homeId, loadFavourites],
  );

  const scopePills = (
    <div
      data-testid="nursery-scope-toggle"
      className="bg-rhozly-surface-low p-1.5 rounded-2xl flex gap-1 border border-rhozly-outline/10 self-start w-fit"
    >
      {(["home", "favourites"] as const).map((s) => (
        <button
          key={s}
          type="button"
          data-testid={`nursery-scope-${s}`}
          onClick={() => setScope(s)}
          className={`flex items-center gap-1.5 px-5 py-2 min-h-[40px] rounded-xl text-sm font-black transition-all ${
            scope === s
              ? "bg-white text-rhozly-primary shadow-sm"
              : "text-rhozly-on-surface/40 hover:text-rhozly-on-surface"
          }`}
        >
          {s === "favourites" && (
            <Heart size={13} className={scope === "favourites" ? "fill-current" : ""} />
          )}
          {s === "home" ? "Home" : "Favourites"}
          {s === "favourites" && favourites.length > 0 && (
            <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-rhozly-primary/10 text-rhozly-primary">
              {favourites.length}
            </span>
          )}
        </button>
      ))}
    </div>
  );

  // Wave 23.0001 — gate the nursery walkthrough (23.0003) so it only
  // fires after the tab has been opened.
  useEffect(() => { void recordSignal("first_nursery_open"); }, []);

  const summary = useMemo(() => {
    const activeSowings = entries.filter(
      (e) => e.packet.active_sowing_status != null,
    ).length;
    const approachingSowBy = entries.filter((e) => {
      const sb = e.packet.sow_by;
      if (!sb) return false;
      const days = (new Date(sb).getTime() - Date.now()) / 86_400_000;
      return days >= 0 && days <= 90;
    }).length;
    return { total: entries.length, activeSowings, approachingSowBy };
  }, [entries]);

  // Favourites scope renders regardless of the Home list's loading / empty /
  // error state (favourites are user-scoped, loaded independently). Placed after
  // all hooks so it never short-circuits a hook call (rules of hooks).
  if (scope === "favourites") {
    return (
      <div data-testid="nursery-tab" className="space-y-3">
        {scopePills}
        <FavouriteSeedPacketsGrid
          homeId={homeId}
          homeName={homeName}
          homeEntries={entries}
          favourites={favourites}
          loading={favouritesLoading}
          searchQuery=""
          onFavouritesChanged={loadFavourites}
          onHomePacketsChanged={() => {
            load();
            loadFavourites();
          }}
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {scopePills}
        <div
          data-testid="nursery-loading"
          className="flex items-center gap-2 px-2 py-10 text-sm text-rhozly-on-surface/55 justify-center"
        >
          <Loader2 size={16} className="animate-spin" />
          Loading your nursery…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3">
        {scopePills}
      <div
        data-testid="nursery-error"
        className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
      >
        <div className="flex items-start gap-2">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-bold">Couldn't load your nursery.</p>
            <p className="text-xs mt-1 text-red-700/80">{error}</p>
            <button
              type="button"
              onClick={load}
              className="mt-2 text-xs font-black uppercase tracking-widest text-red-700 hover:text-red-900"
            >
              Try again
            </button>
          </div>
        </div>
      </div>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <>
        <div className="mb-3">{scopePills}</div>
        <div
          data-testid="nursery-empty"
          className="rounded-3xl bg-white border border-rhozly-outline/15 p-8 text-center"
        >
          <div className="w-14 h-14 rounded-2xl bg-rhozly-primary/10 text-rhozly-primary inline-flex items-center justify-center mb-3">
            <Inbox size={22} />
          </div>
          <p className="font-display font-black text-rhozly-on-surface text-base mb-1">
            No seed packets yet
          </p>
          <p className="text-[12px] text-rhozly-on-surface/60 leading-snug max-w-sm mx-auto mb-4">
            Add packets you own here. We'll track sowings, germination rates,
            and nudge you when stock is getting old.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              data-testid="nursery-add-empty"
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] rounded-2xl bg-rhozly-primary text-white text-[11px] font-black uppercase tracking-widest hover:opacity-95 transition"
            >
              <Plus size={13} />
              Add a packet
            </button>
            {aiEnabled && (
              <button
                type="button"
                data-testid="nursery-scan-empty"
                onClick={() => setShowScanModal(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] rounded-2xl bg-white border border-rhozly-outline/20 text-rhozly-on-surface/75 text-[11px] font-black uppercase tracking-widest hover:border-rhozly-primary/30 transition"
              >
                <Camera size={13} />
                Scan a packet
              </button>
            )}
            <button
              type="button"
              data-testid="nursery-paste-empty"
              onClick={() => setShowBulkPasteModal(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] rounded-2xl bg-white border border-rhozly-outline/20 text-rhozly-on-surface/75 text-[11px] font-black uppercase tracking-widest hover:border-rhozly-primary/30 transition"
            >
              <ClipboardPaste size={13} />
              Paste a list
            </button>
          </div>
        </div>
        {showAddModal && (
          <AddSeedPacketModal
            homeId={homeId}
            onClose={() => setShowAddModal(false)}
            onCreated={() => load()}
          />
        )}
        {showBulkPasteModal && (
          <BulkPasteSeedPacketsModal
            homeId={homeId}
            aiEnabled={aiEnabled}
            onClose={() => setShowBulkPasteModal(false)}
            onCreated={() => load()}
          />
        )}
        {showScanModal && aiEnabled && (
          <ScanSeedPacketModal
            homeId={homeId}
            onClose={() => setShowScanModal(false)}
            onCreated={() => load()}
          />
        )}
      </>
    );
  }

  return (
    <div data-testid="nursery-tab" className="space-y-3">
      {scopePills}
      {/* Summary header — stacks on phone so the summary text reads in full;
          side-by-side on sm+ where there's room for both. */}
      <div className="flex flex-col items-stretch gap-2 px-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <p className="text-[11px] text-rhozly-on-surface/60">
          <span className="font-bold text-rhozly-on-surface">{summary.total}</span>
          {summary.total === 1 ? " packet" : " packets"}
          {summary.activeSowings > 0 && (
            <span className="text-rhozly-on-surface/45">
              {" "}· {summary.activeSowings} active sowing{summary.activeSowings === 1 ? "" : "s"}
            </span>
          )}
          {summary.approachingSowBy > 0 && (
            <span className="text-amber-700">
              {" "}· {summary.approachingSowBy} approaching sow-by
            </span>
          )}
        </p>
        <div className="flex items-center gap-1.5 shrink-0">
          {aiEnabled && (
            <button
              type="button"
              data-testid="nursery-scan-packets"
              onClick={() => setShowScanModal(true)}
              title="Scan a seed packet — Sage+ AI extracts the details"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-xl bg-white border border-rhozly-outline/20 text-rhozly-on-surface/70 text-[10px] font-black uppercase tracking-widest hover:border-rhozly-primary/30 transition"
            >
              <Camera size={12} />
              <span className="hidden sm:inline">Scan</span>
              <span className="sm:hidden">Scan</span>
            </button>
          )}
          <button
            type="button"
            data-testid="nursery-paste-packets"
            onClick={() => setShowBulkPasteModal(true)}
            title="Bulk add — paste a list of packets and we'll extract the details"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-xl bg-white border border-rhozly-outline/20 text-rhozly-on-surface/70 text-[10px] font-black uppercase tracking-widest hover:border-rhozly-primary/30 transition"
          >
            <ClipboardPaste size={12} />
            <span className="hidden sm:inline">Paste a list</span>
            <span className="sm:hidden">Paste</span>
          </button>
          <button
            type="button"
            data-testid="nursery-add-packets"
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-xl bg-rhozly-primary text-white text-[10px] font-black uppercase tracking-widest hover:opacity-95 transition"
          >
            <Plus size={12} />
            <span className="hidden sm:inline">Add packets</span>
            <span className="sm:hidden">Add</span>
          </button>
        </div>
      </div>

      {/* Packet list */}
      <ul data-testid="nursery-list" className="flex flex-col gap-2">
        {entries.map((entry) => {
          const key = packetIdentityKey(
            entry.packet.variety,
            entry.plant?.common_name ?? null,
          );
          return (
            <NurseryRow
              key={entry.packet.id}
              entry={entry}
              onOpen={() => setActiveEntry(entry)}
              isFavourited={favouriteKeys.has(key)}
              favouriteBusy={togglingKey === key}
              onToggleFavourite={() => handleToggleFavourite(entry)}
            />
          );
        })}
      </ul>

      {showAddModal && (
        <AddSeedPacketModal
          homeId={homeId}
          onClose={() => setShowAddModal(false)}
          onCreated={() => load()}
        />
      )}
      {showBulkPasteModal && (
        <BulkPasteSeedPacketsModal
          homeId={homeId}
          aiEnabled={aiEnabled}
          onClose={() => setShowBulkPasteModal(false)}
          onCreated={() => load()}
        />
      )}
      {showScanModal && aiEnabled && (
        <ScanSeedPacketModal
          homeId={homeId}
          onClose={() => setShowScanModal(false)}
          onCreated={() => load()}
        />
      )}
      {activeEntry && (
        <SeedPacketDetailModal
          homeId={homeId}
          packet={activeEntry.packet}
          plant={activeEntry.plant}
          aiEnabled={aiEnabled}
          perenualEnabled={perenualEnabled}
          onClose={() => setActiveEntry(null)}
          onChanged={() => load()}
        />
      )}
    </div>
  );
}

/**
 * One row in the Nursery list. Shows packet identity + status chips
 * (active sowing OR latest rate, sow-by, vendor). Tap → opens the
 * packet detail modal.
 */
function NurseryRow({
  entry,
  onOpen,
  isFavourited,
  favouriteBusy,
  onToggleFavourite,
}: {
  entry: NurseryListEntry;
  onOpen: () => void;
  isFavourited: boolean;
  favouriteBusy: boolean;
  onToggleFavourite: () => void;
}) {
  const { packet, plant } = entry;

  const title =
    [packet.variety?.trim(), plant?.common_name?.trim()].filter(Boolean).join(" · ") ||
    plant?.common_name ||
    packet.variety ||
    "Untitled packet";

  const sciName = plant?.scientific_name ?? null;

  // Status chip: active sowing > observed rate > sow-by countdown > nothing.
  let statusChip: { label: string; tone: string; Icon: typeof Sun } | null = null;
  if (packet.active_sowing_status === "sown") {
    statusChip = {
      label: `${packet.active_sowing_sown_count ?? "—"} sown · awaiting germination`,
      tone: "bg-sky-50 text-sky-700 border-sky-100",
      Icon: Sprout,
    };
  } else if (packet.active_sowing_status === "germinated") {
    statusChip = {
      label: `${packet.active_sowing_sown_count ?? "—"} sown · ready to plant out`,
      tone: "bg-emerald-50 text-emerald-700 border-emerald-100",
      Icon: CheckCircle2,
    };
  } else if (packet.latest_germination_rate_pct != null) {
    const rate = packet.latest_germination_rate_pct;
    const tone =
      rate >= 70
        ? "bg-emerald-50 text-emerald-700 border-emerald-100"
        : rate >= 40
          ? "bg-amber-50 text-amber-700 border-amber-100"
          : "bg-red-50 text-red-700 border-red-100";
    statusChip = {
      label: `Last sowing ${rate}%`,
      tone,
      Icon: rate >= 40 ? CheckCircle2 : AlertCircle,
    };
  }

  const sowByLabel = packet.sow_by ? formatSowBy(packet.sow_by) : null;

  return (
    <li className="relative">
    <button
      type="button"
      data-testid={`nursery-row-${packet.id}`}
      onClick={onOpen}
      className="w-full text-left rounded-2xl bg-white border border-rhozly-outline/15 hover:border-rhozly-primary/40 active:scale-[0.99] transition-all p-3 pr-14 flex items-start gap-3"
    >
      <div className="shrink-0 w-10 h-10 rounded-xl bg-rhozly-primary/10 text-rhozly-primary flex items-center justify-center">
        <Package size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-display font-black text-rhozly-on-surface text-sm leading-tight truncate">
          {title}
        </p>
        {sciName && (
          <p className="text-[10px] text-rhozly-on-surface/55 italic truncate">
            {sciName}
          </p>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {statusChip && (
            <span
              className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${statusChip.tone}`}
            >
              <statusChip.Icon size={10} />
              {statusChip.label}
            </span>
          )}
          {sowByLabel && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rhozly-on-surface/60">
              <Calendar size={10} />
              {sowByLabel}
            </span>
          )}
          {packet.vendor && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rhozly-on-surface/55">
              {packet.vendor}
            </span>
          )}
          {packet.quantity_remaining && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rhozly-on-surface/50">
              {packet.quantity_remaining}
            </span>
          )}
        </div>
      </div>
    </button>
    {/* Cross-home favourite heart — recorded per packet variety, follows the
        user across homes. Ungated (packets have no source). */}
    <button
      type="button"
      data-testid={`favourite-packet-${packet.id}`}
      onClick={(e) => { e.stopPropagation(); onToggleFavourite(); }}
      disabled={favouriteBusy}
      aria-pressed={isFavourited}
      aria-label={
        isFavourited
          ? `Remove ${title} from favourites`
          : `Save ${title} to favourites`
      }
      title={
        isFavourited
          ? "Remove from favourites"
          : "Save to favourites — follows you across homes"
      }
      className="absolute top-3 right-3 w-9 h-9 rounded-xl flex items-center justify-center transition-colors text-rhozly-on-surface/40 hover:bg-rose-50 hover:text-rose-600"
    >
      {favouriteBusy ? (
        <Loader size={16} className="animate-spin" />
      ) : (
        <Heart size={16} className={isFavourited ? "fill-current text-rose-500" : ""} />
      )}
    </button>
    </li>
  );
}

function formatSowBy(iso: string): string {
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return iso;
  const days = Math.round((target.getTime() - Date.now()) / 86_400_000);
  const label = target.toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
  });
  if (days < 0) return `Past sow-by · ${label}`;
  if (days <= 90) return `Sow-by ${label} · ${days}d left`;
  return `Sow-by ${label}`;
}
