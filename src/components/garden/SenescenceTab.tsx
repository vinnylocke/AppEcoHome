import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Leaf,
  Loader2,
  MapPin,
  Calendar,
  Sparkles,
  ArchiveRestore,
  AlertCircle,
  Eye,
} from "lucide-react";
import toast from "react-hot-toast";
import { supabase } from "../../lib/supabase";
import { Logger } from "../../lib/errorHandler";
import { ConfirmModal } from "../ConfirmModal";
import InfoTooltip from "../InfoTooltip";
import EmptyState from "../shared/EmptyState";
import InstanceEditModal from "../InstanceEditModal";
import { usePersona } from "../../hooks/usePersona";

interface Props {
  homeId: string;
  aiEnabled?: boolean;
  isPremium?: boolean;
}

interface SenescenceRow {
  id: string;
  plant_id: string | null;
  plant_name: string | null;
  nickname: string | null;
  identifier: string | null;
  area_id: string | null;
  area_name: string | null;
  location_id: string | null;
  location_name: string | null;
  status: string;
  planted_at: string | null;
  ended_at: string;
  was_natural_end: boolean | null;
  end_summary: string | null;
  /** Loaded lazily from `plant_journals` — the closing photo if any. */
  closing_photo_url?: string | null;
}

type Filter = "all" | "natural" | "not-natural";

function shortDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Senescence tab — first-class destination for instances whose life
 * cycle has ended. Distinct from The Shed's archived view (which lists
 * `plants` species records, not instances). Restore is reversible: it
 * nulls `ended_at` / `was_natural_end` / `end_summary`, flips status
 * back to "Planted", and re-fires `generate-tasks` so any existing
 * routines start materialising tasks again. Routines themselves are
 * not recreated — the user may have customised them so we trust what's
 * already there.
 */
