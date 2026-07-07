import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  X, Package, Sprout, CheckCircle2, Calendar, Plus, Loader2, Archive,
  AlertCircle, Trash2, Eye, ArrowUpRight, Pencil, Link2,
} from "lucide-react";
import toast from "react-hot-toast";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { useCachedShed } from "../../hooks/useCachedShed";
import {
  fetchSowingsForPacket,
  archiveSeedPacket,
  unarchiveSeedPacket,
  discardSowing,
  type SeedSowing,
  type SeedPacket,
  type SeedPacketWithGermination,
  type PacketPlantSummary,
} from "../../services/nurseryService";
import { Logger } from "../../lib/errorHandler";
import { logEvent, EVENT } from "../../events/registry";
import LogSowingModal from "./LogSowingModal";
import ObserveGerminationModal from "./ObserveGerminationModal";
import PlantOutSowingModal from "./PlantOutSowingModal";
import EditSeedPacketModal from "./EditSeedPacketModal";
import SowingCalendarTab from "./SowingCalendarTab";

interface Props {
  homeId: string;
  packet: SeedPacketWithGermination;
  plant: PacketPlantSummary | null;
  /** Gates the AI provider tab inside the provider-search path of the editor. */
  aiEnabled?: boolean;
  /** Gates the entire provider-search path (locked until Botanist+). */
  perenualEnabled?: boolean;
  onClose: () => void;
  /** Called whenever the packet's sowings or archive flag changed. The
   *  parent NurseryTab uses it to refetch the list. */
  onChanged?: () => void;
}

const STATUS_LABEL: Record<SeedSowing["status"], string> = {
  sown: "Awaiting germination",
  germinated: "Ready to plant out",
  planted_out: "Planted out",
  discarded: "Discarded",
};

const STATUS_TONE: Record<SeedSowing["status"], string> = {
  sown: "bg-sky-50 text-sky-700 border-sky-100",
  germinated: "bg-emerald-50 text-emerald-700 border-emerald-100",
  planted_out: "bg-rhozly-primary/10 text-rhozly-primary border-rhozly-primary/20",
  discarded: "bg-rhozly-surface-low text-rhozly-on-surface/55 border-rhozly-outline/20",
};

const STATUS_ICON: Record<SeedSowing["status"], typeof Sprout> = {
  sown: Sprout,
  germinated: CheckCircle2,
  planted_out: ArrowUpRight,
  discarded: Trash2,
};

/**
 * Hub view for a single packet. Shows packet metadata + the full
 * sowings list with per-row actions (Observe / Discard / Plant out).
 * Plant Out is live: it promotes a germinated sowing into an area,
 * and is disabled with a guidance tooltip until the packet is linked
 * to a Shed plant.
 */
