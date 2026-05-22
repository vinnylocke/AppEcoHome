import React, { useEffect, useMemo, useState } from "react";
import { Package, ChevronDown, ChevronUp, X, Loader2, Plus } from "lucide-react";
import toast from "react-hot-toast";
import { supabase } from "../../lib/supabase";
import { Logger } from "../../lib/errorHandler";
import type { ShoppingList, ShoppingListItem } from "../../types/shopping";

interface Props {
  homeId: string;
  /** Active (non-completed) lists. Banner only renders when at least one exists. */
  activeLists: ShoppingList[];
  /** Hook into `useShoppingLists.addItem` so refills land in the right list. */
  addItem: (
    item: Omit<ShoppingListItem, "id" | "created_at">,
  ) => Promise<void>;
}

interface RefillRow {
  id: string;
  variety: string | null;
  vendor: string | null;
  sow_by: string | null;
  opened_on: string | null;
  latest_germination_rate_pct: number | null;
  /** plant_id is used for the duplicate check / future deep-link. */
  plant_id: number | null;
  /** Human-readable headline name (variety + plant fallback). */
  label: string;
  /** One-line reason this packet is on the list. */
  reason: string;
}

const DISMISS_KEY = "rhozly:seedRefillBannerDismissed";
const DAYS_90 = 90 * 86_400_000;
const DAYS_18_MONTHS = 547 * 86_400_000;

/**
 * "X packets approaching their sow-by" banner that sits at the top of the
 * Shopping List screen. Computes refill candidates on-read from
 * `seed_packets_with_germination` — no cron / no alerts table needed.
 *
 * The user can:
 *   - Add all refills → creates one `shopping_list_items` row per packet
 *     in the first active list (most recently updated).
 *   - Dismiss → hides the banner until the next session (sessionStorage,
 *     keyed by home).
 */
