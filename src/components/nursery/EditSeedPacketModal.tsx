import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  X, Sprout, Loader2, Search, Check, Link2, Unlink, AlertTriangle, Globe,
} from "lucide-react";
import toast from "react-hot-toast";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { useCachedShed } from "../../hooks/useCachedShed";
import {
  updateSeedPacket,
  type SeedPacket,
  type SeedPacketWithGermination,
  type PacketPlantSummary,
} from "../../services/nurseryService";
import { Logger } from "../../lib/errorHandler";
import { logEvent, EVENT } from "../../events/registry";
import { PACKET_FORM_INPUT_CX, PacketFieldRow } from "./_packetForm";
import PlantSearchModal from "../PlantSearchModal";

interface Props {
  homeId: string;
  packet: SeedPacketWithGermination;
  /** Currently-linked plant (the parent already fetched it for the detail modal). */
  plant: PacketPlantSummary | null;
  /** Gates the AI provider tab inside `PlantSearchModal`. */
  aiEnabled?: boolean;
  /** Gates the entire "Search the plant database" path. When false the
   *  CTA still renders so the user can see what they're missing, but
   *  tapping it surfaces `PlantSearchModal`'s tier-lock state. */
  perenualEnabled?: boolean;
  /** Optional — when true, scrolls the linked-plant section into view on mount. */
  focusLink?: boolean;
  /** Optional — packet has active (sown / germinated) sowings. Drives the
   *  inline warning when the user unlinks the catalogue plant. */
  hasActiveSowings?: boolean;
  onClose: () => void;
  /** Fires after a successful save so the parent can re-fetch + rerender. */
  onSaved?: (next: SeedPacket) => void;
}

interface ShedPlantOption {
  id: number;
  common_name: string;
  scientific_name: string | null;
}

interface FormState {
  variety: string;
  vendor: string;
  purchased_on: string;
  opened_on: string;
  sow_by: string;
  quantity_remaining: string;
  notes: string;
}

function toFormState(packet: SeedPacketWithGermination): FormState {
  return {
    variety: packet.variety ?? "",
    vendor: packet.vendor ?? "",
    purchased_on: packet.purchased_on ?? "",
    opened_on: packet.opened_on ?? "",
    sow_by: packet.sow_by ?? "",
    quantity_remaining: packet.quantity_remaining ?? "",
    notes: packet.notes ?? "",
  };
}

/**
 * Edit-in-place modal for a Nursery packet. Two stacked sections:
 *
 *   1. Linked plant — search the user's Shed, pick a plant, or unlink.
 *      Solves the "I added the packet before I had the plant in my
 *      Shed, now I can't plant out" problem.
 *   2. Packet details — variety, vendor, dates, qty, notes. All
 *      pre-filled from the current packet, all editable.
 *
 * Save computes a diff against the original and patches only changed
 * columns. `plant_id` flips between number | null. `onSaved` fires
 * with the freshly-updated packet so the parent can re-render the
 * detail modal without a refetch.
 */
