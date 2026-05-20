import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Search, Sprout, Loader2, MapPin } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Logger } from "../../lib/errorHandler";
import { useFocusTrap } from "../../hooks/useFocusTrap";

interface InventoryItem {
  id: string;
  plant_name: string | null;
  status: string | null;
  plants: { common_name: string | null } | null;
  areas: { name: string | null; locations: { name: string | null } | null } | null;
}

interface Props {
  homeId: string;
  entryId: string;
  entrySubject?: string;
  onAssign: (entryId: string, inventoryItemId: string) => Promise<void>;
  onClose: () => void;
}

/**
 * Bottom-sheet plant picker used on the Quick Capture screen to assign an
 * unassigned `plant_journals` row to a specific inventory_item. Reads the
 * home's planted/active inventory once on open; user picks one, we await
 * the parent's onAssign, then close.
 */
export default function AssignToPlantSheet({
  homeId,
  entryId,
  entrySubject,
  onAssign,
  onClose,
}: Props) {
  const trapRef = useFocusTrap<HTMLDivElement>(true);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error: qErr } = await supabase
          .from("inventory_items")
          .select(`
            id, plant_name, status,
            plants ( common_name ),
            areas ( name, locations ( name ) )
          `)
          .eq("home_id", homeId)
          .neq("status", "Archived")
          .order("plant_name", { ascending: true })
          .limit(500);
        if (qErr) throw qErr;
        if (cancelled) return;
        setItems((data ?? []) as unknown as InventoryItem[]);
      } catch (err: any) {
        Logger.error("AssignToPlantSheet inventory load failed", err, { homeId });
        if (!cancelled) setError(err?.message ?? "Couldn't load your plants.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [homeId]);

  useEffect(() => {
    const timeoutId = setTimeout(() => searchRef.current?.focus(), 50);
    return () => clearTimeout(timeoutId);
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const needle = search.trim().toLowerCase();
    return items.filter((item) => {
      const name = (item.plants?.common_name ?? item.plant_name ?? "").toLowerCase();
      const area = item.areas?.name?.toLowerCase() ?? "";
      const location = item.areas?.locations?.name?.toLowerCase() ?? "";
      return name.includes(needle) || area.includes(needle) || location.includes(needle);
    });
  }, [items, search]);

  const handlePick = async (inventoryItemId: string) => {
    setAssigningId(inventoryItemId);
    setError(null);
    try {
      await onAssign(entryId, inventoryItemId);
      onClose();
    } catch (err: any) {
      setError(err?.message ?? "Couldn't assign.");
      setAssigningId(null);
    }
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      data-testid="assign-to-plant-sheet"
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="assign-sheet-title"
        onClick={(e) => e.stopPropagation()}
        className="bg-rhozly-bg w-full max-w-md sm:rounded-3xl rounded-t-3xl shadow-2xl border border-rhozly-outline/10 overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300 flex flex-col max-h-[85vh]"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-5 pb-3 border-b border-rhozly-outline/10">
          <div className="flex-1 min-w-0">
            <h2 id="assign-sheet-title" className="font-black text-lg text-rhozly-on-surface tracking-tight">
              Assign to a plant
            </h2>
            {entrySubject && (
              <p className="text-xs text-rhozly-on-surface/55 mt-0.5 truncate">
                {entrySubject}
              </p>
            )}
          </div>
          <button
            type="button"
            data-testid="assign-sheet-close"
            onClick={onClose}
            className="shrink-0 p-2 rounded-xl text-rhozly-on-surface/40 hover:text-rhozly-on-surface/70 hover:bg-rhozly-surface-low transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-b border-rhozly-outline/10">
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-rhozly-on-surface/30"
            />
            <input
              ref={searchRef}
              type="text"
              data-testid="assign-sheet-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search your plants…"
              className="w-full pl-9 pr-3 py-2.5 min-h-[44px] rounded-2xl border border-rhozly-outline/20 text-sm font-bold text-rhozly-on-surface placeholder:text-rhozly-on-surface/30 focus:outline-none focus:border-rhozly-primary"
            />
          </div>
        </div>

        {/* List */}
        <div
          data-testid="assign-sheet-list"
          className="flex-1 overflow-y-auto px-3 py-2"
        >
          {loading ? (
            <div className="flex items-center justify-center py-10 text-rhozly-on-surface/40">
              <Loader2 className="animate-spin" size={20} />
            </div>
          ) : error ? (
            <div
              data-testid="assign-sheet-error"
              className="mx-2 my-3 px-3 py-3 rounded-2xl bg-red-50 border border-red-100 text-xs text-red-800"
            >
              {error}
            </div>
          ) : filtered.length === 0 ? (
            <div
              data-testid="assign-sheet-empty"
              className="text-center py-10 text-sm text-rhozly-on-surface/50"
            >
              {search.trim()
                ? "No plants match that search."
                : "Add a plant to your Shed first to assign captures."}
            </div>
          ) : (
            <ul className="space-y-1">
              {filtered.map((item) => {
                const name = item.plants?.common_name ?? item.plant_name ?? "Unnamed plant";
                const place = [item.areas?.name, item.areas?.locations?.name]
                  .filter(Boolean)
                  .join(" · ");
                const isAssigning = assigningId === item.id;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      data-testid={`assign-sheet-item-${item.id}`}
                      onClick={() => handlePick(item.id)}
                      disabled={assigningId != null}
                      className="w-full flex items-center gap-3 p-3 rounded-2xl text-left hover:bg-rhozly-surface-low/60 disabled:opacity-50 transition"
                    >
                      <div className="shrink-0 w-9 h-9 rounded-xl bg-rhozly-primary/10 text-rhozly-primary flex items-center justify-center">
                        {isAssigning ? <Loader2 size={16} className="animate-spin" /> : <Sprout size={16} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-rhozly-on-surface truncate">{name}</p>
                        {place && (
                          <p className="flex items-center gap-1 text-[11px] text-rhozly-on-surface/50 truncate">
                            <MapPin size={10} />
                            {place}
                          </p>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
