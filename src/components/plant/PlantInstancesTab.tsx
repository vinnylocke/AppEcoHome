import React, { useCallback, useEffect, useMemo, useState } from "react";
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
  ArchiveRestore,
  Package,
} from "lucide-react";
import toast from "react-hot-toast";
import { supabase } from "../../lib/supabase";
import { Logger } from "../../lib/errorHandler";
import InstanceEditModal from "../InstanceEditModal";
import NurseryPacketsForPlant from "../nursery/NurseryPacketsForPlant";
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
  /** Hub v3 Stage B — the tab IS "In your garden": ended records render
   *  inline as a HISTORY timeline (with restore) and live sowings surface
   *  in an IN THE NURSERY section. */
  const [endedRows, setEndedRows] = useState<Array<InventoryItemRow & { ended_at: string; was_natural_end: boolean | null; end_summary: string | null; closing_photo_url?: string | null }>>([]);
  const [sowings, setSowings] = useState<Array<{ id: string; status: string; sown_on: string | null; sown_count: number | null; germinated_count: number | null; variety: string | null; vendor: string | null }>>([]);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [pendingRestore, setPendingRestore] = useState<(InventoryItemRow & { ended_at: string }) | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [{ data, error: queryErr }, endedRes, sowingRes] = await Promise.all([
        supabase
          .from("inventory_items")
          .select(
            "id, plant_id, plant_name, nickname, identifier, status, area_id, area_name, location_id, location_name, planted_at, is_established, growth_state, environment, from_sowing_id",
          )
          .eq("home_id", homeId)
          .eq("plant_id", String(plantId))
          .is("ended_at", null)
          .order("planted_at", { ascending: false, nullsFirst: false })
          .order("identifier", { ascending: true }),
        // HISTORY — this species' closed lifecycles, newest first.
        supabase
          .from("inventory_items")
          .select(
            "id, plant_id, plant_name, nickname, identifier, status, area_id, area_name, location_id, location_name, planted_at, is_established, growth_state, environment, ended_at, was_natural_end, end_summary",
          )
          .eq("home_id", homeId)
          .eq("plant_id", String(plantId))
          .not("ended_at", "is", null)
          .order("ended_at", { ascending: false })
          .limit(50),
        // IN THE NURSERY — live sowings whose packet is this plant.
        supabase
          .from("seed_sowings")
          .select("id, status, sown_on, sown_count, germinated_count, observed_on, seed_packets!inner(plant_id, variety, vendor)")
          .eq("home_id", homeId)
          .eq("seed_packets.plant_id", plantId)
          .in("status", ["sown", "germinated"]),
      ]);
      if (queryErr) throw queryErr;
      // Enhancement sections fail soft but never silently (repo .error rule).
      if (endedRes.error) Logger.warn("PlantInstancesTab ended-rows query failed", { err: endedRes.error, plantId });
      if (sowingRes.error) Logger.warn("PlantInstancesTab sowings query failed", { err: sowingRes.error, plantId });
      setItems((data ?? []) as InventoryItemRow[]);
      // Closing photos — one query for every ended row's "Lifecycle
      // complete*" journal entry (ported from the retired SenescenceTab).
      const ended = ((endedRes.data ?? []) as any[]).map((r) => r) as any[];
      if (ended.length > 0) {
        const { data: photoRows, error: photoErr } = await supabase
          .from("plant_journals")
          .select("inventory_item_id, image_url")
          .in("inventory_item_id", ended.map((r) => r.id))
          .not("image_url", "is", null)
          .like("subject", "Lifecycle complete%")
          .order("created_at", { ascending: false });
        if (photoErr) Logger.warn("PlantInstancesTab closing-photo query failed", { err: photoErr, plantId });
        const byInstance = new Map<string, string>();
        for (const row of (photoRows ?? []) as Array<{ inventory_item_id: string; image_url: string | null }>) {
          if (!byInstance.has(row.inventory_item_id) && row.image_url) {
            byInstance.set(row.inventory_item_id, row.image_url);
          }
        }
        for (const r of ended) r.closing_photo_url = byInstance.get(r.id) ?? null;
      }
      setEndedRows(ended as any);
      setSowings(
        ((sowingRes.data ?? []) as any[]).map((r) => ({
          id: r.id,
          status: r.status,
          sown_on: r.sown_on,
          sown_count: r.sown_count,
          germinated_count: r.germinated_count,
          variety: r.seed_packets?.variety ?? null,
          vendor: r.seed_packets?.vendor ?? null,
        })),
      );
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

  /** Restore an ended record to active care — Senescence semantics verbatim:
   *  null the EoL triple, status→Planted, journal the round trip, re-fire
   *  generate-tasks (routines resume; none are re-created). */
  const handleRestore = async (row: InventoryItemRow & { ended_at: string }) => {
    setRestoringId(row.id);
    const name = row.identifier || row.nickname || row.plant_name || plantName;
    try {
      const { error: updateErr } = await supabase
        .from("inventory_items")
        .update({ ended_at: null, was_natural_end: null, end_summary: null, status: "Planted" })
        .eq("id", row.id);
      if (updateErr) throw updateErr;
      await supabase.from("plant_journals").insert({
        home_id: homeId,
        inventory_item_id: row.id,
        subject: "Restored from Senescence",
        description: `${name} is back in active care.`,
      });
      supabase.functions
        .invoke("generate-tasks", { body: { home_id: homeId } })
        .catch((err) => Logger.error("PlantInstancesTab restore generate-tasks failed", err, { rowId: row.id }));
      toast.success(`Restored ${name} to active plants.`);
      fetchItems();
    } catch (err: any) {
      Logger.error("PlantInstancesTab restore failed", err, { rowId: row.id });
      toast.error("Couldn't restore — try again.");
    } finally {
      setRestoringId(null);
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

      {!loading && !error && items.length === 0 && endedRows.length === 0 && sowings.length === 0 && (
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

      {/* ── IN THE NURSERY — live sowings of this plant (Hub v3 Stage B).
          Packet management lives just below in the packets strip. */}
      {(sowings.length > 0) && (
        <div data-testid="plant-garden-nursery" className="pt-2">
          <p className="text-2xs font-black uppercase tracking-widest text-rhozly-on-surface/40 px-1 mb-1.5">
            In the nursery
          </p>
          <ul className="flex flex-col gap-2">
            {sowings.map((sw) => (
              <li
                key={sw.id}
                data-testid={`plant-sowing-row-${sw.id}`}
                className="rounded-2xl bg-white border border-rhozly-outline/15 p-3 flex items-center gap-3"
              >
                <div className="shrink-0 w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                  <Package size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-display font-black text-rhozly-on-surface text-sm leading-tight truncate">
                    {sw.variety || plantName}
                  </p>
                  <p className="text-[11px] font-bold text-rhozly-on-surface/55 truncate">
                    {sw.status === "germinated"
                      ? `Germinated${sw.germinated_count != null && sw.sown_count ? ` · ${sw.germinated_count}/${sw.sown_count}` : ""}`
                      : `Sown${sw.sown_count ? ` · ${sw.sown_count} seeds` : ""}`}
                    {sw.sown_on ? ` · ${shortDate(sw.sown_on)}` : ""}
                    {sw.vendor ? ` · ${sw.vendor}` : ""}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Seed packets for this plant — moved here from the Care tab (the
          nursery lives WITH the plant now). */}
      <NurseryPacketsForPlant homeId={homeId} plantId={plantId} />

      {/* ── HISTORY — ended records, inline with restore (absorbs the old
          Senescence link-out; same restore semantics verbatim). */}
      {endedRows.length > 0 && (
        <div data-testid="plant-garden-history" className="pt-2">
          <p className="text-2xs font-black uppercase tracking-widest text-rhozly-on-surface/40 px-1 mb-1.5">
            History
          </p>
          <ul className="flex flex-col gap-2">
            {endedRows.map((row) => {
              const label = row.nickname?.trim() || row.identifier || `${plantName} instance`;
              return (
                <li
                  key={row.id}
                  data-testid={`plant-history-row-${row.id}`}
                  className="rounded-2xl bg-rhozly-surface-lowest border border-rhozly-outline/10 p-3 flex items-start gap-3 can-hover:hover:border-rhozly-primary/30 transition-colors"
                >
                  {/* v3 feedback #4 — the row opens the full end-of-life
                      record again (InstanceEditModal: amend natural/other,
                      edit the summary, the AI lifecycle analysis, journal). */}
                  <button
                    type="button"
                    data-testid={`plant-history-open-${row.id}`}
                    aria-label={`Open the end-of-life record for ${label}`}
                    onClick={() => setEditing(row as unknown as InventoryItemRow)}
                    className="flex-1 min-w-0 flex items-start gap-3 text-left active:scale-[0.995] transition-transform"
                  >
                    <div className="shrink-0 w-10 h-10 rounded-xl bg-rhozly-surface-low text-rhozly-on-surface/40 flex items-center justify-center overflow-hidden">
                      {row.closing_photo_url ? (
                        <img src={row.closing_photo_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <Leaf size={16} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-display font-black text-rhozly-on-surface/80 text-sm leading-tight truncate">{label}</p>
                      <p className="text-[11px] font-bold text-rhozly-on-surface/50">
                        Ended {shortDate(row.ended_at)}
                        {row.was_natural_end === true ? " · Natural end" : row.was_natural_end === false ? " · Other" : ""}
                        {row.area_name ? ` · ${row.area_name}` : ""}
                      </p>
                      {row.end_summary && (
                        <p className="text-[11px] text-rhozly-on-surface/55 leading-snug mt-1 line-clamp-2">{row.end_summary}</p>
                      )}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingRestore(row)}
                    disabled={restoringId === row.id}
                    aria-label={`Restore ${label} to active care`}
                    title="Restore to active care"
                    data-testid={`plant-history-restore-${row.id}`}
                    className="shrink-0 w-11 h-11 self-center flex items-center justify-center rounded-xl text-rhozly-on-surface/40 can-hover:hover:text-emerald-700 can-hover:hover:bg-emerald-50 transition-colors disabled:opacity-50"
                  >
                    {restoringId === row.id ? <Loader2 size={16} className="animate-spin" /> : <ArchiveRestore size={16} />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
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
            // Hub v3 Stage B (review catch): the ended row must MOVE to the
            // History section, not vanish — refetch so it appears there.
            fetchItems();
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

      {/* Restore — confirm first (SenescenceTab parity; an accidental tap
          would also re-fire generate-tasks for the home). */}
      <ConfirmModal
        isOpen={!!pendingRestore}
        onClose={() => {
          if (!restoringId) setPendingRestore(null);
        }}
        onConfirm={() => {
          if (pendingRestore) {
            handleRestore(pendingRestore);
            setPendingRestore(null);
          }
        }}
        isLoading={!!restoringId}
        title={`Restore ${pendingRestore?.identifier || pendingRestore?.nickname || plantName}?`}
        description="This moves the record back to active care and resumes any routines linked to it."
        confirmText="Restore"
      />
    </div>
  );
}
