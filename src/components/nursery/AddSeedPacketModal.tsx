import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  X, Sprout, Package, Loader2, Search, ChevronRight, ChevronLeft, Check,
} from "lucide-react";
import toast from "react-hot-toast";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { useCachedShed } from "../../hooks/useCachedShed";
import { createSeedPacket } from "../../services/nurseryService";
import { Logger } from "../../lib/errorHandler";
import { logEvent, EVENT } from "../../events/registry";
import { PACKET_FORM_INPUT_CX, PacketFieldRow } from "./_packetForm";

interface Props {
  homeId: string;
  onClose: () => void;
  onCreated?: (packetId: string) => void;
}

type Step = "pick-plant" | "details";

interface ShedPlantOption {
  id: number;
  common_name: string;
  scientific_name: string | null;
}

/**
 * Two-step modal for adding a new seed packet to The Nursery.
 *
 * Step 1 — Pick the parent plant. The user picks one of their existing
 * Shed plants (the 80% case for Marcus), or chooses "I'll add it later"
 * to skip linking (the row stores variety text only; the user can link
 * via Edit later).
 *
 * Step 2 — Packet details (variety, vendor, sow-by, opened-on, purchased,
 * quantity, notes). Save inserts into `seed_packets` and fires the
 * onCreated callback so the Nursery list refreshes.
 *
 * Catalogue-aware search (Perenual / Verdantly / AI) lands in a later
 * wave with the bulk-paste parser. For Wave 2 we lean on the Shed.
 */