export default function EditSeedPacketModal({
  homeId,
  packet,
  plant,
  aiEnabled = false,
  perenualEnabled = false,
  focusLink = false,
  hasActiveSowings = false,
  onClose,
  onSaved,
}: Props) {
  const trapRef = useFocusTrap<HTMLDivElement>(true);
  const { plants } = useCachedShed(homeId);

  const [linkedPlantId, setLinkedPlantId] = useState<number | null>(packet.plant_id);
  const [linkedPlantName, setLinkedPlantName] = useState<string | null>(
    plant?.common_name ?? null,
  );
  const [linkedPlantSci, setLinkedPlantSci] = useState<string | null>(
    plant?.scientific_name ?? null,
  );

  const [showSearch, setShowSearch] = useState<boolean>(focusLink && linkedPlantId == null);
  const [search, setSearch] = useState("");

  const [form, setForm] = useState<FormState>(() => toFormState(packet));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** When true, `PlantSearchModal` is mounted on top of this editor so
   *  the user can search AI / Perenual / Verdantly for a plant that
   *  isn't in their Shed yet. On a successful add it returns the new
   *  Shed row, which we set as the linked plant. */
  const [showProviderSearch, setShowProviderSearch] = useState(false);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = "unset"; };
  }, []);

  const shedOptions: ShedPlantOption[] = useMemo(() => {
    return (plants ?? [])
      .filter((p: any) => !p.is_archived)
      .map((p: any) => ({
        id: p.id,
        common_name: p.common_name ?? "Unknown plant",
        scientific_name: Array.isArray(p.scientific_name)
          ? p.scientific_name[0] ?? null
          : (p.scientific_name as string | null) ?? null,
      }));
  }, [plants]);

  const filteredShed = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return shedOptions;
    return shedOptions.filter(
      (p) =>
        p.common_name.toLowerCase().includes(q) ||
        p.scientific_name?.toLowerCase().includes(q),
    );
  }, [shedOptions, search]);

  const original = useMemo(() => toFormState(packet), [packet]);

  const changedKeys = useMemo(() => {
    const keys: string[] = [];
    (Object.keys(form) as (keyof FormState)[]).forEach((k) => {
      if ((form[k] ?? "") !== (original[k] ?? "")) keys.push(k);
    });
    if (linkedPlantId !== packet.plant_id) keys.push("plant_id");
    return keys;
  }, [form, original, linkedPlantId, packet.plant_id]);

  const canSave = changedKeys.length > 0 && !saving;

  const handlePickPlant = (opt: ShedPlantOption) => {
    setLinkedPlantId(opt.id);
    setLinkedPlantName(opt.common_name);
    setLinkedPlantSci(opt.scientific_name);
    setShowSearch(false);
    setSearch("");
  };

  /** `PlantSearchModal` returns the freshly-inserted Shed row. We adopt
   *  it as the linked plant so the user just has to tap Save to commit
   *  the packet update. */
  const handleProviderAdded = (newPlant: any) => {
    if (!newPlant?.id) return;
    const sci = Array.isArray(newPlant.scientific_name)
      ? newPlant.scientific_name[0] ?? null
      : (newPlant.scientific_name as string | null) ?? null;
    setLinkedPlantId(newPlant.id);
    setLinkedPlantName(newPlant.common_name ?? null);
    setLinkedPlantSci(sci);
    setShowSearch(false);
    setSearch("");
    setShowProviderSearch(false);
  };

  /** The query we hand off to PlantSearchModal so the user doesn't have
   *  to retype: the Shed-search text if they were already typing,
   *  otherwise the packet variety or the existing linked plant's name. */
  const providerInitialQuery =
    search.trim() ||
    form.variety.trim() ||
    linkedPlantName ||
    "";

  const handleUnlink = () => {
    setLinkedPlantId(null);
    setLinkedPlantName(null);
    setLinkedPlantSci(null);
  };

  const setField = (key: keyof FormState, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const patch: Record<string, unknown> = {};
      if (changedKeys.includes("plant_id")) patch.plant_id = linkedPlantId;
      if (changedKeys.includes("variety")) patch.variety = form.variety.trim() || null;
      if (changedKeys.includes("vendor")) patch.vendor = form.vendor.trim() || null;
      if (changedKeys.includes("purchased_on")) patch.purchased_on = form.purchased_on || null;
      if (changedKeys.includes("opened_on")) patch.opened_on = form.opened_on || null;
      if (changedKeys.includes("sow_by")) patch.sow_by = form.sow_by || null;
      if (changedKeys.includes("quantity_remaining"))
        patch.quantity_remaining = form.quantity_remaining.trim() || null;
      if (changedKeys.includes("notes")) patch.notes = form.notes.trim() || null;

      const next = await updateSeedPacket(packet.id, patch as never);
      logEvent(EVENT.NURSERY_PACKET_EDITED, {
        packet_id: packet.id,
        changed_keys: changedKeys,
        plant_id_was_null: packet.plant_id == null,
        plant_id_now_set: linkedPlantId != null,
      });
      toast.success(
        changedKeys.includes("plant_id") && packet.plant_id == null
          ? "Packet linked — you can plant it out now."
          : "Packet updated.",
      );
      onSaved?.(next);
      onClose();
    } catch (err) {
      Logger.error("EditSeedPacketModal save failed", err, { packetId: packet.id });
      setError(err instanceof Error ? err.message : "Couldn't save the packet.");
    } finally {
      setSaving(false);
    }
  };

  const showUnlinkWarning =
    linkedPlantId == null && packet.plant_id != null && hasActiveSowings;

  return createPortal(
    <div
      data-testid="edit-seed-packet-modal"
      className="fixed inset-0 z-[120] flex items-end sm:items-center sm:justify-center bg-black/40 backdrop-blur-sm animate-in fade-in"
      onClick={onClose}
    >
      <div
        ref={trapRef}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full sm:max-w-lg bg-rhozly-bg rounded-t-3xl sm:rounded-3xl shadow-2xl border border-rhozly-outline/15 flex flex-col max-h-[92vh] overflow-hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <header className="shrink-0 px-5 pt-4 pb-3 flex items-start justify-between gap-3 border-b border-rhozly-outline/10">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-primary mb-0.5">
              Edit packet
            </p>
            <h2 className="font-display font-black text-rhozly-on-surface text-lg leading-tight truncate">
              {packet.variety?.trim() || linkedPlantName || "Untitled packet"}
            </h2>
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

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* ── Linked plant ──────────────────────────────────────────── */}
          <section
            data-testid="edit-packet-link-section"
            className="rounded-2xl bg-white border border-rhozly-outline/15 p-3"
          >
            <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/55 mb-2">
              Linked plant
            </p>

            {linkedPlantId != null ? (
              <div className="flex items-center gap-2.5">
                <span className="shrink-0 w-9 h-9 rounded-xl bg-rhozly-primary/10 text-rhozly-primary flex items-center justify-center">
                  <Sprout size={16} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-display font-black text-rhozly-on-surface text-sm leading-tight truncate">
                    {linkedPlantName ?? "Linked"}
                  </p>
                  {linkedPlantSci && (
                    <p className="text-[10px] text-rhozly-on-surface/55 italic truncate">
                      {linkedPlantSci}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  data-testid="edit-packet-change-link"
                  onClick={() => setShowSearch((v) => !v)}
                  className="px-2.5 py-1.5 rounded-lg bg-rhozly-primary/10 text-rhozly-primary text-[10px] font-black uppercase tracking-widest hover:bg-rhozly-primary/15"
                >
                  Change
                </button>
                <button
                  type="button"
                  data-testid="edit-packet-unlink"
                  onClick={handleUnlink}
                  aria-label="Unlink plant"
                  className="p-1.5 rounded-lg text-rhozly-on-surface/55 hover:text-red-600 hover:bg-red-50"
                  title="Unlink this plant"
                >
                  <Unlink size={14} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2.5">
                <span className="shrink-0 w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
                  <Link2 size={16} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-display font-black text-rhozly-on-surface text-sm leading-tight">
                    Not linked to a Shed plant
                  </p>
                  <p className="text-[11px] text-rhozly-on-surface/55 leading-snug">
                    Link a plant to plant out germinated sowings.
                  </p>
                </div>
                <button
                  type="button"
                  data-testid="edit-packet-link-now"
                  onClick={() => setShowSearch((v) => !v)}
                  className="px-3 py-1.5 rounded-lg bg-rhozly-primary text-white text-[10px] font-black uppercase tracking-widest hover:opacity-95"
                >
                  Link a plant
                </button>
              </div>
            )}

            {showUnlinkWarning && (
              <div className="mt-2.5 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 flex items-start gap-2">
                <AlertTriangle size={13} className="shrink-0 mt-0.5 text-amber-600" />
                <p className="text-[11px] font-bold text-amber-900 leading-snug">
                  This packet has active sowings. You'll need to relink before
                  you can plant them out.
                </p>
              </div>
            )}

            {showSearch && (
              <div className="mt-3 space-y-2">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-rhozly-on-surface/40" />
                  <input
                    type="text"
                    placeholder="Search your Shed…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    data-testid="edit-packet-shed-search"
                    className={`${PACKET_FORM_INPUT_CX} pl-9`}
                    autoFocus
                  />
                </div>
                <ul
                  data-testid="edit-packet-shed-list"
                  className="flex flex-col gap-1.5 max-h-[200px] overflow-y-auto"
                >
                  {shedOptions.length === 0 ? (
                    <li className="text-[11px] font-bold text-rhozly-on-surface/45 text-center py-3">
                      No plants in your Shed yet. Add a plant first, then come
                      back here to link it.
                    </li>
                  ) : filteredShed.length === 0 ? (
                    <li className="text-[11px] font-bold text-rhozly-on-surface/45 text-center py-3">
                      No matches in your Shed.
                    </li>
                  ) : (
                    filteredShed.map((opt) => {
                      const isCurrent = linkedPlantId === opt.id;
                      return (
                        <li key={opt.id}>
                          <button
                            type="button"
                            data-testid={`edit-packet-shed-option-${opt.id}`}
                            onClick={() => handlePickPlant(opt)}
                            disabled={isCurrent}
                            className={`w-full text-left rounded-xl border p-2 flex items-center gap-2 transition-colors ${
                              isCurrent
                                ? "bg-rhozly-primary/[0.08] border-rhozly-primary/40 cursor-default"
                                : "bg-white border-rhozly-outline/20 hover:border-rhozly-primary/30"
                            }`}
                          >
                            <span className="shrink-0 w-8 h-8 rounded-lg bg-rhozly-primary/10 text-rhozly-primary flex items-center justify-center">
                              <Sprout size={14} />
                            </span>
                            <span className="flex-1 min-w-0">
                              <span className="block font-display font-black text-rhozly-on-surface text-xs leading-tight truncate">
                                {opt.common_name}
                              </span>
                              {opt.scientific_name && (
                                <span className="block text-[10px] text-rhozly-on-surface/55 italic truncate">
                                  {opt.scientific_name}
                                </span>
                              )}
                            </span>
                            {isCurrent && (
                              <Check size={14} className="text-rhozly-primary shrink-0" />
                            )}
                          </button>
                        </li>
                      );
                    })
                  )}
                </ul>

                {/* "Not in your Shed?" — opens PlantSearchModal so the
                    user can find the plant via AI / Perenual / Verdantly
                    and add it to their Shed AND link it to this packet
                    in one go. Single-add only — PlantSearchModal exits
                    after the first successful insert. */}
                <button
                  type="button"
                  data-testid="edit-packet-provider-search"
                  onClick={() => setShowProviderSearch(true)}
                  className="w-full mt-1 flex items-center gap-2.5 rounded-xl border border-rhozly-primary/25 bg-rhozly-primary/[0.06] hover:bg-rhozly-primary/10 px-3 py-2.5 text-left transition-colors"
                >
                  <span className="shrink-0 w-8 h-8 rounded-lg bg-rhozly-primary/15 text-rhozly-primary flex items-center justify-center">
                    <Globe size={15} />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-display font-black text-rhozly-primary text-[11px] uppercase tracking-widest">
                      Not in your Shed?
                    </span>
                    <span className="block text-[11px] text-rhozly-on-surface/65 leading-snug">
                      Search the plant database — we'll add it to your Shed and link it here.
                    </span>
                  </span>
                </button>
              </div>
            )}
          </section>

          {/* ── Packet details ────────────────────────────────────────── */}
          <section
            data-testid="edit-packet-details-section"
            className="space-y-3"
          >
            <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/55 px-1">
              Packet details
            </p>

            <PacketFieldRow label="Variety" testId="edit-packet-variety" optional>
              <input
                type="text"
                value={form.variety}
                onChange={(e) => setField("variety", e.target.value)}
                placeholder="e.g. Sungold"
                className={PACKET_FORM_INPUT_CX}
              />
            </PacketFieldRow>

            <PacketFieldRow label="Vendor" testId="edit-packet-vendor" optional>
              <input
                type="text"
                value={form.vendor}
                onChange={(e) => setField("vendor", e.target.value)}
                placeholder="e.g. Suttons, Real Seeds"
                className={PACKET_FORM_INPUT_CX}
              />
            </PacketFieldRow>

            <div className="grid grid-cols-2 gap-3">
              <PacketFieldRow label="Purchased" testId="edit-packet-purchased" optional>
                <input
                  type="date"
                  value={form.purchased_on}
                  onChange={(e) => setField("purchased_on", e.target.value)}
                  className={PACKET_FORM_INPUT_CX}
                />
              </PacketFieldRow>
              <PacketFieldRow label="Opened" testId="edit-packet-opened" optional>
                <input
                  type="date"
                  value={form.opened_on}
                  onChange={(e) => setField("opened_on", e.target.value)}
                  className={PACKET_FORM_INPUT_CX}
                />
              </PacketFieldRow>
            </div>

            <PacketFieldRow
              label="Sow by"
              testId="edit-packet-sow-by"
              optional
              hint="Listed on the back of the packet. Drives the refill nudges."
            >
              <input
                type="date"
                value={form.sow_by}
                onChange={(e) => setField("sow_by", e.target.value)}
                className={PACKET_FORM_INPUT_CX}
              />
            </PacketFieldRow>

            <PacketFieldRow label="Quantity remaining" testId="edit-packet-qty" optional>
              <input
                type="text"
                value={form.quantity_remaining}
                onChange={(e) => setField("quantity_remaining", e.target.value)}
                placeholder="e.g. ~30 seeds, half a packet"
                className={PACKET_FORM_INPUT_CX}
              />
            </PacketFieldRow>

            <PacketFieldRow label="Notes" testId="edit-packet-notes" optional>
              <textarea
                value={form.notes}
                onChange={(e) => setField("notes", e.target.value)}
                rows={2}
                className={`${PACKET_FORM_INPUT_CX} resize-none`}
              />
            </PacketFieldRow>
          </section>

          {error && (
            <p className="text-xs font-bold text-red-600 px-1">{error}</p>
          )}
        </div>

        <footer className="shrink-0 px-5 py-3 border-t border-rhozly-outline/10 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1 px-3 py-2 min-h-[40px] rounded-xl text-rhozly-on-surface/60 hover:text-rhozly-on-surface text-[11px] font-black uppercase tracking-widest"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="edit-packet-save"
            onClick={handleSave}
            disabled={!canSave}
            className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] rounded-xl bg-rhozly-primary text-white text-[11px] font-black uppercase tracking-widest hover:opacity-95 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
            Save changes
          </button>
        </footer>
      </div>

      {/* Provider search — mounted in portal-mount order so it stacks
          above the editor without needing a higher z-index. Single-add
          only; PlantSearchModal exits via onSuccess after one insert. */}
      {showProviderSearch && (
        <PlantSearchModal
          homeId={homeId}
          isPremium={perenualEnabled}
          isAiEnabled={aiEnabled}
          initialSearchTerm={providerInitialQuery}
          onClose={() => setShowProviderSearch(false)}
          onSuccess={handleProviderAdded}
        />
      )}
    </div>,
    document.body,
  );
}
