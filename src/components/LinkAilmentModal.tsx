import React, { useState, useEffect } from "react";
import {
  X, Bug, Leaf, Biohazard, Loader2, AlertTriangle, CheckCircle2, Search,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { supabase } from "../lib/supabase";
import { AutomationEngine } from "../lib/automationEngine";
import { getLocalDateString } from "../lib/taskEngine";
import type { Ailment, AilmentType } from "./AilmentWatchlist";

const TYPE_META: Record<AilmentType, { label: string; icon: React.ReactNode; colour: string }> = {
  invasive_plant: { label: "Invasive Plant", icon: <Leaf size={12} />, colour: "bg-orange-100 text-orange-700" },
  pest:           { label: "Pest",           icon: <Bug size={12} />,       colour: "bg-red-100 text-red-700" },
  disease:        { label: "Disease",        icon: <Biohazard size={12} />, colour: "bg-purple-100 text-purple-700" },
};

interface Props {
  homeId: string;
  plantInstance: {
    id: string;
    home_id: string;
    location_id: string;
    area_id: string;
    plant_name: string;
    identifier: string;
  };
  onClose: () => void;
  onLinked: () => void;
}

export default function LinkAilmentModal({ homeId, plantInstance, onClose, onLinked }: Props) {
  const [ailments, setAilments] = useState<Ailment[]>([]);
  const [existingLinks, setExistingLinks] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [linking, setLinking] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const load = async () => {
      const [ailmentsRes, linksRes] = await Promise.all([
        supabase.from("ailments").select("*").eq("home_id", homeId).order("name"),
        supabase
          .from("plant_instance_ailments")
          .select("ailment_id")
          .eq("plant_instance_id", plantInstance.id)
          .eq("status", "active"),
      ]);

      if (ailmentsRes.data) setAilments(ailmentsRes.data as Ailment[]);
      if (linksRes.data) setExistingLinks(new Set(linksRes.data.map((r: any) => r.ailment_id)));
      setLoading(false);
    };
    load();
  }, [homeId, plantInstance.id]);

  const toggle = (id: string) => {
    if (existingLinks.has(id)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleLink = async () => {
    if (selected.size === 0) { toast.error("Select at least one ailment."); return; }
    setLinking(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const today = getLocalDateString(new Date());

      const rows = Array.from(selected).map((ailmentId) => ({
        plant_instance_id: plantInstance.id,
        ailment_id: ailmentId,
        home_id: homeId,
        linked_by: user?.id ?? null,
        status: "active",
      }));

      const { error: linkError } = await supabase.from("plant_instance_ailments").insert(rows);
      if (linkError) throw linkError;

      // Fire automations for each newly linked ailment
      const selectedAilments = ailments.filter((a) => selected.has(a.id));
      await Promise.all(
        selectedAilments.map((ailment) =>
          AutomationEngine.applyAilmentAutomations(
            {
              id: plantInstance.id,
              home_id: plantInstance.home_id,
              location_id: plantInstance.location_id,
              area_id: plantInstance.area_id,
            },
            ailment,
            today,
          ),
        ),
      );

      toast.success(`Linked ${selected.size} ailment${selected.size > 1 ? "s" : ""} and scheduled tasks.`);
      onLinked();
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Could not link ailment.");
    } finally {
      setLinking(false);
    }
  };

  const filtered = ailments.filter((a) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return a.name.toLowerCase().includes(q) || (a.scientific_name || "").toLowerCase().includes(q);
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between p-6 pb-4 border-b border-rhozly-outline/10">
          <div>
            <h2 className="font-black text-xl text-rhozly-on-surface">Link Ailment</h2>
            <p className="text-xs font-bold text-rhozly-on-surface/40 mt-0.5">
              {plantInstance.plant_name} · {plantInstance.identifier}
            </p>
          </div>
          <button
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center text-rhozly-on-surface/40 hover:text-rhozly-on-surface hover:bg-rhozly-surface-low rounded-xl transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Search */}
        <div className="px-6 py-3 border-b border-rhozly-outline/10">
          <div className="relative">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-rhozly-on-surface/30" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search ailments…"
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-rhozly-outline/20 bg-rhozly-surface-lowest text-sm font-bold focus:outline-none focus:ring-2 focus:ring-rhozly-primary/30"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-rhozly-primary" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center">
              <AlertTriangle size={28} className="mx-auto mb-2 text-rhozly-on-surface/20" />
              <p className="text-sm font-bold text-rhozly-on-surface/40">
                {ailments.length === 0 ? "No ailments in your watchlist yet." : "No matching ailments."}
              </p>
            </div>
          ) : (
            filtered.map((ailment) => {
              const meta = TYPE_META[ailment.type];
              const alreadyLinked = existingLinks.has(ailment.id);
              const isSelected = selected.has(ailment.id);
              return (
                <button
                  key={ailment.id}
                  onClick={() => toggle(ailment.id)}
                  disabled={alreadyLinked}
                  className={`w-full text-left flex items-center gap-3 p-3.5 rounded-2xl border transition-all ${
                    alreadyLinked
                      ? "border-rhozly-outline/10 opacity-50 cursor-not-allowed bg-rhozly-surface-lowest"
                      : isSelected
                      ? "border-rhozly-primary ring-1 ring-rhozly-primary/20 bg-rhozly-primary/5"
                      : "border-rhozly-outline/10 hover:border-rhozly-primary/30 hover:bg-rhozly-primary/5 bg-white"
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                      alreadyLinked
                        ? "border-rhozly-outline/20 bg-rhozly-surface-low"
                        : isSelected
                        ? "bg-rhozly-primary border-rhozly-primary text-white"
                        : "border-rhozly-outline/30"
                    }`}
                  >
                    {(isSelected || alreadyLinked) && <CheckCircle2 size={12} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-black text-sm text-rhozly-on-surface truncate">{ailment.name}</span>
                      <span className={`shrink-0 inline-flex items-center gap-1 text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full ${meta.colour}`}>
                        {meta.icon} {meta.label}
                      </span>
                    </div>
                    {alreadyLinked && (
                      <p className="text-[10px] font-black text-rhozly-primary mt-0.5">Already linked</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-0.5 shrink-0 text-[9px] font-black text-rhozly-on-surface/30">
                    <span>{ailment.prevention_steps.length} prev.</span>
                    <span>{ailment.remedy_steps.length} rem.</span>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-rhozly-outline/10 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3.5 rounded-2xl border-2 border-rhozly-outline/20 font-black text-sm text-rhozly-on-surface/60 hover:text-rhozly-on-surface transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleLink}
            disabled={linking || selected.size === 0}
            className="flex-1 py-3.5 bg-rhozly-primary text-white rounded-2xl font-black text-sm flex items-center justify-center gap-2 hover:scale-[1.02] transition-transform disabled:opacity-60"
          >
            {linking ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
            {linking ? "Linking…" : `Link ${selected.size > 0 ? selected.size : ""} Ailment${selected.size !== 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
