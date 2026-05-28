import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Loader2,
  MapPin,
  Plus,
  Sprout,
  Calendar,
  Hash,
  ChevronRight,
  Inbox,
  Leaf,
  Trash2,
  ArrowRight,
} from "lucide-react";
import toast from "react-hot-toast";
import { supabase } from "../../lib/supabase";
import { Logger } from "../../lib/errorHandler";
import InstanceEditModal from "../InstanceEditModal";
import LifecycleCompleteModal from "../LifecycleCompleteModal";
import LifecycleAnalysisModal from "../LifecycleAnalysisModal";
import { ConfirmModal } from "../ConfirmModal";
import type { LifecycleAnalysis } from "../../types";

interface Props {
  homeId: string;
  plantId: number;
  plantName: string;
  aiEnabled?: boolean;
  isPremium?: boolean;
}

interface InventoryItemRow {
  id: string;
  plant_id: string;
  plant_name: string | null;
  nickname: string | null;
  identifier: string | null;
  status: string;
  area_id: string | null;
  area_name: string | null;
  location_id: string | null;
  location_name: string | null;
  planted_at: string | null;
  is_established: boolean | null;
  growth_state: string | null;
  environment: string | null;
}

function shortDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Per-plant instances list on the Plant Edit Modal.
 *
 * Shows every active `inventory_items` row for this species in the
 * current home. Each row reveals identifier, status, location/area,
 * planted date, and growth state. Tapping a row opens the existing
 * `InstanceEditModal` so the user can edit details, change area, etc.
 *
 * A small "Add another to garden" button at the top creates a new
 * unassigned instance directly — for users who have several copies of
 * the same plant and want to track them individually without going
 * through the full Plant Assignment Modal flow.
 */