export default function SeedPacketDetailModal({
  homeId,
  packet,
  plant,
  aiEnabled = false,
  perenualEnabled = false,
  onClose,
  onChanged,
}: Props) {
  const trapRef = useFocusTrap<HTMLDivElement>(true);
  const [sowings, setSowings] = useState<SeedSowing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);

  const [showLogSowing, setShowLogSowing] = useState(false);
  const [observingSowing, setObservingSowing] = useState<SeedSowing | null>(null);
  const [plantingOutSowing, setPlantingOutSowing] = useState<SeedSowing | null>(null);
  /** When non-null, the Edit modal is open. The value's `focusLink` is
   *  true when the user tapped a "Link plant to plant out" CTA so the
   *  modal opens with the Shed search already expanded. */
  const [editing, setEditing] = useState<{ focusLink: boolean } | null>(null);
  /** Local copy of the packet so edits reflect immediately without a
   *  parent refetch. Falls back to the prop on first render. */
  const [localPacket, setLocalPacket] = useState<SeedPacketWithGermination>(packet);
  const [localPlant, setLocalPlant] = useState<PacketPlantSummary | null>(plant);
  /** Sowings | Calendar tab. Defaults to Sowings — the user's primary
   *  reason for opening the packet is usually to log or observe. */
  const [activeTab, setActiveTab] = useState<"sowings" | "calendar">("sowings");

  const { plants: shedPlants } = useCachedShed(homeId);

  const headline = localPacket.variety?.trim()
    ? `${localPacket.variety.trim()}${localPlant?.common_name ? ` · ${localPlant.common_name}` : ""}`
    : localPlant?.common_name ?? "Untitled packet";

  const loadSowings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchSowingsForPacket(packet.id);
      setSowings(rows);
    } catch (err) {
      Logger.error("SeedPacketDetailModal sowings fetch failed", err, { packetId: packet.id });
      setError(err instanceof Error ? err.message : "Couldn't load sowings.");
    } finally {
      setLoading(false);
    }
  }, [packet.id]);

  useEffect(() => {
    loadSowings();
  }, [loadSowings]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = "unset"; };
  }, []);

  const handleArchiveToggle = async () => {
    setArchiving(true);
    try {
      if (packet.is_archived) {
        await unarchiveSeedPacket(packet.id);
        toast.success("Packet restored.");
      } else {
        await archiveSeedPacket(packet.id);
        logEvent(EVENT.NURSERY_PACKET_ARCHIVED, { packet_id: packet.id });
        toast.success("Packet archived.");
      }
      onChanged?.();
      onClose();
    } catch (err) {
      Logger.error("SeedPacketDetailModal archive failed", err, { packetId: packet.id });
      toast.error("Couldn't archive the packet — try again.");
    } finally {
      setArchiving(false);
    }
  };

  const handleDiscardSowing = async (sowing: SeedSowing) => {
    if (!confirm(`Discard this sowing of ${sowing.sown_count} seeds? This can't be undone.`)) {
      return;
    }
    try {
      await discardSowing(sowing.id);
      logEvent(EVENT.NURSERY_SOWING_DISCARDED, {
        sowing_id: sowing.id,
        from_status: sowing.status,
      });
      toast.success("Sowing discarded.");
      await loadSowings();
      onChanged?.();
    } catch (err) {
      Logger.error("Discard sowing failed", err, { sowingId: sowing.id });
      toast.error("Couldn't discard — try again.");
    }
  };

  return createPortal(
    <div
      data-testid="seed-packet-detail-modal"
      className="fixed inset-0 z-[100] flex items-end sm:items-center sm:justify-center bg-black/40 backdrop-blur-sm animate-in fade-in"
      onClick={onClose}
    >
      <div
        ref={trapRef}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full sm:max-w-xl bg-rhozly-bg rounded-t-3xl sm:rounded-3xl shadow-2xl border border-rhozly-outline/15 flex flex-col max-h-[92vh] overflow-hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <header className="shrink-0 px-5 pt-4 pb-3 flex items-start gap-3 border-b border-rhozly-outline/10">
          <span className="shrink-0 w-11 h-11 rounded-2xl bg-rhozly-primary/10 text-rhozly-primary flex items-center justify-center">
            <Package size={18} />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-primary mb-0.5">
              Packet detail
            </p>
            <h2
              data-testid="packet-detail-title"
              className="font-display font-black text-rhozly-on-surface text-lg leading-tight truncate"
            >
              {headline}
            </h2>
            {localPlant?.scientific_name && (
              <p className="text-[11px] text-rhozly-on-surface/55 italic truncate">
                {localPlant.scientific_name}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-10 h-10 rounded-2xl bg-white border border-rhozly-outline/15 text-rhozly-on-surface/60 hover:text-rhozly-primary flex items-center justify-center"
          >
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Scanned packet photo — only shown when the packet was added
              via the Scan-a-packet flow. Helps the user identify the
              packet visually (especially useful for multi-variety
              collections where the variety field is identical). */}
          {localPacket.image_url && (
            <div
              data-testid="packet-detail-image"
              className="rounded-2xl overflow-hidden bg-rhozly-surface-low border border-rhozly-outline/15 aspect-[4/3]"
            >
              <img
                src={localPacket.image_url}
                alt={`Scan of ${headline}`}
                loading="lazy"
                className="w-full h-full object-cover"
              />
            </div>
          )}
          {/* Packet meta strip */}
          <PacketMetaStrip packet={localPacket} plant={localPlant} />

          {/* Tab strip — Sowings | Calendar */}
          <div className="p-1 bg-rhozly-surface-low rounded-2xl flex" role="tablist" aria-label="Packet sections">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "sowings"}
              onClick={() => setActiveTab("sowings")}
              data-testid="packet-tab-sowings"
              className={`flex-1 py-2.5 rounded-xl font-black text-xs transition-all ${
                activeTab === "sowings"
                  ? "bg-white text-rhozly-primary shadow-sm"
                  : "text-rhozly-on-surface/40 hover:text-rhozly-on-surface"
              }`}
            >
              Sowings
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "calendar"}
              onClick={() => setActiveTab("calendar")}
              data-testid="packet-tab-calendar"
              className={`flex-1 py-2.5 rounded-xl font-black text-xs transition-all ${
                activeTab === "calendar"
                  ? "bg-white text-rhozly-primary shadow-sm"
                  : "text-rhozly-on-surface/40 hover:text-rhozly-on-surface"
              }`}
            >
              Calendar
            </button>
          </div>

          {activeTab === "calendar" ? (
            <SowingCalendarTab
              homeId={homeId}
              packet={{
                id: localPacket.id,
                plant_id: localPacket.plant_id ?? null,
                plant_name: localPlant?.common_name ?? null,
                variety: localPacket.variety ?? null,
              }}
              aiEnabled={aiEnabled}
              onRequestLinkPlant={() => setEditing({ focusLink: true })}
            />
          ) : (
          /* Sowings */
          <div>
            <div className="flex items-center justify-between mb-2 px-0.5">
              <h3 className="font-display font-black text-rhozly-on-surface text-sm">
                Sowings
              </h3>
              <button
                type="button"
                data-testid="packet-detail-log-sowing"
                onClick={() => setShowLogSowing(true)}
                disabled={localPacket.plant_id == null && !localPacket.variety}
                title={
                  localPacket.plant_id == null && !localPacket.variety
                    ? "Link this packet to a plant or add a variety name before logging a sowing"
                    : "Log a new sowing"
                }
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-rhozly-primary text-white text-[10px] font-black uppercase tracking-widest hover:opacity-95 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Plus size={11} />
                Log sowing
              </button>
            </div>

            {loading && (
              <div className="flex items-center gap-2 text-xs text-rhozly-on-surface/55 px-1 py-3">
                <Loader2 size={13} className="animate-spin" />
                Loading sowings…
              </div>
            )}

            {!loading && error && (
              <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                <AlertCircle size={13} className="shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {!loading && !error && sowings.length === 0 && (
              <div className="rounded-2xl border border-dashed border-rhozly-outline/20 px-4 py-6 text-center">
                <p className="text-sm font-bold text-rhozly-on-surface/75 mb-1">
                  No sowings logged yet.
                </p>
                <p className="text-[11px] text-rhozly-on-surface/55 max-w-xs mx-auto leading-snug">
                  Once you put some seeds in soil, tap{" "}
                  <span className="font-black text-rhozly-on-surface/80">Log sowing</span> so we
                  can track germination and viability over time.
                </p>
              </div>
            )}

            {!loading && !error && sowings.length > 0 && (
              <ul className="flex flex-col gap-2" data-testid="packet-detail-sowings">
                {sowings.map((sowing) => (
                  <SowingRow
                    key={sowing.id}
                    sowing={sowing}
                    canPlantOut={localPacket.plant_id != null}
                    onObserve={() => setObservingSowing(sowing)}
                    onPlantOut={() => setPlantingOutSowing(sowing)}
                    onLinkPlant={() => setEditing({ focusLink: true })}
                    onDiscard={() => handleDiscardSowing(sowing)}
                  />
                ))}
              </ul>
            )}
          </div>
          )}
        </div>

        <footer className="shrink-0 px-5 py-3 border-t border-rhozly-outline/10 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              data-testid="packet-detail-edit"
              onClick={() => setEditing({ focusLink: false })}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-xl bg-rhozly-primary/10 text-rhozly-primary border border-rhozly-primary/30 text-[10px] font-black uppercase tracking-widest hover:bg-rhozly-primary/15 hover:border-rhozly-primary/50 transition-colors"
            >
              <Pencil size={12} />
              Edit
            </button>
            <button
              type="button"
              data-testid="packet-detail-archive"
              onClick={handleArchiveToggle}
              disabled={archiving}
              className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl text-rhozly-on-surface/65 hover:text-rhozly-on-surface text-[10px] font-black uppercase tracking-widest border border-rhozly-outline/15 hover:border-rhozly-outline/30 disabled:opacity-50"
            >
              {archiving ? <Loader2 size={12} className="animate-spin" /> : <Archive size={12} />}
              {localPacket.is_archived ? "Restore" : "Archive"}
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 min-h-[40px] rounded-xl bg-rhozly-primary text-white text-[10px] font-black uppercase tracking-widest hover:opacity-95"
          >
            Done
          </button>
        </footer>
      </div>

      {showLogSowing && (
        <LogSowingModal
          homeId={homeId}
          packetId={packet.id}
          packetLabel={headline}
          onClose={() => setShowLogSowing(false)}
          onLogged={() => {
            loadSowings();
            onChanged?.();
          }}
        />
      )}
      {observingSowing && (
        <ObserveGerminationModal
          sowing={observingSowing}
          packetLabel={headline}
          onClose={() => setObservingSowing(null)}
          onSaved={() => {
            loadSowings();
            onChanged?.();
          }}
        />
      )}
      {plantingOutSowing && localPacket.plant_id != null && (
        <PlantOutSowingModal
          homeId={homeId}
          sowing={plantingOutSowing}
          plantId={localPacket.plant_id}
          packetLabel={headline}
          onClose={() => setPlantingOutSowing(null)}
          onPlantedOut={() => {
            loadSowings();
            onChanged?.();
          }}
        />
      )}
      {editing && (
        <EditSeedPacketModal
          homeId={homeId}
          packet={localPacket}
          plant={localPlant}
          aiEnabled={aiEnabled}
          perenualEnabled={perenualEnabled}
          focusLink={editing.focusLink}
          hasActiveSowings={sowings.some(
            (s) => s.status === "sown" || s.status === "germinated",
          )}
          onClose={() => setEditing(null)}
          onSaved={(next: SeedPacket) => {
            // Merge the updated columns back into our view-shaped packet
            // copy so the header / meta strip / Plant Out gating refresh
            // immediately, then re-hydrate the linked plant from the
            // cached Shed list when plant_id changed.
            setLocalPacket((prev) => ({ ...prev, ...next }));
            if (next.plant_id == null) {
              setLocalPlant(null);
            } else if (next.plant_id !== localPacket.plant_id) {
              const match = (shedPlants ?? []).find(
                (p: any) => p.id === next.plant_id,
              );
              setLocalPlant(
                match
                  ? {
                      id: match.id,
                      common_name: match.common_name ?? null,
                      scientific_name: Array.isArray(match.scientific_name)
                        ? match.scientific_name[0] ?? null
                        : (match.scientific_name as string | null) ?? null,
                    }
                  : null,
              );
            }
            // Bubble up so the Nursery list refetches too.
            onChanged?.();
          }}
        />
      )}
    </div>,
    document.body,
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function PacketMetaStrip({
  packet,
  plant,
}: {
  packet: SeedPacketWithGermination;
  plant: PacketPlantSummary | null;
}) {
  const cells: { label: string; value: string }[] = [];
  if (packet.vendor) cells.push({ label: "Vendor", value: packet.vendor });
  if (packet.purchased_on)
    cells.push({ label: "Purchased", value: formatShortDate(packet.purchased_on) });
  if (packet.opened_on)
    cells.push({ label: "Opened", value: formatShortDate(packet.opened_on) });
  if (packet.sow_by)
    cells.push({ label: "Sow by", value: formatShortDate(packet.sow_by) });
  if (packet.quantity_remaining)
    cells.push({ label: "Quantity", value: packet.quantity_remaining });

  if (cells.length === 0 && !packet.notes && !plant) return null;

  return (
    <div className="rounded-2xl bg-white border border-rhozly-outline/15 p-3 space-y-3">
      {cells.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {cells.map((cell, i) => (
            <div
              key={i}
              className="rounded-xl bg-rhozly-surface-low/60 border border-rhozly-outline/10 px-3 py-2"
            >
              <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/50">
                {cell.label}
              </p>
              <p className="text-sm font-bold text-rhozly-on-surface mt-0.5">
                {cell.value}
              </p>
            </div>
          ))}
        </div>
      )}
      {packet.notes && (
        <p className="text-xs text-rhozly-on-surface/70 italic px-1 leading-snug whitespace-pre-line">
          {packet.notes}
        </p>
      )}
    </div>
  );
}

