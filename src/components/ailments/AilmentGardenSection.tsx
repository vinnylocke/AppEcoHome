// "In your garden" — the relationship section for a watched ailment (Garden
// Hub v3 Stage B, 2026-07-22; plan §3 "Ailment modal"). Shows what this
// ailment is DOING in the home right now and what it did before:
//   AFFECTED NOW — active links on live instances, by area, with the member
//     who linked it (plant_instance_ailments.linked_by — written since day
//     one, rendered here for the first time).
//   HISTORY — resolved links, links whose instance has ended, and area-scan
//     sightings (evidence rows; scans have no resolved state).
// Presence stays DERIVED — this section is the receipts behind the pill.

import { useEffect, useState } from "react";
import { MapPin, Leaf, ScanSearch, Loader2 } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Logger } from "../../lib/errorHandler";

interface LinkRow {
  id: string;
  status: string;
  linked_at: string | null;
  linked_by: string | null;
  linked_by_name: string | null;
  instance_label: string;
  area_name: string | null;
  instance_ended: boolean;
}

interface ScanRow {
  id: string;
  severity: string | null;
  created_at: string;
}

function shortDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export default function AilmentGardenSection({
  ailmentId,
  homeId,
}: {
  ailmentId: string;
  homeId: string;
}) {
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [scans, setScans] = useState<ScanRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [linkRes, scanRes] = await Promise.all([
          supabase
            .from("plant_instance_ailments")
            .select(
              "id, status, linked_at, linked_by, inventory_items!inner(nickname, identifier, plant_name, area_name, ended_at, status)",
            )
            .eq("home_id", homeId)
            .eq("ailment_id", ailmentId)
            .order("linked_at", { ascending: false }),
          supabase
            .from("area_scan_ailments")
            .select("id, severity, created_at")
            .eq("ailment_id", ailmentId)
            .order("created_at", { ascending: false })
            .limit(10),
        ]);
        if (cancelled) return;
        if (linkRes.error) throw linkRes.error;

        const raw = (linkRes.data ?? []) as any[];
        // Resolve linker display names in one shot (best-effort).
        const uids = [...new Set(raw.map((r) => r.linked_by).filter(Boolean))] as string[];
        let names = new Map<string, string>();
        if (uids.length > 0) {
          const { data: profiles } = await supabase
            .from("user_profiles")
            .select("uid, display_name")
            .in("uid", uids);
          names = new Map((profiles ?? []).map((p: any) => [p.uid, p.display_name]));
        }
        if (cancelled) return;

        setLinks(
          raw.map((r) => {
            const ii = r.inventory_items ?? {};
            return {
              id: r.id,
              status: r.status,
              linked_at: r.linked_at,
              linked_by: r.linked_by,
              linked_by_name: r.linked_by ? (names.get(r.linked_by) ?? null) : null,
              instance_label: ii.nickname?.trim() || ii.identifier || ii.plant_name || "a plant",
              area_name: ii.area_name ?? null,
              instance_ended: ii.ended_at != null || ii.status === "Archived",
            };
          }),
        );
        setScans((scanRes.data ?? []) as ScanRow[]);
      } catch (err) {
        // Enhancement layer — the modal still works without receipts.
        Logger.warn("AilmentGardenSection fetch failed", { err, ailmentId });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [ailmentId, homeId]);

  const affectedNow = links.filter((l) => l.status === "active" && !l.instance_ended);
  const history = links.filter((l) => !(l.status === "active" && !l.instance_ended));

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-1 py-3 text-xs text-rhozly-on-surface/50">
        <Loader2 size={13} className="animate-spin" /> Checking your garden…
      </div>
    );
  }
  if (affectedNow.length === 0 && history.length === 0 && scans.length === 0) return null;

  return (
    <div data-testid="ailment-garden-section" className="space-y-3">
      {affectedNow.length > 0 && (
        <div data-testid="ailment-garden-affected">
          <p className="text-2xs font-black uppercase tracking-widest text-rhozly-on-surface/40 px-1 mb-1.5">
            Affected now
          </p>
          <ul className="flex flex-col gap-1.5">
            {affectedNow.map((l) => (
              <li
                key={l.id}
                data-testid={`ailment-garden-link-${l.id}`}
                className="rounded-2xl bg-status-danger-fill border border-status-danger-line px-3 py-2.5 flex items-center gap-2.5"
              >
                <Leaf size={14} className="shrink-0 text-status-danger-ink" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-rhozly-on-surface truncate">{l.instance_label}</p>
                  <p className="text-[11px] font-bold text-rhozly-on-surface/55 truncate flex items-center gap-1">
                    {l.area_name && (<><MapPin size={10} /> {l.area_name} · </>)}
                    {l.linked_at ? `linked ${shortDate(l.linked_at)}` : "linked"}
                    {l.linked_by_name ? ` by ${l.linked_by_name}` : ""}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(history.length > 0 || scans.length > 0) && (
        <div data-testid="ailment-garden-history">
          <p className="text-2xs font-black uppercase tracking-widest text-rhozly-on-surface/40 px-1 mb-1.5">
            History
          </p>
          <ul className="flex flex-col gap-1.5">
            {history.map((l) => (
              <li
                key={l.id}
                className="rounded-2xl bg-rhozly-surface-low border border-rhozly-outline/10 px-3 py-2 flex items-center gap-2.5"
              >
                <Leaf size={13} className="shrink-0 text-rhozly-on-surface/40" />
                <p className="flex-1 min-w-0 text-[12px] font-bold text-rhozly-on-surface/65 truncate">
                  {l.instance_label}
                  {l.area_name ? ` · ${l.area_name}` : ""}
                  {l.instance_ended ? " · plant ended" : " · resolved"}
                  {l.linked_at ? ` · ${shortDate(l.linked_at)}` : ""}
                </p>
              </li>
            ))}
            {scans.map((sc) => (
              <li
                key={sc.id}
                className="rounded-2xl bg-rhozly-surface-low border border-rhozly-outline/10 px-3 py-2 flex items-center gap-2.5"
              >
                <ScanSearch size={13} className="shrink-0 text-rhozly-on-surface/40" />
                <p className="flex-1 min-w-0 text-[12px] font-bold text-rhozly-on-surface/65 truncate">
                  Spotted in an area scan{sc.severity ? ` · ${sc.severity}` : ""} · {shortDate(sc.created_at)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
