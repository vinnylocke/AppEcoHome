import React, { useEffect, useState } from "react";
import { X, Plus, Trash2, Droplets, Loader2, Pencil, Check, Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { Logger } from "../../lib/errorHandler";
import toast from "react-hot-toast";

interface ZoneRow {
  id: string;
  name: string;
  colour: string;
  shape_ids: string[];
}

interface Props {
  homeId: string;
  layoutId: string;
  /** Shape IDs currently selected (primary + extra). Used for "save selection as zone". */
  selectedShapeIds: string[];
  onClose: () => void;
}

const COLOURS = ["#3b82f6", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6", "#ef4444"];

export default function GardenZoneSheet({ homeId, layoutId, selectedShapeIds, onClose }: Props) {
  const navigate = useNavigate();
  const [zones, setZones] = useState<ZoneRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [wateringId, setWateringId] = useState<string | null>(null);
  const [runningSprinklerId, setRunningSprinklerId] = useState<string | null>(null);
  const [valveCount, setValveCount] = useState<number>(0);

  useEffect(() => {
    // Count linked water valves to decide whether to show the smart-sprinkler CTA
    supabase.from("devices")
      .select("id", { count: "exact", head: true })
      .eq("home_id", homeId)
      .eq("device_type", "water_valve")
      .eq("is_active", true)
      .then(({ count }) => setValveCount(count ?? 0));
  }, [homeId]);

  async function runSmartSprinkler(zone: ZoneRow) {
    if (runningSprinklerId) return;
    setRunningSprinklerId(zone.id);
    try {
      const { data: devices } = await supabase
        .from("devices")
        .select("id, name")
        .eq("home_id", homeId)
        .eq("device_type", "water_valve")
        .eq("is_active", true)
        .limit(1);
      const valve = devices?.[0];
      if (!valve) {
        toast("Connect a smart sprinkler in Integrations first");
        return;
      }
      const { data, error } = await supabase.functions.invoke("integrations-ewelink-control", {
        body: { deviceId: valve.id, command: "turn_on", durationSeconds: 600 },
      });
      if (error) throw error;
      const ok = !data?.error;
      if (ok) toast.success(`${valve.name} on for 10 minutes`);
      else toast.error(data.error);
    } catch (err) {
      Logger.error("Failed to run smart sprinkler for zone", err);
      toast.error("Could not run sprinkler");
    } finally {
      setRunningSprinklerId(null);
    }
  }

  useEffect(() => { void fetchZones(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [layoutId]);

  async function fetchZones() {
    setLoading(true);
    try {
      const { data: zoneRows, error: ze } = await supabase
        .from("garden_zones")
        .select("id, name, colour")
        .eq("layout_id", layoutId)
        .order("created_at", { ascending: false });
      if (ze) throw ze;
      const ids = (zoneRows ?? []).map(z => z.id);
      let memberships: { zone_id: string; shape_id: string }[] = [];
      if (ids.length > 0) {
        const { data: ms } = await supabase
          .from("garden_zone_shapes")
          .select("zone_id, shape_id")
          .in("zone_id", ids);
        memberships = ms ?? [];
      }
      const byZone = new Map<string, string[]>();
      for (const m of memberships) {
        if (!byZone.has(m.zone_id)) byZone.set(m.zone_id, []);
        byZone.get(m.zone_id)!.push(m.shape_id);
      }
      setZones((zoneRows ?? []).map(z => ({ ...z, shape_ids: byZone.get(z.id) ?? [] })));
    } catch (err) {
      Logger.error("Failed to load garden zones", err);
    } finally {
      setLoading(false);
    }
  }

  async function createZone() {
    if (creating || selectedShapeIds.length === 0) return;
    setCreating(true);
    try {
      const { data: zone, error: ze } = await supabase
        .from("garden_zones")
        .insert({
          layout_id: layoutId,
          home_id: homeId,
          name: `Zone ${zones.length + 1}`,
          colour: COLOURS[zones.length % COLOURS.length],
        })
        .select("id")
        .single();
      if (ze) throw ze;
      const { error: me } = await supabase
        .from("garden_zone_shapes")
        .insert(selectedShapeIds.map(sid => ({ zone_id: zone.id, shape_id: sid })));
      if (me) throw me;
      toast.success("Zone created");
      await fetchZones();
    } catch (err) {
      Logger.error("Failed to create zone", err);
      toast.error("Could not create zone");
    } finally {
      setCreating(false);
    }
  }

  async function deleteZone(id: string) {
    try {
      const { error } = await supabase.from("garden_zones").delete().eq("id", id);
      if (error) throw error;
      setZones(prev => prev.filter(z => z.id !== id));
    } catch (err) {
      Logger.error("Failed to delete zone", err);
      toast.error("Could not delete zone");
    }
  }

  async function renameZone(id: string) {
    const name = renameValue.trim();
    if (!name) { setRenamingId(null); return; }
    try {
      const { error } = await supabase.from("garden_zones").update({ name, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
      setZones(prev => prev.map(z => z.id === id ? { ...z, name } : z));
    } catch (err) {
      Logger.error("Failed to rename zone", err);
    } finally {
      setRenamingId(null);
    }
  }

  async function setColour(id: string, colour: string) {
    try {
      await supabase.from("garden_zones").update({ colour, updated_at: new Date().toISOString() }).eq("id", id);
      setZones(prev => prev.map(z => z.id === id ? { ...z, colour } : z));
    } catch (err) {
      Logger.error("Failed to update zone colour", err);
    }
  }

  async function markZoneWatered(zone: ZoneRow) {
    setWateringId(zone.id);
    try {
      // Find linked areas via the shapes
      const { data: shapes } = await supabase
        .from("garden_shapes")
        .select("area_id")
        .in("id", zone.shape_ids);
      const areaIds = [...new Set((shapes ?? []).map(s => s.area_id).filter(Boolean))] as string[];
      if (areaIds.length === 0) {
        toast("No linked areas in this zone");
        return;
      }
      const { data: plants } = await supabase
        .from("inventory_items")
        .select("id")
        .in("area_id", areaIds)
        .eq("status", "Planted");
      const plantIds = (plants ?? []).map(p => p.id);
      if (plantIds.length === 0) {
        toast("No planted items in zone areas");
        return;
      }
      const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
      const { data: tasks } = await supabase
        .from("tasks")
        .select("id")
        .eq("home_id", homeId)
        .eq("type", "Watering")
        .overlaps("inventory_item_ids", plantIds)
        .neq("status", "Completed")
        .neq("status", "Skipped")
        .lte("due_date", todayEnd.toISOString());
      const taskIds = (tasks ?? []).map(t => t.id);
      if (taskIds.length === 0) {
        toast("No watering tasks due in this zone");
        return;
      }
      const { error } = await supabase
        .from("tasks")
        .update({ status: "Completed", completed_at: new Date().toISOString() })
        .in("id", taskIds);
      if (error) throw error;
      toast.success(`${taskIds.length} watering task${taskIds.length > 1 ? "s" : ""} marked done`);
    } catch (err) {
      Logger.error("Failed to mark zone watered", err);
      toast.error("Could not water zone");
    } finally {
      setWateringId(null);
    }
  }

  return (
    <div
      data-testid="garden-zone-sheet"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4"
    >
      <div className="bg-white rounded-3xl w-full max-w-md shadow-xl flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-rhozly-outline/10 shrink-0">
          <p className="font-black text-rhozly-on-surface">Watering Zones</p>
          <button
            data-testid="zone-sheet-close"
            onClick={onClose}
            aria-label="Close"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-rhozly-on-surface/40 hover:bg-rhozly-surface"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-4 space-y-3 overflow-y-auto flex-1">
          <button
            data-testid="zone-create-btn"
            onClick={createZone}
            disabled={creating || selectedShapeIds.length === 0}
            className="w-full flex items-center justify-center gap-2 min-h-[44px] rounded-2xl bg-rhozly-primary text-white text-xs font-black disabled:bg-rhozly-on-surface/15 disabled:text-rhozly-on-surface/40 transition-colors"
          >
            {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            {selectedShapeIds.length === 0
              ? "Select 1+ shapes to create a zone"
              : `Create Zone from ${selectedShapeIds.length} selected`}
          </button>

          {valveCount === 0 && zones.length > 0 && (
            <button
              data-testid="zone-integrations-link"
              onClick={() => { onClose(); navigate("/integrations"); }}
              className="w-full text-[11px] font-bold text-rhozly-on-surface/60 hover:text-rhozly-on-surface text-left px-1"
            >
              Connect a smart sprinkler in Integrations to control valves from here →
            </button>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 size={18} className="animate-spin text-rhozly-on-surface/30" />
            </div>
          ) : zones.length === 0 ? (
            <p className="text-center text-[11px] font-bold text-rhozly-on-surface/40 py-4">
              No zones yet. Shift-click shapes on the canvas to select multiple, then tap "Create Zone".
            </p>
          ) : (
            zones.map(zone => (
              <div
                key={zone.id}
                data-testid={`zone-row-${zone.id}`}
                className="bg-rhozly-surface rounded-2xl p-3 space-y-2 border border-rhozly-outline/10"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: zone.colour }}
                  />
                  {renamingId === zone.id ? (
                    <>
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") renameZone(zone.id); if (e.key === "Escape") setRenamingId(null); }}
                        className="flex-1 bg-white rounded-lg px-2 py-1 text-xs font-black text-rhozly-on-surface border border-rhozly-outline/20 outline-none focus:border-rhozly-primary"
                      />
                      <button
                        onClick={() => renameZone(zone.id)}
                        aria-label="Save name"
                        className="min-h-[32px] min-w-[32px] flex items-center justify-center rounded-lg text-emerald-600 hover:bg-emerald-50"
                      >
                        <Check size={14} />
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="flex-1 text-xs font-black text-rhozly-on-surface truncate">{zone.name}</p>
                      <span className="text-[9px] font-black text-rhozly-on-surface/40 uppercase tracking-widest">{zone.shape_ids.length} bed{zone.shape_ids.length === 1 ? "" : "s"}</span>
                      <button
                        data-testid={`zone-rename-${zone.id}`}
                        onClick={() => { setRenamingId(zone.id); setRenameValue(zone.name); }}
                        aria-label="Rename zone"
                        className="min-h-[32px] min-w-[32px] flex items-center justify-center rounded-lg text-rhozly-on-surface/40 hover:bg-rhozly-surface-low"
                      >
                        <Pencil size={12} />
                      </button>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  {COLOURS.map(c => (
                    <button
                      key={c}
                      onClick={() => setColour(zone.id, c)}
                      aria-label={`Colour ${c}`}
                      className={`w-5 h-5 rounded-md border-2 transition-transform active:scale-90 ${zone.colour === c ? "border-rhozly-on-surface scale-110" : "border-transparent"}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>

                <div className="flex gap-2">
                  <button
                    data-testid={`zone-water-${zone.id}`}
                    onClick={() => markZoneWatered(zone)}
                    disabled={wateringId === zone.id || zone.shape_ids.length === 0}
                    className="flex-1 flex items-center justify-center gap-1.5 min-h-[40px] rounded-xl bg-sky-50 text-sky-700 text-[11px] font-black uppercase tracking-widest disabled:opacity-40"
                  >
                    {wateringId === zone.id ? <Loader2 size={14} className="animate-spin" /> : <Droplets size={14} />}
                    Mark Watered
                  </button>
                  {valveCount > 0 && (
                    <button
                      data-testid={`zone-sprinkler-${zone.id}`}
                      onClick={() => runSmartSprinkler(zone)}
                      disabled={runningSprinklerId === zone.id}
                      className="flex items-center justify-center gap-1.5 min-h-[40px] px-3 rounded-xl bg-amber-50 text-amber-700 text-[11px] font-black uppercase tracking-widest disabled:opacity-40"
                      title="Run linked smart sprinkler for 10 min"
                    >
                      {runningSprinklerId === zone.id ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                      Sprinkler
                    </button>
                  )}
                  <button
                    data-testid={`zone-delete-${zone.id}`}
                    onClick={() => deleteZone(zone.id)}
                    aria-label="Delete zone"
                    className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-red-500 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