function SowingRow({
  sowing,
  canPlantOut,
  onObserve,
  onPlantOut,
  onLinkPlant,
  onDiscard,
}: {
  sowing: SeedSowing;
  canPlantOut: boolean;
  onObserve: () => void;
  onPlantOut: () => void;
  onLinkPlant: () => void;
  onDiscard: () => void;
}) {
  const Icon = STATUS_ICON[sowing.status];

  const ratePct =
    sowing.germinated_count != null
      ? Math.round((sowing.germinated_count / sowing.sown_count) * 100)
      : null;

  return (
    <li
      data-testid={`sowing-row-${sowing.id}`}
      className="rounded-2xl bg-white border border-rhozly-outline/15 p-3 flex flex-col gap-2"
    >
      <div className="flex items-start gap-2.5">
        <span
          className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center border ${STATUS_TONE[sowing.status]}`}
        >
          <Icon size={15} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-rhozly-on-surface leading-tight">
            {sowing.sown_count} seeds sown
            {ratePct != null && (
              <span className="text-rhozly-on-surface/55 font-bold">
                {" "}· {sowing.germinated_count}/{sowing.sown_count} sprouted ({ratePct}%)
              </span>
            )}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${STATUS_TONE[sowing.status]}`}
            >
              {STATUS_LABEL[sowing.status]}
            </span>
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rhozly-on-surface/55">
              <Calendar size={10} />
              Sown {formatShortDate(sowing.sown_on)}
            </span>
            {sowing.observed_on && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rhozly-on-surface/55">
                <Eye size={10} />
                Observed {formatShortDate(sowing.observed_on)}
              </span>
            )}
            {sowing.planted_out_at && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rhozly-primary">
                <ArrowUpRight size={10} />
                Planted out {formatShortDate(sowing.planted_out_at)}
              </span>
            )}
          </div>
          {sowing.notes && (
            <p className="mt-1 text-[11px] text-rhozly-on-surface/65 italic leading-snug whitespace-pre-line">
              {sowing.notes}
            </p>
          )}
        </div>
      </div>

      {/* Action bar — only when sowing is still active */}
      {(sowing.status === "sown" || sowing.status === "germinated") && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-rhozly-outline/10">
          <button
            type="button"
            data-testid={`sowing-${sowing.id}-observe`}
            onClick={onObserve}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rhozly-primary/10 text-rhozly-primary text-[10px] font-black uppercase tracking-widest hover:bg-rhozly-primary/15"
          >
            <Eye size={11} />
            {sowing.status === "sown" ? "Observe" : "Re-observe"}
          </button>
          {sowing.status === "germinated" && canPlantOut && (
            <button
              type="button"
              data-testid={`sowing-${sowing.id}-plant-out`}
              onClick={onPlantOut}
              title="Plant these seedlings into an area"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase tracking-widest hover:bg-emerald-100 transition-colors"
            >
              <ArrowUpRight size={11} />
              Plant out
            </button>
          )}
          {sowing.status === "germinated" && !canPlantOut && (
            <button
              type="button"
              data-testid={`sowing-${sowing.id}-link-plant`}
              onClick={onLinkPlant}
              title="Link this packet to a Shed plant first"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-100 text-amber-800 text-[10px] font-black uppercase tracking-widest hover:bg-amber-200 transition-colors"
            >
              <Link2 size={11} />
              Link plant to plant out
            </button>
          )}
          <button
            type="button"
            data-testid={`sowing-${sowing.id}-discard`}
            onClick={onDiscard}
            className="ml-auto inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-rhozly-on-surface/55 hover:text-red-600 text-[10px] font-black uppercase tracking-widest"
          >
            <Trash2 size={11} />
            Discard
          </button>
        </div>
      )}
    </li>
  );
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
