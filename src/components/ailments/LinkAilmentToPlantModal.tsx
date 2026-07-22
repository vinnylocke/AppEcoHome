import React, { useEffect, useState } from "react";
import { X, Loader2, Search, CheckCircle2 } from "lucide-react";
import { createPortal } from "react-dom";
import { toast } from "react-hot-toast";
import { supabase } from "../../lib/supabase";
import { AutomationEngine } from "../../lib/automationEngine";
import { logEvent, EVENT } from "../../events/registry";
import { getLocalDateString } from "../../lib/taskEngine";
import { Logger } from "../../lib/errorHandler";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { usePermissions } from "../../context/HomePermissionsContext";
import { PlantInitialTile } from "../ui/PlantInitialTile";
import type { Ailment } from "../AilmentWatchlist";

interface LiveInstance {
  id: string;
  home_id: string;
  location_id: string | null;
  area_id: string | null;
  plant_name: string;
  nickname: string | null;
  identifier: string;
  area_name: string | null;
}

interface Props {
  homeId: string;
  /** The HOME watchlist row being linked (must already exist — the host
   *  ensures the ailment is watched before opening this picker). */
  ailment: Ailment;
  onClose: () => void;
  /** Fired after a successful link so hosts can refresh affected counts. */
  onLinked?: () => void;
}

/**
 * Hub v3 Stage E — "Link to a plant": the INVERSE of LinkAilmentModal.
 * That modal picks ailments for a fixed plant instance; this one picks live
 * plant instances for a fixed ailment. The insert / automation / event
 * payloads mirror LinkAilmentModal.handleLink exactly so downstream flows
 * (pest-risk refresh, ailment automations, event log) behave identically.
 */
