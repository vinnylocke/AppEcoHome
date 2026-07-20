import React, { useState } from "react";
import { MoreVertical, Pencil, Home, Sun, Trash2 } from "lucide-react";
import { ModalShell } from "../ui/ModalShell";
import { ConfirmModal } from "../ConfirmModal";
import { usePermissions } from "../../context/HomePermissionsContext";
import { renameLocation, setLocationEnvironment, deleteLocation } from "../../lib/locationMutations";
import { Logger } from "../../lib/errorHandler";
import toast from "react-hot-toast";

/**
 * Per-location manage kebab on the home garden grid (stats+locations redesign
 * Stage 4b) — rename / switch inside-outside / delete, IN PLACE. Uses the shared
 * `locationMutations` (same DB path as LocationManager) and gates every action
 * with the exact permission keys: rename + inside/outside need
 * `locations.edit`, delete needs `locations.delete`. A viewer (no keys) sees no
 * kebab at all; a member sees rename + inside/outside but not delete.
 *
 * The card header is itself a navigation <button>, so the kebab and every menu
 * button `stopPropagation` to avoid triggering the drill-in.
 */

interface Props {
  location: { id: string; name: string; is_outside: boolean | null };
  /** Refetch the grid after a successful mutation. */
  onChanged: () => void;
}

const stop = (e: React.MouseEvent) => e.stopPropagation();

export default function LocationManageMenu({ location, onChanged }: Props) {
  const { can } = usePermissions();
  const canEdit = can("locations.edit");
  const canDelete = can("locations.delete");

  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(location.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  // Viewers (no edit + no delete) get no manage affordance at all.
  if (!canEdit && !canDelete) return null;

  const isOutside = !!location.is_outside;

  const closeAll = () => {
    setMenuOpen(false);
    setRenaming(false);
    setBusy(false);
  };

  const doRename = async () => {
    const next = renameValue.trim();
    if (!next) {
      toast.error("Location name is required.");
      return;
    }
    setBusy(true);
    const { error } = await renameLocation(location.id, next);
    if (error) {
      setBusy(false);
      Logger.error("Failed to rename location (home grid)", error, {}, "Failed to rename location.");
      return;
    }
    toast.success("Location renamed.");
    closeAll();
    onChanged();
  };

  const doToggleEnv = async () => {
    setBusy(true);
    const { error } = await setLocationEnvironment(location.id, !isOutside);
    if (error) {
      setBusy(false);
      Logger.error("Failed to switch environment (home grid)", error, {}, "Failed to update environment.");
      return;
    }
    toast.success(!isOutside ? "Switched to Outside." : "Switched to Inside.");
    closeAll();
    onChanged();
  };

  const doDelete = async () => {
    setBusy(true);
    const { error } = await deleteLocation(location.id);
    if (error) {
      setBusy(false);
      Logger.error("Failed to delete location (home grid)", error, {}, "Failed to delete location.");
      return;
    }
    toast.success("Location deleted.");
    setConfirmDelete(false);
    closeAll();
    onChanged();
  };

  return (
    <>
      <button
        type="button"
        data-testid={`location-manage-${location.id}`}
        aria-label={`Manage ${location.name}`}
        onClick={(e) => {
          stop(e);
          setRenameValue(location.name);
          setMenuOpen(true);
        }}
        className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-rhozly-on-surface/35 can-hover:hover:text-rhozly-primary can-hover:hover:bg-rhozly-primary/5 active:scale-90 transition"
      >
        <MoreVertical size={16} />
      </button>

      {/* Action sheet — bottom sheet on phones, centered dialog on sm+. */}
      <ModalShell
        isOpen={menuOpen}
        onClose={closeAll}
        size="sm"
        sheet
        aria-label={`Manage ${location.name}`}
        data-testid="location-manage-sheet"
      >
        <div className="p-4 space-y-1" onClick={stop}>
          <p className="text-3xs font-black uppercase tracking-widest text-rhozly-on-surface/40 px-2 pb-1">
            {location.name}
          </p>

          {renaming ? (
            <div className="p-2 space-y-3">
              <input
                autoFocus
                data-testid="location-rename-input"
                className="w-full px-4 py-3 rounded-2xl border border-rhozly-outline/15 bg-rhozly-surface-lowest outline-none font-medium focus:border-rhozly-primary transition-colors"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") doRename();
                }}
              />
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setRenaming(false)} className="px-4 py-2 text-rhozly-on-surface-variant font-bold text-sm">
                  Cancel
                </button>
                <button
                  type="button"
                  data-testid="location-rename-save"
                  onClick={doRename}
                  disabled={busy}
                  className="px-5 py-2 bg-rhozly-primary text-white rounded-xl font-black text-sm can-hover:hover:opacity-90 active:scale-[0.98] transition disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </div>
          ) : (
            <>
              {canEdit && (
                <button
                  type="button"
                  data-testid="location-manage-rename"
                  onClick={() => setRenaming(true)}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-bold text-rhozly-on-surface can-hover:hover:bg-rhozly-primary/5 transition text-left"
                >
                  <Pencil size={16} className="text-rhozly-on-surface/50" /> Rename
                </button>
              )}
              {canEdit && (
                <button
                  type="button"
                  data-testid="location-manage-env"
                  onClick={doToggleEnv}
                  disabled={busy}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-bold text-rhozly-on-surface can-hover:hover:bg-rhozly-primary/5 transition text-left disabled:opacity-50"
                >
                  {isOutside ? <Home size={16} className="text-rhozly-on-surface/50" /> : <Sun size={16} className="text-rhozly-on-surface/50" />}
                  Switch to {isOutside ? "Inside" : "Outside"}
                </button>
              )}
              {canDelete && (
                <button
                  type="button"
                  data-testid="location-manage-delete"
                  onClick={() => {
                    // Close the action sheet so the confirm dialog isn't
                    // stacked on top of it (review finding).
                    setMenuOpen(false);
                    setConfirmDelete(true);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-bold text-status-danger-ink can-hover:hover:bg-status-danger-fill transition text-left"
                >
                  <Trash2 size={16} /> Delete location
                </button>
              )}
            </>
          )}
        </div>
      </ModalShell>

      <ConfirmModal
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={doDelete}
        title={`Delete ${location.name}?`}
        description="This removes the location and all its areas and plants. This can't be undone."
        confirmText="Delete"
        isLoading={busy}
        isDestructive
      />
    </>
  );
}