export default function AddSeedPacketModal({ homeId, onClose, onCreated }: Props) {
  const trapRef = useFocusTrap<HTMLDivElement>(true);
  const { plants } = useCachedShed(homeId);

  const [step, setStep] = useState<Step>("pick-plant");
  const [search, setSearch] = useState("");
  const [pickedPlant, setPickedPlant] = useState<ShedPlantOption | null>(null);
  /** Free-text fallback when the user has no matching plant in the Shed. */
  const [freeTextName, setFreeTextName] = useState("");
  const [useFreeText, setUseFreeText] = useState(false);

  const [form, setForm] = useState({
    variety: "",
    vendor: "",
    purchased_on: "",
    opened_on: "",
    sow_by: "",
    quantity_remaining: "",
    notes: "",
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    return shedOptions.filter((p) => {
      if (p.common_name.toLowerCase().includes(q)) return true;
      if (p.scientific_name?.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [shedOptions, search]);

  const canAdvance =
    step === "pick-plant"
      ? !!pickedPlant || (useFreeText && freeTextName.trim().length > 0)
      : true;

  const handleAdvance = () => {
    if (step !== "pick-plant" || !canAdvance) return;
    // Pre-seed variety with the free-text name if that path was taken,
    // since the variety field is the only place that name ends up.
    if (useFreeText && !pickedPlant && !form.variety) {
      setForm((prev) => ({ ...prev, variety: freeTextName.trim() }));
    }
    setStep("details");
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const variety = form.variety.trim() || (useFreeText ? freeTextName.trim() : "");
      const packet = await createSeedPacket({
        home_id: homeId,
        plant_id: pickedPlant?.id ?? null,
        variety: variety || null,
        vendor: form.vendor.trim() || null,
        purchased_on: form.purchased_on || null,
        opened_on: form.opened_on || null,
        sow_by: form.sow_by || null,
        quantity_remaining: form.quantity_remaining.trim() || null,
        notes: form.notes.trim() || null,
      });
      logEvent(EVENT.NURSERY_PACKET_ADDED, {
        has_plant_id: !!pickedPlant,
        has_vendor: !!form.vendor.trim(),
        has_sow_by: !!form.sow_by,
      });
      toast.success(
        pickedPlant
          ? `Added ${variety || pickedPlant.common_name} to your Nursery.`
          : `Added ${variety || "packet"} to your Nursery.`,
      );
      onCreated?.(packet.id);
      onClose();
    } catch (err) {
      Logger.error("AddSeedPacketModal save failed", err, { homeId });
      setError(err instanceof Error ? err.message : "Couldn't save the packet.");
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div
      data-testid="add-seed-packet-modal"
      className="fixed inset-0 z-[110] flex items-end sm:items-center sm:justify-center bg-black/40 backdrop-blur-sm animate-in fade-in"
      onClick={onClose}
    >
      <div
        ref={trapRef}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full sm:max-w-lg bg-rhozly-bg rounded-t-3xl sm:rounded-3xl shadow-2xl border border-rhozly-outline/15 flex flex-col max-h-[90vh] overflow-hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        {/* Header */}
        <header className="shrink-0 px-5 pt-4 pb-3 flex items-start justify-between gap-3 border-b border-rhozly-outline/10">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-primary mb-0.5">
              Add to The Nursery — Step {step === "pick-plant" ? 1 : 2} of 2
            </p>
            <h2 className="font-display font-black text-rhozly-on-surface text-lg leading-tight">
              {step === "pick-plant" ? "Which plant?" : "Packet details"}
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

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {step === "pick-plant" && (
            <PickPlantStep
              shedOptions={shedOptions}
              filteredShed={filteredShed}
              search={search}
              setSearch={setSearch}
              pickedPlant={pickedPlant}
              setPickedPlant={(p) => {
                setPickedPlant(p);
                setUseFreeText(false);
              }}
              useFreeText={useFreeText}
              setUseFreeText={(v) => {
                setUseFreeText(v);
                if (v) setPickedPlant(null);
              }}
              freeTextName={freeTextName}
              setFreeTextName={setFreeTextName}
            />
          )}
          {step === "details" && (
            <DetailsStep
              pickedPlant={pickedPlant}
              freeTextName={freeTextName}
              form={form}
              setForm={setForm}
              error={error}
            />
          )}
        </div>

        {/* Footer */}
        <footer className="shrink-0 px-5 py-3 border-t border-rhozly-outline/10 flex items-center justify-between gap-2">
          {step === "details" ? (
            <button
              type="button"
              onClick={() => setStep("pick-plant")}
              className="inline-flex items-center gap-1 px-3 py-2 min-h-[40px] rounded-xl text-rhozly-on-surface/60 hover:text-rhozly-on-surface text-[11px] font-black uppercase tracking-widest"
            >
              <ChevronLeft size={13} />
              Back
            </button>
          ) : (
            <span />
          )}
          {step === "pick-plant" ? (
            <button
              type="button"
              data-testid="add-seed-packet-next"
              onClick={handleAdvance}
              disabled={!canAdvance}
              className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] rounded-xl bg-rhozly-primary text-white text-[11px] font-black uppercase tracking-widest hover:opacity-95 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
              <ChevronRight size={13} />
            </button>
          ) : (
            <button
              type="button"
              data-testid="add-seed-packet-save"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] rounded-xl bg-rhozly-primary text-white text-[11px] font-black uppercase tracking-widest hover:opacity-95 transition disabled:opacity-60"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              Save packet
            </button>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  );
}

// ── Step 1 ─────────────────────────────────────────────────────────────────

function PickPlantStep({
  shedOptions, filteredShed, search, setSearch,
  pickedPlant, setPickedPlant,
  useFreeText, setUseFreeText, freeTextName, setFreeTextName,
}: {
  shedOptions: ShedPlantOption[];
  filteredShed: ShedPlantOption[];
  search: string;
  setSearch: (v: string) => void;
  pickedPlant: ShedPlantOption | null;
  setPickedPlant: (p: ShedPlantOption | null) => void;
  useFreeText: boolean;
  setUseFreeText: (v: boolean) => void;
  freeTextName: string;
  setFreeTextName: (v: string) => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-rhozly-on-surface/65 leading-snug">
        Pick a plant from your Shed so we can attach this packet to a known
        species. If it's something you don't have yet, choose "Add later" at
        the bottom — you can link it from the packet's detail screen any time.
      </p>

      {shedOptions.length > 0 && (
        <>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-rhozly-on-surface/40" />
            <input
              type="text"
              placeholder="Search your Shed…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="add-seed-packet-shed-search"
              className="w-full pl-9 pr-3 py-2.5 min-h-[44px] rounded-2xl bg-white border border-rhozly-outline/20 text-sm font-bold text-rhozly-on-surface focus:outline-none focus:border-rhozly-primary/40 focus:ring-2 focus:ring-rhozly-primary/15"
            />
          </div>

          <ul
            data-testid="add-seed-packet-shed-list"
            className="flex flex-col gap-1.5 max-h-[280px] overflow-y-auto"
          >
            {filteredShed.length === 0 ? (
              <li className="text-[11px] font-bold text-rhozly-on-surface/45 text-center py-4">
                No matches in your Shed.
              </li>
            ) : (
              filteredShed.map((opt) => {
                const isSelected = pickedPlant?.id === opt.id;
                return (
                  <li key={opt.id}>
                    <button
                      type="button"
                      data-testid={`add-seed-packet-shed-option-${opt.id}`}
                      onClick={() => setPickedPlant(opt)}
                      className={`w-full text-left rounded-2xl border p-2.5 flex items-center gap-2.5 transition-colors ${
                        isSelected
                          ? "bg-rhozly-primary/[0.08] border-rhozly-primary/40"
                          : "bg-white border-rhozly-outline/20 hover:border-rhozly-primary/30"
                      }`}
                    >
                      <span className="shrink-0 w-9 h-9 rounded-xl bg-rhozly-primary/10 text-rhozly-primary flex items-center justify-center">
                        <Sprout size={16} />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block font-display font-black text-rhozly-on-surface text-sm leading-tight truncate">
                          {opt.common_name}
                        </span>
                        {opt.scientific_name && (
                          <span className="block text-[10px] text-rhozly-on-surface/55 italic truncate">
                            {opt.scientific_name}
                          </span>
                        )}
                      </span>
                      {isSelected && (
                        <Check size={16} className="text-rhozly-primary shrink-0" />
                      )}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </>
      )}

      {/* Free-text fallback */}
      <div className="rounded-2xl border border-rhozly-outline/15 bg-rhozly-surface-low/40 p-3">
        <label className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={useFreeText}
            onChange={(e) => setUseFreeText(e.target.checked)}
            className="sr-only"
            data-testid="add-seed-packet-freetext-toggle"
          />
          <span
            className={`shrink-0 w-5 h-5 mt-0.5 rounded flex items-center justify-center border ${
              useFreeText
                ? "bg-rhozly-primary border-rhozly-primary text-white"
                : "border-rhozly-outline/30 bg-white"
            }`}
          >
            {useFreeText && <Check size={13} strokeWidth={3} />}
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-black text-rhozly-on-surface">
              Add later — I just want to log the packet
            </span>
            <span className="block text-[11px] text-rhozly-on-surface/65 mt-0.5 leading-snug">
              Useful when you've picked something up that isn't in your Shed yet.
              You can link the packet to a proper plant any time.
            </span>
          </span>
        </label>
        {useFreeText && (
          <input
            type="text"
            placeholder="Plant name (e.g. Sunflower)"
            value={freeTextName}
            onChange={(e) => setFreeTextName(e.target.value)}
            data-testid="add-seed-packet-freetext-name"
            className="mt-3 w-full px-3 py-2.5 min-h-[44px] rounded-xl bg-white border border-rhozly-outline/20 text-sm font-bold text-rhozly-on-surface focus:outline-none focus:border-rhozly-primary/40 focus:ring-2 focus:ring-rhozly-primary/15"
          />
        )}
      </div>
    </div>
  );
}

// ── Step 2 ─────────────────────────────────────────────────────────────────

function DetailsStep({
  pickedPlant, freeTextName, form, setForm, error,
}: {
  pickedPlant: ShedPlantOption | null;
  freeTextName: string;
  form: Record<string, string>;
  setForm: React.Dispatch<React.SetStateAction<{
    variety: string;
    vendor: string;
    purchased_on: string;
    opened_on: string;
    sow_by: string;
    quantity_remaining: string;
    notes: string;
  }>>;
  error: string | null;
}) {
  const headline = pickedPlant?.common_name || freeTextName || "Untitled packet";

  const set = (key: keyof typeof form, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-rhozly-primary/[0.06] border border-rhozly-primary/20 p-3 flex items-center gap-2.5">
        <span className="shrink-0 w-9 h-9 rounded-xl bg-rhozly-primary/15 text-rhozly-primary flex items-center justify-center">
          <Package size={16} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-primary mb-0.5">
            Packet for
          </p>
          <p className="font-display font-black text-rhozly-on-surface text-sm truncate">
            {headline}
          </p>
        </div>
      </div>

      <PacketFieldRow label="Variety" testId="packet-variety" optional>
        <input
          type="text"
          value={form.variety}
          onChange={(e) => set("variety", e.target.value)}
          placeholder={`e.g. ${pickedPlant?.common_name?.includes("Tomato") ? "Sungold" : "Boltardy"}`}
          className={PACKET_FORM_INPUT_CX}
        />
      </PacketFieldRow>

      <PacketFieldRow label="Vendor" testId="packet-vendor" optional>
        <input
          type="text"
          value={form.vendor}
          onChange={(e) => set("vendor", e.target.value)}
          placeholder="e.g. Suttons, Real Seeds, Sainsbury's"
          className={PACKET_FORM_INPUT_CX}
        />
      </PacketFieldRow>

      <div className="grid grid-cols-2 gap-3">
        <PacketFieldRow label="Purchased" testId="packet-purchased" optional>
          <input
            type="date"
            value={form.purchased_on}
            onChange={(e) => set("purchased_on", e.target.value)}
            className={PACKET_FORM_INPUT_CX}
          />
        </PacketFieldRow>
        <PacketFieldRow label="Opened" testId="packet-opened" optional>
          <input
            type="date"
            value={form.opened_on}
            onChange={(e) => set("opened_on", e.target.value)}
            className={PACKET_FORM_INPUT_CX}
          />
        </PacketFieldRow>
      </div>

      <PacketFieldRow
        label="Sow by"
        testId="packet-sow-by"
        optional
        hint="Listed on the back of the packet. Drives the refill nudges."
      >
        <input
          type="date"
          value={form.sow_by}
          onChange={(e) => set("sow_by", e.target.value)}
          className={PACKET_FORM_INPUT_CX}
        />
      </PacketFieldRow>

      <PacketFieldRow label="Quantity remaining" testId="packet-qty" optional>
        <input
          type="text"
          value={form.quantity_remaining}
          onChange={(e) => set("quantity_remaining", e.target.value)}
          placeholder="e.g. ~30 seeds, half a packet"
          className={PACKET_FORM_INPUT_CX}
        />
      </PacketFieldRow>

      <PacketFieldRow label="Notes" testId="packet-notes" optional>
        <textarea
          value={form.notes}
          onChange={(e) => set("notes", e.target.value)}
          placeholder="Anything you want to remember about this packet."
          rows={2}
          className={`${PACKET_FORM_INPUT_CX} resize-none`}
        />
      </PacketFieldRow>

      {error && (
        <p className="text-xs font-bold text-red-600">{error}</p>
      )}
    </div>
  );
}