export default function SeedRefillBanner({ homeId, activeLists, addItem }: Props) {
  const [refills, setRefills] = useState<RefillRow[] | null>(null);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [dismissed, setDismissed] = useState(() => readDismissed(homeId));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("seed_packets_with_germination")
          .select(
            "id, plant_id, variety, vendor, sow_by, opened_on, latest_germination_rate_pct, plants(common_name)",
          )
          .eq("home_id", homeId)
          .eq("is_archived", false);
        if (cancelled) return;
        if (error) throw error;
        const now = Date.now();
        const list: RefillRow[] = [];
        for (const row of (data ?? []) as (Record<string, unknown> & { plants?: { common_name?: string } | null })[]) {
          const variety = (row.variety as string | null) ?? null;
          const vendor = (row.vendor as string | null) ?? null;
          const sowBy = (row.sow_by as string | null) ?? null;
          const opened = (row.opened_on as string | null) ?? null;
          const rate = (row.latest_germination_rate_pct as number | null) ?? null;

          // Pick the first matching reason in priority order.
          let reason: string | null = null;
          if (rate != null && rate < 60) {
            reason = `Last sowing only ${rate}% — replace with fresh stock.`;
          } else if (sowBy) {
            const ms = new Date(sowBy).getTime() - now;
            if (ms < DAYS_90) {
              reason =
                ms < 0
                  ? "Past its sow-by — likely time for a replacement."
                  : `Sow-by within 90 days — order before it expires.`;
            }
          }
          if (!reason && opened) {
            const age = now - new Date(opened).getTime();
            if (age > DAYS_18_MONTHS) {
              reason = "Opened over 18 months ago — viability drops fast after that.";
            }
          }
          if (!reason) continue;

          const plantName = (row.plants?.common_name ?? null) as string | null;
          const label = variety && plantName
            ? `${variety} (${plantName})`
            : variety || plantName || "Untitled packet";

          list.push({
            id: row.id as string,
            variety,
            vendor,
            sow_by: sowBy,
            opened_on: opened,
            latest_germination_rate_pct: rate,
            plant_id: (row.plant_id as number | null) ?? null,
            label,
            reason,
          });
        }
        setRefills(list);
      } catch (err) {
        Logger.error("SeedRefillBanner load failed", err, { homeId });
        if (!cancelled) setRefills([]);
      }
    })();
    return () => { cancelled = true; };
  }, [homeId]);

  // Most-recently-updated active list — the target for "Add refills".
  const targetList = useMemo(() => {
    if (activeLists.length === 0) return null;
    return [...activeLists].sort((a, b) =>
      (b.updated_at ?? "").localeCompare(a.updated_at ?? ""),
    )[0];
  }, [activeLists]);

  if (dismissed) return null;
  if (refills == null) return null; // hidden during load — banner shouldn't flash
  if (refills.length === 0) return null;
  if (!targetList) return null;

  const handleAddRefills = async () => {
    setAdding(true);
    try {
      for (const refill of refills) {
        const itemName = refill.vendor
          ? `${refill.label} (${refill.vendor})`
          : refill.label;
        await addItem({
          list_id: targetList.id,
          home_id: homeId,
          item_type: "plant",
          name: itemName,
          is_checked: false,
          source: "shed",
        });
      }
      toast.success(
        `Added ${refills.length} packet refill${refills.length === 1 ? "" : "s"} to "${targetList.name}".`,
      );
      // Dismiss for this session — once they've added them, no point pestering.
      writeDismissed(homeId);
      setDismissed(true);
    } catch (err) {
      Logger.error("SeedRefillBanner add failed", err, { homeId });
      toast.error("Couldn't add all refills — try again.");
    } finally {
      setAdding(false);
    }
  };

  const handleDismiss = () => {
    writeDismissed(homeId);
    setDismissed(true);
  };

  return (
    <div
      data-testid="seed-refill-banner"
      className="rounded-3xl bg-amber-50 border border-amber-200 mb-4"
    >
      <div className="flex items-start gap-3 p-4">
        <span className="shrink-0 w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center">
          <Package size={18} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-700 mb-0.5">
            Seed refill needed
          </p>
          <p className="text-sm font-black text-amber-900 leading-tight">
            {refills.length} packet{refills.length === 1 ? "" : "s"} in your Nursery
            {" "}{refills.length === 1 ? "is" : "are"} ready for a refill.
          </p>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="mt-1 text-[11px] font-black uppercase tracking-widest text-amber-700 hover:text-amber-900 inline-flex items-center gap-1"
            aria-expanded={open}
          >
            {open ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            {open ? "Hide list" : "Show what's flagged"}
          </button>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss seed refill banner"
          className="shrink-0 w-7 h-7 rounded-lg text-amber-700/60 hover:text-amber-900 hover:bg-amber-100/60 flex items-center justify-center"
        >
          <X size={13} />
        </button>
      </div>

      {open && (
        <ul className="px-4 pb-3 space-y-1.5">
          {refills.map((refill) => (
            <li
              key={refill.id}
              className="rounded-xl bg-white/70 border border-amber-200/50 px-3 py-2"
            >
              <p className="text-[12px] font-black text-amber-900 leading-tight">
                {refill.label}
                {refill.vendor && (
                  <span className="font-bold text-amber-800/70"> · {refill.vendor}</span>
                )}
              </p>
              <p className="text-[11px] text-amber-800/80 mt-0.5 leading-snug">
                {refill.reason}
              </p>
            </li>
          ))}
        </ul>
      )}

      <div className="px-4 pb-4 pt-1 flex items-center justify-end gap-2">
        <button
          type="button"
          data-testid="seed-refill-banner-add"
          onClick={handleAddRefills}
          disabled={adding}
          className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl bg-amber-700 text-white text-[11px] font-black uppercase tracking-widest hover:bg-amber-800 transition-colors disabled:opacity-60"
        >
          {adding ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
          Add to "{targetList.name}"
        </button>
      </div>
    </div>
  );
}

function readDismissed(homeId: string): boolean {
  try {
    return window.sessionStorage.getItem(`${DISMISS_KEY}:${homeId}`) === "1";
  } catch {
    return false;
  }
}

function writeDismissed(homeId: string): void {
  try {
    window.sessionStorage.setItem(`${DISMISS_KEY}:${homeId}`, "1");
  } catch {
    /* non-fatal */
  }
}