export default function LinkAilmentToPlantModal({ homeId, ailment, onClose, onLinked }: Props) {
  const { can } = usePermissions();
  const trapRef = useFocusTrap<HTMLDivElement>(true);
  const [instances, setInstances] = useState<LiveInstance[]>([]);
  const [alreadyLinked, setAlreadyLinked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [linking, setLinking] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const load = async () => {
      const [instRes, linksRes] = await Promise.all([
        supabase
          .from("inventory_items")
          .select("id, home_id, location_id, area_id, plant_name, nickname, identifier, area_name")
          .eq("home_id", homeId)
          .is("ended_at", null)
          .neq("status", "Archived")
          .order("plant_name"),
        supabase
          .from("plant_instance_ailments")
          .select("plant_instance_id")
          .eq("ailment_id", ailment.id)
          .eq("status", "active"),
      ]);
      if (instRes.error) Logger.warn("Link-to-plant: instances load failed", { error: instRes.error });
      if (linksRes.error) Logger.warn("Link-to-plant: links load failed", { error: linksRes.error });
      setInstances((instRes.data ?? []) as LiveInstance[]);
      setAlreadyLinked(new Set((linksRes.data ?? []).map((r: any) => r.plant_instance_id)));
      setLoading(false);
    };
    load();
  }, [homeId, ailment.id]);

  const toggle = (id: string) => {
    if (alreadyLinked.has(id)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleLink = async () => {
    if (!can("ailments.add")) {
      toast.error("You don't have permission to add ailments.");
      return;
    }
    if (selected.size === 0) {
      toast.error("Select at least one plant.");
      return;
    }
    setLinking(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const today = getLocalDateString(new Date());
      const picked = instances.filter((i) => selected.has(i.id));

      const rows = picked.map((inst) => ({
        plant_instance_id: inst.id,
        ailment_id: ailment.id,
        home_id: homeId,
        linked_by: user?.id ?? null,
        status: "active",
        linked_at: new Date().toISOString(),
      }));
      // UPSERT on the (plant_instance_id, ailment_id) unique key: a plant
      // whose earlier link was RESOLVED stays selectable — re-linking flips
      // it back to active with a fresh linked_at (a plain insert would 23505
      // and fail the whole batch — review catch).
      const { error: linkError } = await supabase
        .from("plant_instance_ailments")
        .upsert(rows, { onConflict: "plant_instance_id,ailment_id" });
      if (linkError) throw linkError;

      supabase.functions.invoke("generate-pest-risk", { body: { homeId } }).catch(() => {});
      // SEQUENTIAL, not Promise.all: the engine's blueprint dedupe reads
      // (ailment_id, area_id) then inserts — with a fixed ailment, two picks
      // in the same area racing concurrently would both read-miss and both
      // insert duplicate blueprints + tasks (review catch). Run in order so
      // the second call finds the first's blueprint and appends instead.
      for (const inst of picked) {
        await AutomationEngine.applyAilmentAutomations(
          // Unplanted instances have NULL area/location — the columns are
          // nullable in task_blueprints, so null passes through cleanly
          // (an empty string would fail the uuid cast). The engine's
          // signature just predates nullable callers.
          {
            id: inst.id,
            home_id: inst.home_id,
            location_id: inst.location_id as unknown as string,
            area_id: inst.area_id as unknown as string,
          },
          ailment,
          today,
        );
      }
      picked.forEach((inst) =>
        logEvent(EVENT.AILMENT_LINKED, {
          ailment_id: ailment.id,
          ailment_name: ailment.name,
          ailment_type: ailment.type,
          plant_name: inst.plant_name,
          identifier: inst.identifier,
        }),
      );
      toast.success(`Linked to ${picked.length} plant${picked.length > 1 ? "s" : ""} and scheduled tasks.`);
      onLinked?.();
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Could not link ailment.");
    } finally {
      setLinking(false);
    }
  };

  const filtered = instances.filter((i) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      i.plant_name.toLowerCase().includes(q) ||
      (i.nickname ?? "").toLowerCase().includes(q) ||
      (i.area_name ?? "").toLowerCase().includes(q)
    );
  });

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/40 animate-in fade-in duration-150">
      <div
        ref={trapRef}
        role="dialog"
        aria-label={`Link ${ailment.name} to a plant`}
        data-testid="link-ailment-to-plant-modal"
        className="bg-rhozly-bg w-full sm:max-w-lg max-h-[85vh] flex flex-col rounded-t-3xl sm:rounded-3xl shadow-overlay animate-in slide-in-from-bottom-4 duration-200"
      >
        <div className="shrink-0 flex items-start justify-between px-5 pt-4 pb-2">
          <div className="min-w-0">
            <h3 className="text-lg font-black text-rhozly-on-surface truncate">Link to a plant</h3>
            <p className="text-xs font-bold text-rhozly-on-surface/50 truncate">
              Which plants show signs of {ailment.name}?
            </p>
          </div>
          <button
            type="button"
            data-testid="link-ailment-to-plant-close"
            aria-label="Close"
            onClick={onClose}
            className="p-2.5 -mr-1 rounded-control text-rhozly-on-surface/60 can-hover:hover:bg-rhozly-surface-low active:scale-[0.94] transition"
          >
            <X size={20} />
          </button>
        </div>

        <div className="shrink-0 px-5 pb-2">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-rhozly-on-surface/35" />
            <input
              type="text"
              data-testid="link-ailment-plant-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search your plants…"
              className="w-full pl-9 pr-3 py-2.5 rounded-control bg-white border border-rhozly-outline/15 text-sm font-bold placeholder:text-rhozly-on-surface/35 focus:outline-none focus:border-rhozly-primary/50"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar px-5 pb-2 space-y-1.5">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm font-bold text-rhozly-on-surface/50">
              <Loader2 size={16} className="animate-spin text-rhozly-primary" /> Loading your plants…
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm font-bold text-rhozly-on-surface/50">
              {instances.length === 0
                ? "No live plants in your garden yet — plant something first."
                : "No plants match that search."}
            </p>
          ) : (
            filtered.map((inst) => {
              const linked = alreadyLinked.has(inst.id);
              const isSelected = selected.has(inst.id);
              return (
                <button
                  key={inst.id}
                  type="button"
                  data-testid={`link-ailment-instance-${inst.id}`}
                  disabled={linked}
                  aria-pressed={isSelected}
                  onClick={() => toggle(inst.id)}
                  className={`w-full flex items-center gap-3 pl-3 pr-3 py-2.5 min-h-[64px] rounded-2xl border text-left transition active:scale-[0.99] ${
                    linked
                      ? "bg-rhozly-surface-low border-rhozly-outline/10 opacity-60"
                      : isSelected
                        ? "bg-rhozly-primary/10 border-rhozly-primary ring-1 ring-rhozly-primary/30"
                        : "bg-white border-rhozly-outline/15 can-hover:hover:border-rhozly-primary/40"
                  }`}
                >
                  <div className="w-11 h-11 shrink-0 rounded-2xl overflow-hidden">
                    <PlantInitialTile plant={{ common_name: inst.plant_name }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-sm text-rhozly-on-surface truncate">
                      {inst.nickname || inst.plant_name}
                      {inst.nickname ? <span className="font-bold text-rhozly-on-surface/45"> · {inst.plant_name}</span> : null}
                    </p>
                    <p className="text-xs font-bold text-rhozly-on-surface/45 truncate">
                      {inst.area_name || "Unplanted"} · {inst.identifier}
                    </p>
                  </div>
                  {linked ? (
                    <span className="shrink-0 inline-flex items-center gap-1 text-2xs font-black text-status-watch-ink">
                      <CheckCircle2 size={13} /> Linked
                    </span>
                  ) : (
                    <span
                      className={`shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition ${
                        isSelected ? "bg-rhozly-primary border-rhozly-primary text-white" : "border-rhozly-outline/30"
                      }`}
                    >
                      {isSelected && <CheckCircle2 size={14} />}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>

        <div className="shrink-0 px-5 py-3 border-t border-rhozly-outline/10" style={{ paddingBottom: "max(env(safe-area-inset-bottom), 12px)" }}>
          <button
            type="button"
            data-testid="link-ailment-to-plant-confirm"
            onClick={handleLink}
            disabled={linking || selected.size === 0}
            className="w-full py-3.5 bg-rhozly-primary text-white rounded-control font-black text-sm active:scale-[0.99] transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {linking && <Loader2 size={15} className="animate-spin" />}
            {selected.size > 0 ? `Link ${selected.size} plant${selected.size > 1 ? "s" : ""}` : "Link plants"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
