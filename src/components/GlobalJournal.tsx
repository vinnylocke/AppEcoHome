import React, { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  Plus,
  Loader2,
  Sprout,
  MapPin,
  Square,
  FileText,
  Globe,
  Settings as SettingsIcon,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { Logger } from "../lib/errorHandler";
import { useGlobalJournal, getEntryTargetType } from "../hooks/useGlobalJournal";
import type { JournalFilter } from "../hooks/useGlobalJournal";
import JournalEntryCard from "./journal/JournalEntryCard";
import JournalComposer from "./journal/JournalComposer";
import EmptyState from "./shared/EmptyState";
import SurfaceLoader from "./shared/SurfaceLoader";
import { ConfirmModal } from "./ConfirmModal";
import type { JournalEntry, JournalTargetType } from "../types";

interface Props {
  homeId: string;
}

const FILTER_OPTIONS: Array<{ value: JournalFilter; label: string; icon: React.ReactNode }> = [
  { value: "all", label: "All", icon: null },
  { value: "plant", label: "Plants", icon: <Sprout size={11} /> },
  { value: "location", label: "Locations", icon: <MapPin size={11} /> },
  { value: "area", label: "Areas", icon: <Square size={11} /> },
  { value: "plan", label: "Plans", icon: <FileText size={11} /> },
  { value: "none", label: "Unassigned", icon: <Globe size={11} /> },
];

/**
 * Buckets newest-first entries into the standard date groupings.
 */
function groupByDate(entries: JournalEntry[]): Array<{ label: string; items: JournalEntry[] }> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const lastWeekStart = new Date(today);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);

  const buckets: Record<string, JournalEntry[]> = {
    Today: [],
    Yesterday: [],
    "Last week": [],
    Earlier: [],
  };

  for (const entry of entries) {
    const d = new Date(entry.created_at);
    if (d >= today) buckets.Today.push(entry);
    else if (d >= yesterday) buckets.Yesterday.push(entry);
    else if (d >= lastWeekStart) buckets["Last week"].push(entry);
    else buckets.Earlier.push(entry);
  }
  return Object.entries(buckets)
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => ({ label, items }));
}