export default function PlantInstancesTab({
  homeId,
  plantId,
  plantName,
  aiEnabled,
  isPremium,
}: Props) {
  const [items, setItems] = useState<InventoryItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<InventoryItemRow | null>(null);
  const [adding, setAdding] = useState(false);
  /** Per-row "Mark End of Life" target. Opens `LifecycleCompleteModal`
   *  which captures the closing note + photo + natural-end flag. */
  const [endingLifecycle, setEndingLifecycle] = useState<InventoryItemRow | null>(null);
  /** Result of the most recent End of Life completion — drives the
   *  follow-up `LifecycleAnalysisModal`. */
  const [lifecycleResult, setLifecycleResult] = useState<{
    open: boolean;
    plantName: string;
    wasNaturalEnd: boolean;
    analysis: LifecycleAnalysis | null;
  }>({ open: false, plantName: "", wasNaturalEnd: false, analysis: null });
  /** Per-row "Delete" target. Opens `ConfirmModal` in destructive mode. */
  const [deletingRow, setDeletingRow] = useState<InventoryItemRow | null>(null);
  const [deleteInFlight, setDeleteInFlight] = useState(false);
  /** Count of ended instances for THIS species — surfaces a banner that
   *  routes users to the Senescence tab pre-filtered to this plant. */
  const [endedCount, setEndedCount] = useState(0);
  const navigate = useNavigate();

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [{ data, error: queryErr }, endedRes] = await Promise.all([
        supabase
          .from("inventory_items")
          .select(
            "id, plant_id, plant_name, nickname, identifier, status, area_id, area_name, location_id, location_name, planted_at, is_established, growth_state, environment",
          )
          .eq("home_id", homeId)
          .eq("plant_id", String(plantId))
          .is("ended_at", null)
          .order("planted_at", { ascending: false, nullsFirst: false })
          .order("identifier", { ascending: true }),
        // Count of this species' instances that have a closed lifecycle —
        // surfaces the Senescence banner.
        supabase
          .from("inventory_items")
          .select("id", { count: "exact", head: true })
          .eq("home_id", homeId)
          .eq("plant_id", String(plantId))
          .not("ended_at", "is", null),
      ]);
      if (queryErr) throw queryErr;
      setItems((data ?? []) as InventoryItemRow[]);
      setEndedCount(endedRes.count ?? 0);
    } catch (err: any) {
      Logger.error("PlantInstancesTab fetch failed", err, { plantId });
      setError(err?.message ?? "Couldn't load instances.");
    } finally {
      setLoading(false);
    }
  }, [homeId, plantId]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  /**
   * One-tap "add another to garden" — creates an unassigned planted
   * instance without going through the full Plant Assignment Modal.
   * The user can then tap the new row to fill in details if they want.
   */
  const handleAddAnother = async () => {
    setAdding(true);
    try {
      const identifier = `${plantName} #${Math.floor(Math.random() * 10000)
        .toString()
        .padStart(4, "0")}`;
      const { data, error: insertErr } = await supabase
        .from("inventory_items")
        .insert({
          home_id: homeId,
          plant_id: String(plantId),
          plant_name: plantName,
          status: "Planted",
          identifier,
          location_id: null,
          location_name: null,
          area_id: null,
          area_name: null,
          planted_at: null,
        })
        .select(
          "id, plant_id, plant_name, nickname, identifier, status, area_id, area_name, location_id, location_name, planted_at, is_established, growth_state, environment",
        )
        .single();
      if (insertErr) throw insertErr;
      setItems((prev) => [data as InventoryItemRow, ...prev]);
      toast.success(`Added ${identifier} to your garden.`);
    } catch (err: any) {
      Logger.error("PlantInstancesTab add-another failed", err, { plantId });
      toast.error("Couldn't add another — try again.");
    } finally {
      setAdding(false);
    }
  };

  /**
   * Delete an instance — hard delete. Used for instances the user wants
   * permanently gone (mistaken add, test row, etc.). The "End of Life"
   * path is the recommended way to retire a plant that actually lived —
   * Delete is for rows that shouldn't exist at all.
   */
  const handleDelete = async (row: InventoryItemRow) => {
    setDeleteInFlight(true);
    try {
      const { error: deleteErr } = await supabase
        .from("inventory_items")
        .delete()
        .eq("id", row.id);
      if (deleteErr) throw deleteErr;
      setItems((prev) => prev.filter((i) => i.id !== row.id));
      toast.success("Instance deleted.");
      setDeletingRow(null);
    } catch (err: any) {
      Logger.error("PlantInstancesTab delete failed", err, { rowId: row.id });
      toast.error("Couldn't delete — try again.");
    } finally {
      setDeleteInFlight(false);
    }
  };

  const summary = useMemo(() => {
    const planted = items.filter((i) => i.status === "Planted").length;
    const unplanted = items.filter((i) => i.status === "Unplanted").length;
    const unassignedButPlanted = items.filter(
      (i) => i.status === "Planted" && !i.area_id,
    ).length;
    return { planted, unplanted, unassignedButPlanted, total: items.length };
  }, [items]);

  return (
    <div data-testid="plant-instances-tab" className="space-y-3">
      {/* Senescence cross-link — surfaces ended instances of this species
          so users don't lose track of them after End of Life. */}
      {endedCount > 0 && (
        <button
          type="button"
          onClick={() => navigate(`/shed?tab=senescence&plant=${plantId}`)}
          data-testid="plant-instances-senescence-link"
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-2xl bg-emerald-50 border border-emerald-100 text-xs font-bold text-emerald-900 hover:bg-emerald-100 transition-colors"
        >
          <Leaf size={13} className="shrink-0" />
          <span className="flex-1 text-left">
            {endedCount === 1
              ? "1 ended instance"
              : `${endedCount} ended instances`} — view in Senescence
          </span>
          <ArrowRight size={13} />
        </button>
      )}

      {/* Header — quick summary + add button */}
      <div className="flex items-center justify-between gap-3 mb-1">
        <p className="text-xs text-rhozly-on-surface/60">
          {summary.total === 0
            ? "No instances yet."
            : summary.total === 1
            ? "1 instance"
            : `${summary.total} instances`}
          {summary.unassignedButPlanted > 0 && (
            <span className="text-rhozly-on-surface/40">
              {" "}
              · {summary.unassignedButPlanted} not placed
            </span>
          )}
        </p>
        <button
          type="button"
          data-testid="plant-instances-add-another"
          onClick={handleAddAnother}
          disabled={adding}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rhozly-primary/10 text-rhozly-primary text-[10px] font-black uppercase tracking-widest hover:bg-rhozly-primary/15 disabled:opacity-50 transition"
        >
          {adding ? <Loader2 className="animate-spin" size={12} /> : <Plus size={12} />}
          Add another
        </button>
      </div>

      {loading && (
        <div className="flex items-center gap-2 px-2 py-6 text-sm text-rhozly-on-surface/55 justify-center">
          <Loader2 size={14} className="animate-spin" />
          Loading instances…
        </div>
      )}

      {error && !loading && (
        <div className="px-3 py-2.5 rounded-2xl bg-red-50 border border-red-100 text-xs text-red-800">
          {error}
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div
          data-testid="plant-instances-empty"
          className="rounded-2xl bg-white border border-rhozly-outline/15 p-5 text-center"
        >
          <div className="w-10 h-10 rounded-2xl bg-rhozly-primary/10 text-rhozly-primary inline-flex items-center justify-center mb-2">
            <Inbox size={18} />
          </div>
          <p className="text-sm font-black text-rhozly-on-surface mb-1">
            No instances yet
          </p>
          <p className="text-[11px] text-rhozly-on-surface/55 leading-snug mb-3">
            Tap <span className="font-bold">Add another</span> to create your first {plantName} instance — you can place it in an area later.
          </p>
        </div>
      )}

      {!loading && !error && items.length > 0 && (
        <ul
          data-testid="plant-instances-list"
          className="flex flex-col gap-2"
        >
          {items.map((it) => {
            const label = it.nickname?.trim() || it.identifier || `${plantName} instance`;
            const isUnassigned = !it.area_id;
            const statusTone =
              it.status === "Planted"
                ? "text-emerald-700 bg-emerald-50 border-emerald-100"
                : "text-amber-800 bg-amber-50 border-amber-100";
            return (
              <li
                key={it.id}
                data-testid={`plant-instance-row-${it.id}`}
                className="rounded-2xl bg-white border border-rhozly-outline/15 hover:border-rhozly-primary/40 transition-colors p-3 flex items-start gap-3"
              >
                <button
                  type="button"
                  onClick={() => setEditing(it)}
                  data-testid={`plant-instance-row-open-${it.id}`}
                  aria-label={`Open ${label}`}
                  className="flex-1 min-w-0 flex items-start gap-3 text-left active:scale-[0.99] transition-transform"
                >
                  <div className="shrink-0 w-10 h-10 rounded-xl bg-rhozly-primary/10 text-rhozly-primary flex items-center justify-center">
                    <Sprout size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-display font-black text-rhozly-on-surface text-sm leading-tight truncate">
                      {label}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${statusTone}`}
                      >
                        {it.status}
                      </span>
                      {isUnassigned ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-rhozly-surface-low text-rhozly-on-surface/55 border border-rhozly-outline/15">
                          <MapPin size={10} />
                          Just in your garden
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-100">
                          <MapPin size={10} />
                          {it.area_name}
                          {it.location_name && (
                            <span className="text-sky-700/60 normal-case font-bold">
                              {" · "}
                              {it.location_name}
                            </span>
                          )}
                        </span>
                      )}
                      {it.planted_at && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rhozly-on-surface/55">
                          <Calendar size={10} />
                          {shortDate(it.planted_at)}
                        </span>
                      )}
                      {it.growth_state && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rhozly-on-surface/55">
                          <Hash size={10} />
                          {it.growth_state}
                        </span>
                      )}
                    </div>
                  </div>
                </button>

                {/* Per-row actions. End of Life is the canonical "retire
                    this plant" path — opens the full lifecycle-complete
                    modal (closing note + photo + natural-end flag + optional
                    AI analysis). Delete is the fast-path for mistaken adds
                    that don't deserve any ceremony — gated by a destructive
                    ConfirmModal. */}
                <div className="flex items-center gap-1 shrink-0 self-center">
                  <button
                    type="button"
                    onClick={() => setEndingLifecycle(it)}
                    aria-label={`Mark ${label} end of life`}
                    title="Mark this instance's life cycle complete"
                    data-testid={`plant-instance-row-end-of-life-${it.id}`}
                    className="w-9 h-9 flex items-center justify-center rounded-xl text-rhozly-on-surface/40 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                  >
                    <Leaf size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeletingRow(it)}
                    aria-label={`Delete ${label}`}
                    title="Delete this instance"
                    data-testid={`plant-instance-row-delete-${it.id}`}
                    className="w-9 h-9 flex items-center justify-center rounded-xl text-rhozly-on-surface/40 hover:text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 size={15} />
                  </button>
                  <ChevronRight size={14} className="text-rhozly-on-surface/25 ml-0.5" />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editing && (
        <InstanceEditModal
          homeId={homeId}
          instance={editing as unknown as Record<string, unknown>}
          currentAreaId={editing.area_id ?? ""}
          aiEnabled={!!aiEnabled}
          isPremium={!!isPremium}
          onClose={() => setEditing(null)}
          onUpdate={() => {
            setEditing(null);
            fetchItems();
          }}
          onTasksUpdated={fetchItems}
        />
      )}

      {/* End of Life — the canonical "retire this plant" path. Captures
          closing note + photo + natural-end flag and optionally runs the
          Sage+ AI analysis. Pairs with LifecycleAnalysisModal afterward. */}
      {endingLifecycle && (
        <LifecycleCompleteModal
          isOpen
          instanceId={endingLifecycle.id}
          homeId={homeId}
          plantName={
            endingLifecycle.identifier ||
            endingLifecycle.nickname ||
            plantName
          }
          aiEnabled={!!aiEnabled}
          onClose={() => setEndingLifecycle(null)}
          onCompleted={({ wasNaturalEnd, analysis }) => {
            const name =
              endingLifecycle.identifier ||
              endingLifecycle.nickname ||
              plantName;
            setItems((prev) =>
              prev.filter((i) => i.id !== endingLifecycle.id),
            );
            setEndingLifecycle(null);
            setLifecycleResult({
              open: true,
              plantName: name,
              wasNaturalEnd,
              analysis,
            });
          }}
        />
      )}

      <LifecycleAnalysisModal
        isOpen={lifecycleResult.open}
        wasNaturalEnd={lifecycleResult.wasNaturalEnd}
        analysis={lifecycleResult.analysis}
        plantName={lifecycleResult.plantName}
        aiEnabled={!!aiEnabled}
        onClose={() =>
          setLifecycleResult({
            open: false,
            plantName: "",
            wasNaturalEnd: false,
            analysis: null,
          })
        }
      />

      {/* Delete — destructive fast-path for mistaken adds. */}
      <ConfirmModal
        isOpen={!!deletingRow}
        onClose={() => {
          if (!deleteInFlight) setDeletingRow(null);
        }}
        onConfirm={() => {
          if (deletingRow) handleDelete(deletingRow);
        }}
        isLoading={deleteInFlight}
        isDestructive
        title={`Delete ${deletingRow?.identifier || deletingRow?.nickname || plantName}?`}
        description="This permanently removes the instance and all of its journal entries, tasks and photos. Can't be undone. If you want to retire a plant whose life cycle has ended, use the leaf icon for End of Life instead."
        confirmText="Delete"
      />
    </div>
  );
}
