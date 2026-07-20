import React, { useState } from "react";
import { Home, Sun } from "lucide-react";
import { ModalShell } from "../ui/ModalShell";
import { createLocation } from "../../lib/locationMutations";
import { usePermissions } from "../../context/HomePermissionsContext";
import { logEvent, EVENT } from "../../events/registry";
import { Logger } from "../../lib/errorHandler";
import toast from "react-hot-toast";

/**
 * Inline "add a location" from the home garden grid (stats+locations redesign
 * Stage 4b). The same DB path as LocationManager (`createLocation`), so the
 * home and `/management` create locations identically. The TRIGGER owns the
 * `can("locations.create")` gate — this sheet is only mounted once the gated
 * button opens it. On success it calls `onCreated` so the grid refetches.
 */

interface Props {
  isOpen: boolean;
  onClose: () => void;
  homeId: string;
  /** Refetch the grid after a successful create (App's home-data refresh). */
  onCreated: () => void;
}

export default function AddLocationSheet({ isOpen, onClose, homeId, onCreated }: Props) {
  const { can } = usePermissions();
  const [name, setName] = useState("");
  const [isOutside, setIsOutside] = useState(false);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setName("");
    setIsOutside(false);
    setSaving(false);
  };

  const handleSave = async () => {
    // Defense-in-depth: re-check the gate here, not only on the trigger. RLS
    // gates only home membership, not the spatial keys, so the client `can()`
    // is the sole guard — a re-check means no trigger can ever open an ungated
    // create (a repointed empty-garden CTA once did; review finding).
    if (!can("locations.create")) {
      toast.error("You don't have permission to add locations.");
      return;
    }
    if (!name.trim()) {
      toast.error("Location name is required.");
      return;
    }
    setSaving(true);
    const { error } = await createLocation({ name, isOutside, homeId });
    if (error) {
      setSaving(false);
      Logger.error("Failed to create location (home grid)", error, {}, "Failed to create location.");
      return;
    }
    logEvent(EVENT.LOCATION_CREATED, { is_outside: isOutside });
    toast.success("Location created!");
    reset();
    onCreated();
    onClose();
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={() => {
        reset();
        onClose();
      }}
      size="sm"
      sheet
      aria-labelledby="add-location-heading"
      data-testid="add-location-sheet"
    >
      <div className="p-5 space-y-4">
        <h2 id="add-location-heading" className="text-sm font-black text-rhozly-primary uppercase tracking-widest">
          Add a location
        </h2>
        <input
          autoFocus
          data-testid="home-add-location-name-input"
          placeholder="Location name (e.g. Back Garden, Lounge)"
          className="w-full px-4 py-3 rounded-2xl border border-rhozly-outline/15 bg-rhozly-surface-lowest outline-none font-medium focus:border-rhozly-primary transition-colors"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
          }}
        />
        <button
          type="button"
          data-testid="home-add-location-env-toggle"
          onClick={() => setIsOutside((v) => !v)}
          aria-pressed={isOutside}
          className={`w-full px-4 py-3 rounded-2xl font-bold flex items-center justify-center gap-2 transition-colors ${isOutside ? "bg-status-weather-fill text-status-weather-ink-strong" : "bg-rhozly-primary/10 text-rhozly-primary"}`}
        >
          {isOutside ? <Sun size={18} /> : <Home size={18} />}
          {isOutside ? "Outside" : "Inside"}
        </button>
        <div className="flex gap-2 justify-end pt-1">
          <button
            type="button"
            onClick={() => {
              reset();
              onClose();
            }}
            className="px-5 py-2.5 text-rhozly-on-surface-variant font-bold text-sm can-hover:hover:text-rhozly-on-surface transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="home-add-location-save"
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2.5 bg-rhozly-primary text-white rounded-2xl font-black text-sm shadow-card can-hover:hover:opacity-90 active:scale-[0.98] transition disabled:opacity-50"
          >
            {saving ? "Saving…" : "Create"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