export default function SenescenceTab({ homeId, aiEnabled, isPremium }: Props) {
  const persona = usePersona();
  const [params, setParams] = useSearchParams();
  const plantFilter = params.get("plant");

  const [rows, setRows] = useState<SenescenceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [restoring, setRestoring] = useState<SenescenceRow | null>(null);
  const [restoreInFlight, setRestoreInFlight] = useState(false);
  const [opening, setOpening] = useState<SenescenceRow | null>(null);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from("inventory_items")
        .select(
          "id, plant_id, plant_name, nickname, identifier, area_id, area_name, location_id, location_name, status, planted_at, ended_at, was_natural_end, end_summary",
        )
        .eq("home_id", homeId)
        .not("ended_at", "is", null)
        .order("ended_at", { ascending: false })
        .limit(200);
      if (plantFilter) {
        query = query.eq("plant_id", plantFilter);
      }
      const { data, error: queryErr } = await query;
      if (queryErr) throw queryErr;
      const baseRows = (data ?? []) as SenescenceRow[];

      // Lazy-load closing photos from plant_journals — one query for
      // every row's "Lifecycle complete*" entry. Skipped on rows without
      // a recent ended_at; the join would be cheap but the linear loop
      // here keeps the query simple.
      if (baseRows.length > 0) {
        const { data: photoRows } = await supabase
          .from("plant_journals")
          .select("inventory_item_id, image_url")
          .in(
            "inventory_item_id",
            baseRows.map((r) => r.id),
          )
          .not("image_url", "is", null)
          .like("subject", "Lifecycle complete%")
          .order("created_at", { ascending: false });
        const byInstance = new Map<string, string>();
        for (const row of (photoRows ?? []) as Array<{
          inventory_item_id: string;
          image_url: string | null;
        }>) {
          if (!byInstance.has(row.inventory_item_id) && row.image_url) {
            byInstance.set(row.inventory_item_id, row.image_url);
          }
        }
        for (const r of baseRows) {
          r.closing_photo_url = byInstance.get(r.id) ?? null;
        }
      }

      setRows(baseRows);
    } catch (err: any) {
      Logger.error("SenescenceTab fetch failed", err, { homeId, plantFilter });
      setError(err?.message ?? "Couldn't load Senescence list.");
    } finally {
      setLoading(false);
    }
  }, [homeId, plantFilter]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const filtered = useMemo(() => {
    if (filter === "all") return rows;
    if (filter === "natural") return rows.filter((r) => r.was_natural_end === true);
    return rows.filter((r) => r.was_natural_end !== true);
  }, [rows, filter]);

  const counts = useMemo(() => {
    const natural = rows.filter((r) => r.was_natural_end === true).length;
    return { all: rows.length, natural, notNatural: rows.length - natural };
  }, [rows]);

  const handleRestore = async (row: SenescenceRow) => {
    setRestoreInFlight(true);
    const name = row.identifier || row.nickname || row.plant_name || "this plant";
    try {
      const { error: updateErr } = await supabase
        .from("inventory_items")
        .update({
          ended_at: null,
          was_natural_end: null,
          end_summary: null,
          status: "Planted",
        })
        .eq("id", row.id);
      if (updateErr) throw updateErr;

      // Journal a "Restored from Senescence" entry so the history thread
      // is unbroken. No closing-entry to delete — the original lifecycle
      // entry stays so the round trip is visible in the journal.
      await supabase.from("plant_journals").insert({
        home_id: homeId,
        inventory_item_id: row.id,
        subject: "Restored from Senescence",
        description: `${name} is back in active care.`,
      });

      // Re-run `generate-tasks` so any existing routines linked to this
      // instance pick back up. We DON'T re-create routines — the user
      // may have customised the ones that were there.
      supabase.functions
        .invoke("generate-tasks", { body: { home_id: homeId } })
        .catch((err) =>
          Logger.error("SenescenceTab restore generate-tasks failed", err, { rowId: row.id }),
        );

      setRows((prev) => prev.filter((r) => r.id !== row.id));
      toast.success(`Restored ${name} to active plants.`);
      setRestoring(null);
    } catch (err: any) {
      Logger.error("SenescenceTab restore failed", err, { rowId: row.id });
      toast.error("Couldn't restore — try again.");
    } finally {
      setRestoreInFlight(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────

  return (
    <div data-testid="senescence-tab" className="space-y-5 max-w-3xl mx-auto px-4 py-6">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-rhozly-on-surface flex items-center gap-2">
            <Leaf size={22} className="text-rhozly-primary" /> Senescence
            <InfoTooltip
              content={
                persona === "experienced"
                  ? "Botanical: the natural ageing phase of a plant. Here it lists every instance you've marked as End of Life — keep records, run analyses, restore mistakes."
                  : "Senescence is the botany term for the last phase of a plant's life. This is where plants you've marked as End of Life live — alongside the closing notes, photos and any AI insights. You can bring one back here if you marked it by accident."
              }
              size={12}
            />
          </h1>
          <p className="text-sm font-bold text-rhozly-on-surface/40 mt-1">
            Plants whose life cycle has ended — with the records to look back on.
          </p>
        </div>
      </header>

      {plantFilter && (
        <button
          type="button"
          onClick={() => {
            const next = new URLSearchParams(params);
            next.delete("plant");
            setParams(next, { replace: true });
          }}
          className="text-xs font-bold text-rhozly-primary hover:underline"
        >
          Showing one plant only · clear filter
        </button>
      )}

      {/* Filter pills */}
      {rows.length > 0 && (
        <div className="flex gap-1.5 flex-wrap" role="tablist" aria-label="Filter Senescence">
          {(
            [
              { value: "all", label: "All", count: counts.all },
              { value: "natural", label: "Natural end", count: counts.natural },
              { value: "not-natural", label: "Other", count: counts.notNatural },
            ] as Array<{ value: Filter; label: string; count: number }>
          ).map((opt) => {
            const active = filter === opt.value;
            return (
              <button
                key={opt.value}
                role="tab"
                aria-selected={active}
                type="button"
                onClick={() => setFilter(opt.value)}
                data-testid={`senescence-filter-${opt.value}`}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                  active
                    ? "bg-rhozly-primary text-white border-rhozly-primary"
                    : "bg-white text-rhozly-on-surface/60 border-rhozly-outline/20 hover:border-rhozly-primary/40"
                }`}
              >
                {opt.label}
                <span
                  className={`text-[10px] font-black ml-0.5 ${
                    active ? "text-white/70" : "text-rhozly-on-surface/30"
                  }`}
                >
                  {opt.count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12 text-sm text-rhozly-on-surface/55 gap-2">
          <Loader2 size={16} className="animate-spin" /> Loading Senescence…
        </div>
      )}

      {error && !loading && (
        <div className="rounded-2xl bg-red-50 border border-red-200 p-3 text-xs font-bold text-red-700 flex items-start gap-2">
          <AlertCircle size={14} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <EmptyState
          size="lg"
          icon={<Leaf size={28} />}
          title="Nothing here yet"
          body="When a plant's life cycle ends, you'll see it remembered here — with its closing note, final photo and any AI insights you captured."
        />
      )}

      {!loading && !error && filtered.length === 0 && rows.length > 0 && (
        <p className="text-center text-sm font-bold text-rhozly-on-surface/40 py-6">
          No instances match this filter.
        </p>
      )}

      {filtered.length > 0 && (
        <ul className="space-y-2.5">
          {filtered.map((row) => {
            const name = row.identifier || row.nickname || row.plant_name || "Unnamed plant";
            return (
              <li
                key={row.id}
                data-testid={`senescence-row-${row.id}`}
                className="rounded-2xl bg-white border border-rhozly-outline/15 hover:border-rhozly-primary/40 transition-colors p-3 flex items-start gap-3"
              >
                {row.closing_photo_url ? (
                  <img
                    src={row.closing_photo_url}
                    alt=""
                    className="w-14 h-14 rounded-xl object-cover shrink-0 border border-rhozly-outline/10"
                  />
                ) : (
                  <div className="shrink-0 w-14 h-14 rounded-xl bg-rhozly-primary/10 text-rhozly-primary flex items-center justify-center">
                    <Leaf size={20} />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-display font-black text-rhozly-on-surface text-sm leading-tight truncate">
                    {name}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rhozly-on-surface/55">
                      <Calendar size={10} />
                      Ended {shortDate(row.ended_at)}
                    </span>
                    {row.was_natural_end ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-emerald-50 text-emerald-700 border border-emerald-100">
                        Natural end
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-amber-50 text-amber-700 border border-amber-100">
                        <Sparkles size={10} /> Other
                      </span>
                    )}
                    {row.area_name && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rhozly-on-surface/50">
                        <MapPin size={10} /> {row.area_name}
                      </span>
                    )}
                  </div>
                  {row.end_summary && (
                    <p className="text-xs font-medium text-rhozly-on-surface/60 mt-2 line-clamp-2">
                      {row.end_summary}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0 self-center">
                  <button
                    type="button"
                    onClick={() => setOpening(row)}
                    aria-label={`Open ${name}`}
                    title="Open instance"
                    data-testid={`senescence-row-open-${row.id}`}
                    className="w-11 h-11 flex items-center justify-center rounded-xl text-rhozly-on-surface/40 hover:text-rhozly-primary hover:bg-rhozly-primary/10 transition-colors"
                  >
                    <Eye size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setRestoring(row)}
                    aria-label={`Restore ${name}`}
                    title="Restore to active plants"
                    data-testid={`senescence-row-restore-${row.id}`}
                    className="w-11 h-11 flex items-center justify-center rounded-xl text-rhozly-on-surface/40 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                  >
                    <ArchiveRestore size={15} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {opening && (
        <InstanceEditModal
          homeId={homeId}
          instance={opening as unknown as Record<string, unknown>}
          currentAreaId={opening.area_id ?? ""}
          aiEnabled={!!aiEnabled}
          isPremium={!!isPremium}
          onClose={() => setOpening(null)}
          onUpdate={() => {
            setOpening(null);
            fetchRows();
          }}
          onTasksUpdated={fetchRows}
        />
      )}

      <ConfirmModal
        isOpen={!!restoring}
        onClose={() => {
          if (!restoreInFlight) setRestoring(null);
        }}
        onConfirm={() => {
          if (restoring) handleRestore(restoring);
        }}
        isLoading={restoreInFlight}
        isDestructive={false}
        title={`Restore ${restoring?.identifier || restoring?.nickname || restoring?.plant_name || "this plant"}?`}
        description="It'll reappear in your Plants and any existing routines will start generating tasks again. The closing note, final photo and any AI insights stay in the journal."
        confirmText="Restore"
      />
    </div>
  );
}
