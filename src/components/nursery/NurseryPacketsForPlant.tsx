import React, { useEffect, useState } from "react";
import { Package, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Logger } from "../../lib/errorHandler";

interface Props {
  homeId: string;
  plantId: number;
}

interface PacketSummary {
  id: string;
  variety: string | null;
  vendor: string | null;
  sow_by: string | null;
  active_sowing_status: "sown" | "germinated" | "planted_out" | "discarded" | null;
  latest_germination_rate_pct: number | null;
}

/**
 * Tiny informational pill shown on the Plant Edit Modal Care Guide tab —
 * "You have N packets of this in your Nursery" — expandable to a list
 * of varieties + vendors + status chips. Hides itself when there are
 * no matching packets so the surface stays clean for users who don't
 * use the Nursery.
 */
export default function NurseryPacketsForPlant({ homeId, plantId }: Props) {
  const [packets, setPackets] = useState<PacketSummary[] | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("seed_packets_with_germination")
          .select(
            "id, variety, vendor, sow_by, active_sowing_status, latest_germination_rate_pct",
          )
          .eq("home_id", homeId)
          .eq("plant_id", plantId)
          .eq("is_archived", false);
        if (cancelled) return;
        if (error) throw error;
        setPackets((data ?? []) as PacketSummary[]);
      } catch (err) {
        Logger.error("NurseryPacketsForPlant load failed", err, { homeId, plantId });
        if (!cancelled) setPackets([]);
      }
    })();
    return () => { cancelled = true; };
  }, [homeId, plantId]);

  if (packets == null) {
    return (
      <div className="inline-flex items-center gap-1.5 text-[10px] font-bold text-rhozly-on-surface/40 px-2 py-1">
        <Loader2 size={11} className="animate-spin" />
        Checking your Nursery…
      </div>
    );
  }

  if (packets.length === 0) return null;

  const label = packets.length === 1 ? "1 packet" : `${packets.length} packets`;

  return (
    <div
      data-testid="care-guide-nursery-packets"
      className="rounded-2xl bg-rhozly-primary/[0.06] border border-rhozly-primary/20 mb-3"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left"
        aria-expanded={open}
      >
        <span className="shrink-0 w-8 h-8 rounded-xl bg-rhozly-primary/15 text-rhozly-primary flex items-center justify-center">
          <Package size={14} />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[10px] font-black uppercase tracking-widest text-rhozly-primary">
            Seeds in your Nursery
          </span>
          <span className="block text-sm font-bold text-rhozly-on-surface leading-tight">
            {label} for this plant
          </span>
        </span>
        {open ? (
          <ChevronUp size={14} className="text-rhozly-on-surface/40 shrink-0" />
        ) : (
          <ChevronDown size={14} className="text-rhozly-on-surface/40 shrink-0" />
        )}
      </button>
      {open && (
        <ul className="px-3 pb-3 space-y-1.5">
          {packets.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center gap-1.5 rounded-xl bg-white border border-rhozly-outline/15 px-2.5 py-1.5"
            >
              <span className="text-[12px] font-black text-rhozly-on-surface">
                {p.variety?.trim() || "Untitled variety"}
              </span>
              {p.vendor?.trim() && (
                <span className="text-[10px] font-bold text-rhozly-on-surface/55">
                  · {p.vendor.trim()}
                </span>
              )}
              {p.active_sowing_status === "sown" && (
                <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-100">
                  Awaiting germination
                </span>
              )}
              {p.active_sowing_status === "germinated" && (
                <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
                  Ready to plant out
                </span>
              )}
              {p.active_sowing_status == null && p.latest_germination_rate_pct != null && (
                <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-rhozly-surface-low text-rhozly-on-surface/65 border border-rhozly-outline/15">
                  Last sowing {p.latest_germination_rate_pct}%
                </span>
              )}
              {p.active_sowing_status == null && p.latest_germination_rate_pct == null && p.sow_by && (
                <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-bold text-rhozly-on-surface/55">
                  Sow by {new Date(p.sow_by).toLocaleDateString(undefined, { month: "short", year: "numeric" })}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