export default function GlobalJournal({ homeId }: Props) {
  const navigate = useNavigate();
  const { entries, loading, error, refresh, remove } = useGlobalJournal(homeId);
  const [filter, setFilter] = useState<JournalFilter>("all");
  const [composerOpen, setComposerOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<JournalEntry | null>(null);
  const [targetLabels, setTargetLabels] = useState<
    Partial<Record<JournalTargetType, Record<string, string>>>
  >({});

  // Load target labels so card chips show "Tomato (Greenhouse)" etc.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const plantIds = new Set<string>();
        const locationIds = new Set<string>();
        const areaIds = new Set<string>();
        const planIds = new Set<string>();
        for (const e of entries) {
          if (e.inventory_item_id) plantIds.add(e.inventory_item_id);
          if (e.location_id) locationIds.add(e.location_id);
          if (e.area_id) areaIds.add(e.area_id);
          if (e.plan_id) planIds.add(e.plan_id);
        }
        const next: Partial<Record<JournalTargetType, Record<string, string>>> = {
          plant: {},
          location: {},
          area: {},
          plan: {},
        };
        if (plantIds.size > 0) {
          const { data } = await supabase
            .from("inventory_items")
            .select("id, plant_name, nickname")
            .in("id", Array.from(plantIds));
          (data ?? []).forEach((r: any) => {
            next.plant![r.id] = r.nickname || r.plant_name || "Plant";
          });
        }
        if (locationIds.size > 0) {
          const { data } = await supabase
            .from("locations")
            .select("id, name")
            .in("id", Array.from(locationIds));
          (data ?? []).forEach((r: any) => {
            next.location![r.id] = r.name;
          });
        }
        if (areaIds.size > 0) {
          const { data } = await supabase
            .from("areas")
            .select("id, name")
            .in("id", Array.from(areaIds));
          (data ?? []).forEach((r: any) => {
            next.area![r.id] = r.name;
          });
        }
        if (planIds.size > 0) {
          const { data } = await supabase
            .from("plans")
            .select("id, name")
            .in("id", Array.from(planIds));
          (data ?? []).forEach((r: any) => {
            next.plan![r.id] = r.name;
          });
        }
        if (!cancelled) setTargetLabels(next);
      } catch (err) {
        Logger.error("GlobalJournal: target labels load failed", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entries]);

  const filtered = useMemo(() => {
    if (filter === "all") return entries;
    return entries.filter((e) => getEntryTargetType(e) === filter);
  }, [entries, filter]);

  const grouped = useMemo(() => groupByDate(filtered), [filtered]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await remove(deleteTarget.id);
      setDeleteTarget(null);
    } catch {
      // remove() already logs; keep the modal open so user can retry.
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-rhozly-on-surface flex items-center gap-2">
            <BookOpen size={22} /> Journal
          </h1>
          <p className="text-sm font-bold text-rhozly-on-surface/40 mt-1">
            Every note across your garden — from individual plants to whole-garden observations.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate("/gardener")}
            aria-label="Journal settings"
            title="Open Account settings — auto-update journal lives there"
            className="w-10 h-10 flex items-center justify-center rounded-2xl bg-white border border-rhozly-outline/20 text-rhozly-on-surface/60 hover:border-rhozly-primary/40 hover:text-rhozly-primary transition-colors"
          >
            <SettingsIcon size={16} />
          </button>
          {!composerOpen && (
            <button
              type="button"
              onClick={() => setComposerOpen(true)}
              data-testid="global-journal-new-entry"
              className="inline-flex items-center gap-1.5 bg-rhozly-primary text-white text-sm font-black px-4 py-2.5 rounded-2xl hover:opacity-90 active:scale-95 transition"
            >
              <Plus size={14} /> New entry
            </button>
          )}
        </div>
      </header>

      {composerOpen && (
        <JournalComposer
          homeId={homeId}
          onClose={() => setComposerOpen(false)}
          onSaved={() => refresh()}
          autoFocus
        />
      )}

      <div className="flex gap-1.5 flex-wrap" role="tablist" aria-label="Filter entries">
        {FILTER_OPTIONS.map((opt) => {
          const active = filter === opt.value;
          const count =
            opt.value === "all"
              ? entries.length
              : entries.filter((e) => getEntryTargetType(e) === opt.value).length;
          return (
            <button
              key={opt.value}
              role="tab"
              aria-selected={active}
              type="button"
              onClick={() => setFilter(opt.value)}
              data-testid={`journal-filter-${opt.value}`}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                active
                  ? "bg-rhozly-primary text-white border-rhozly-primary"
                  : "bg-white text-rhozly-on-surface/60 border-rhozly-outline/20 hover:border-rhozly-primary/40"
              }`}
            >
              {opt.icon}
              {opt.label}
              <span className={`text-[10px] font-black ml-0.5 ${active ? "text-white/70" : "text-rhozly-on-surface/30"}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <SurfaceLoader shape="list" label="Loading your journal…" />
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm font-bold text-red-700">
          {error}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          size="lg"
          icon={<BookOpen size={28} />}
          title={
            filter === "all"
              ? "No journal entries yet"
              : `No entries in "${FILTER_OPTIONS.find((o) => o.value === filter)?.label}"`
          }
          body={
            filter === "all"
              ? "Capture observations, milestones, and reminders. Entries can attach to a plant, location, area, plan — or stand alone."
              : "Try a different filter, or write a new entry."
          }
          primaryCta={{
            label: "Write the first entry",
            onClick: () => setComposerOpen(true),
          }}
        />
      ) : (
        <div className="space-y-8">
          {grouped.map((group) => (
            <section key={group.label} className="space-y-3">
              <h2 className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40">
                {group.label}
              </h2>
              <div className="space-y-2">
                {group.items.map((entry) => (
                  <JournalEntryCard
                    key={entry.id}
                    entry={entry}
                    targetLabels={targetLabels}
                    onDelete={setDeleteTarget}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <ConfirmModal
        isOpen={!!deleteTarget}
        title="Delete this entry?"
        description={
          deleteTarget?.subject
            ? `"${deleteTarget.subject}" will be removed permanently. This can't be undone.`
            : "This entry will be removed permanently."
        }
        confirmText="Delete"
        isDestructive
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
