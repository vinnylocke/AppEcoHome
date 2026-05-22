import React, { useEffect, useMemo, useState } from "react";
import { Package, Loader2, ChevronDown, X } from "lucide-react";
import {
  fetchNurseryPackets,
  type NurseryListEntry,
} from "../../services/nurseryService";
import { Logger } from "../../lib/errorHandler";

interface Props {
  homeId: string;
  /**
   * When set, the picker only shows packets linked to this catalogue plant id.
   * Useful when surface already has a chosen plant (PlantEditModal Care Guide tab).
   */
  filterPlantId?: number | null;
  /** Fires when the user picks a packet. Pass null when they clear the choice. */
  onPick: (entry: NurseryListEntry | null) => void;
  /** Currently picked packet id (controlled). */
  pickedPacketId?: string | null;
  /** Optional label override — default "From your Nursery". */
  label?: string;
  /** Optional help text shown under the picker. */
  hint?: string;
}

/**
 * A slim packet selector reusable across the task modals and the Plant
 * Edit Modal Care Guide tab. Lazy-loads the home's active packets and
 * renders a single dropdown of "{variety or plant} · {vendor or "—"}".
 */
export default function NurseryPacketPicker({
  homeId,
  filterPlantId = null,
  onPick,
  pickedPacketId = null,
  label = "From your Nursery",
  hint,
}: Props) {
  const [entries, setEntries] = useState<NurseryListEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchNurseryPackets(homeId)
      .then((list) => {
        if (cancelled) return;
        setEntries(list);
      })
      .catch((err) => {
        Logger.error("NurseryPacketPicker load failed", err, { homeId });
        if (!cancelled) setEntries([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [homeId]);

  const filtered = useMemo(() => {
    if (filterPlantId == null) return entries;
    return entries.filter((e) => e.packet.plant_id === filterPlantId);
  }, [entries, filterPlantId]);

  const pickedEntry = filtered.find((e) => e.packet.id === pickedPacketId) ?? null;

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-rhozly-on-surface/55 px-1 py-2">
        <Loader2 size={12} className="animate-spin" />
        Loading your Nursery…
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div
        data-testid="nursery-packet-picker-empty"
        className="rounded-2xl bg-rhozly-surface-low/60 border border-dashed border-rhozly-outline/15 px-3 py-2.5 text-[11px] font-bold text-rhozly-on-surface/55 leading-snug"
      >
        {filterPlantId != null
          ? "No packets in your Nursery for this plant yet."
          : "No packets in your Nursery yet. Add some from The Shed → Nursery."}
      </div>
    );
  }

  return (
    <div data-testid="nursery-packet-picker" className="space-y-1.5">
      <label className="block text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/55">
        {label} <span className="text-rhozly-on-surface/30 normal-case font-bold">(optional)</span>
      </label>
      <div className="relative">
        <Package
          size={13}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-rhozly-on-surface/40 pointer-events-none"
        />
        <select
          value={pickedPacketId ?? ""}
          onChange={(e) => {
            const id = e.target.value;
            if (!id) {
              onPick(null);
              return;
            }
            const match = filtered.find((entry) => entry.packet.id === id);
            onPick(match ?? null);
          }}
          data-testid="nursery-packet-picker-select"
          className="w-full appearance-none pl-9 pr-9 py-2.5 min-h-[44px] rounded-2xl bg-white border border-rhozly-outline/20 text-sm font-bold text-rhozly-on-surface focus:outline-none focus:border-rhozly-primary/40 focus:ring-2 focus:ring-rhozly-primary/15"
        >
          <option value="">No packet — log this manually</option>
          {filtered.map((entry) => {
            const label = labelForEntry(entry);
            return (
              <option key={entry.packet.id} value={entry.packet.id}>
                {label}
              </option>
            );
          })}
        </select>
        {pickedEntry ? (
          <button
            type="button"
            onClick={() => onPick(null)}
            aria-label="Clear packet selection"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-rhozly-on-surface/40 hover:text-rhozly-on-surface w-7 h-7 flex items-center justify-center"
          >
            <X size={13} />
          </button>
        ) : (
          <ChevronDown
            size={13}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-rhozly-on-surface/40 pointer-events-none"
          />
        )}
      </div>
      {hint && (
        <p className="text-[11px] text-rhozly-on-surface/50 leading-snug">{hint}</p>
      )}
    </div>
  );
}

function labelForEntry(entry: NurseryListEntry): string {
  const variety = entry.packet.variety?.trim();
  const common = entry.plant?.common_name?.trim();
  const base = variety && common
    ? `${variety} · ${common}`
    : variety || common || "Untitled packet";
  const vendor = entry.packet.vendor?.trim();
  return vendor ? `${base} · ${vendor}` : base;
}
