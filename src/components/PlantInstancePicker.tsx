import React, { useState, useRef, useEffect, useMemo } from "react";
import { Search, X, MapPin, ChevronDown, Sprout } from "lucide-react";

export interface InventoryItemWithLocation {
  id: string;
  plants?: { common_name: string | null } | null;
  areas?: { name: string; locations?: { name: string } | null } | null;
  area_id: string | null;
  location_id: string | null;
}

interface Props {
  items: InventoryItemWithLocation[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
}

export default function PlantInstancePicker({
  items,
  selectedId,
  onSelect,
  disabled = false,
  placeholder = "Select a plant from your shed...",
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [locationFilter, setLocationFilter] = useState<string | null>(null);
  const [areaFilter, setAreaFilter] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 50);
  }, [open]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Build unique location + area lists from the items
  const locations = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of items) {
      const locName = item.areas?.locations?.name;
      if (locName) map.set(locName, locName);
    }
    return Array.from(map.keys()).sort();
  }, [items]);

  const areasForLocation = useMemo(() => {
    if (!locationFilter) return [];
    const map = new Map<string, string>();
    for (const item of items) {
      const locName = item.areas?.locations?.name;
      const areaName = item.areas?.name;
      if (locName === locationFilter && areaName) map.set(areaName, areaName);
    }
    return Array.from(map.keys()).sort();
  }, [items, locationFilter]);

  // Clear area filter when location changes
  const handleLocationFilter = (loc: string | null) => {
    setLocationFilter(loc);
    setAreaFilter(null);
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter((item) => {
      const name = item.plants?.common_name?.toLowerCase() ?? "";
      const locName = item.areas?.locations?.name ?? "";
      const areaName = item.areas?.name ?? "";

      if (q && !name.includes(q) && !locName.toLowerCase().includes(q) && !areaName.toLowerCase().includes(q)) return false;
      if (locationFilter && locName !== locationFilter) return false;
      if (areaFilter && areaName !== areaFilter) return false;
      return true;
    });
  }, [items, search, locationFilter, areaFilter]);

  const selectedItem = items.find((i) => i.id === selectedId);
  const selectedName = selectedItem?.plants?.common_name ?? "Unknown Plant";
  const selectedBreadcrumb = [
    selectedItem?.areas?.locations?.name,
    selectedItem?.areas?.name,
  ].filter(Boolean).join(" › ");

  function handleSelect(id: string) {
    onSelect(id);
    setOpen(false);
    setSearch("");
    setLocationFilter(null);
    setAreaFilter(null);
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onSelect(null);
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        className={`w-full flex items-center gap-3 p-4 bg-rhozly-surface-low rounded-xl border transition-all text-left ${
          open
            ? "border-rhozly-primary ring-2 ring-rhozly-primary/20"
            : "border-transparent hover:border-rhozly-outline/30"
        } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <Sprout size={16} className={selectedId ? "text-rhozly-primary" : "text-rhozly-on-surface/30"} />
        <div className="flex-1 min-w-0">
          {selectedId ? (
            <>
              <p className="text-sm font-bold text-rhozly-on-surface truncate">{selectedName}</p>
              {selectedBreadcrumb && (
                <p className="text-[11px] text-rhozly-on-surface/50 truncate flex items-center gap-1 mt-0.5">
                  <MapPin size={9} />
                  {selectedBreadcrumb}
                </p>
              )}
            </>
          ) : (
            <p className="text-sm font-bold text-rhozly-on-surface/40">{placeholder}</p>
          )}
        </div>
        {selectedId ? (
          <button
            type="button"
            onClick={handleClear}
            className="text-rhozly-on-surface/30 hover:text-red-400 transition flex-shrink-0"
          >
            <X size={14} />
          </button>
        ) : (
          <ChevronDown size={16} className={`text-rhozly-on-surface/30 transition-transform flex-shrink-0 ${open ? "rotate-180" : ""}`} />
        )}
      </button>

      {/* Panel */}
      {open && (
        <div className="absolute z-20 w-full mt-2 bg-white border border-rhozly-outline/15 rounded-2xl shadow-xl overflow-hidden">
          {/* Search bar */}
          <div className="p-3 border-b border-rhozly-outline/10">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-rhozly-on-surface/40" />
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by plant, location or area…"
                className="w-full pl-9 pr-3 py-2.5 text-sm bg-rhozly-surface-low rounded-xl border-none outline-none font-medium text-rhozly-on-surface placeholder:text-rhozly-on-surface/40"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-rhozly-on-surface/40 hover:text-rhozly-on-surface">
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Location filter pills */}
          {locations.length > 1 && (
            <div className="px-3 pt-2.5 pb-1 flex flex-wrap gap-1.5 border-b border-rhozly-outline/10">
              <button
                onClick={() => handleLocationFilter(null)}
                className={`text-[11px] font-bold px-3 py-1 rounded-full transition ${
                  !locationFilter
                    ? "bg-rhozly-primary text-white"
                    : "bg-rhozly-surface-low text-rhozly-on-surface/60 hover:bg-rhozly-outline/20"
                }`}
              >
                All locations
              </button>
              {locations.map((loc) => (
                <button
                  key={loc}
                  onClick={() => handleLocationFilter(loc)}
                  className={`text-[11px] font-bold px-3 py-1 rounded-full transition ${
                    locationFilter === loc
                      ? "bg-rhozly-primary text-white"
                      : "bg-rhozly-surface-low text-rhozly-on-surface/60 hover:bg-rhozly-outline/20"
                  }`}
                >
                  {loc}
                </button>
              ))}
            </div>
          )}

          {/* Area filter pills — only shown once a location is selected */}
          {locationFilter && areasForLocation.length > 1 && (
            <div className="px-3 pt-2 pb-1 flex flex-wrap gap-1.5 border-b border-rhozly-outline/10">
              <button
                onClick={() => setAreaFilter(null)}
                className={`text-[11px] font-semibold px-3 py-1 rounded-full transition ${
                  !areaFilter
                    ? "bg-rhozly-primary/80 text-white"
                    : "bg-rhozly-outline/10 text-rhozly-on-surface/60 hover:bg-rhozly-outline/20"
                }`}
              >
                All areas
              </button>
              {areasForLocation.map((area) => (
                <button
                  key={area}
                  onClick={() => setAreaFilter(area)}
                  className={`text-[11px] font-semibold px-3 py-1 rounded-full transition ${
                    areaFilter === area
                      ? "bg-rhozly-primary/80 text-white"
                      : "bg-rhozly-outline/10 text-rhozly-on-surface/60 hover:bg-rhozly-outline/20"
                  }`}
                >
                  {area}
                </button>
              ))}
            </div>
          )}

          {/* Results list */}
          <div className="max-h-56 overflow-y-auto p-2">
            {filtered.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-rhozly-on-surface/40 font-medium">
                No plants match your search
              </div>
            ) : (
              filtered.map((item) => {
                const name = item.plants?.common_name ?? "Unknown Plant";
                const breadcrumb = [
                  item.areas?.locations?.name,
                  item.areas?.name,
                ].filter(Boolean).join(" › ");
                const isSelected = item.id === selectedId;

                return (
                  <button
                    key={item.id}
                    onClick={() => handleSelect(item.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition ${
                      isSelected
                        ? "bg-rhozly-primary/10 text-rhozly-primary"
                        : "hover:bg-rhozly-primary/5 text-rhozly-on-surface"
                    }`}
                  >
                    <Sprout size={14} className={isSelected ? "text-rhozly-primary flex-shrink-0" : "text-rhozly-on-surface/30 flex-shrink-0"} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate">{name}</p>
                      {breadcrumb && (
                        <p className="text-[11px] text-rhozly-on-surface/50 flex items-center gap-1 mt-0.5">
                          <MapPin size={8} />
                          {breadcrumb}
                        </p>
                      )}
                    </div>
                    {isSelected && (
                      <div className="w-2 h-2 rounded-full bg-rhozly-primary flex-shrink-0" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
