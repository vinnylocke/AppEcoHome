import React from "react";
import type {
  SowingCalendarBand,
  SowingActivity,
} from "../../lib/sowingCalendarFromGrowGuide";

/**
 * Pure presentational component — renders a 12-month strip with one
 * coloured band per sowing activity. Hemisphere-aware: the parent passes
 * the month order it wants (Jan→Dec for northern, Jul→Jun for southern
 * so the user's spring/summer falls roughly in the middle of the strip).
 *
 * Each band is a sub-row positioned over the months it spans. Tapping a
 * band fires `onBandClick` so the parent can open AddToCalendarSheet
 * pre-filled with the source task.
 */

interface Props {
  bands: SowingCalendarBand[];
  /** 0-indexed month numbers in display order. Length must be 12. */
  monthOrder: number[];
  onBandClick?: (band: SowingCalendarBand) => void;
  /** Highlights the column for "today's month" when set (0-11). */
  todayMonth?: number;
}

const ACTIVITY_CLASS: Record<SowingActivity, string> = {
  sow_indoors: "bg-emerald-500 text-white",
  sow_direct: "bg-amber-500 text-white",
  transplant_out: "bg-sky-500 text-white",
};

const MONTH_ABBREVS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

interface PositionedBand {
  band: SowingCalendarBand;
  /** 0-indexed start position within `monthOrder`. */
  startSlot: number;
  /** Inclusive end position. */
  endSlot: number;
}

/**
 * Maps each band onto positions within `monthOrder`. A band's months are
 * intrinsically calendar months (0-11); we have to find where those
 * months sit in the display order. Non-contiguous months produce
 * multiple positioned bands so the rendered chip splits visually.
 */
function positionBands(
  bands: SowingCalendarBand[],
  monthOrder: number[],
): PositionedBand[] {
  const out: PositionedBand[] = [];
  for (const band of bands) {
    if (band.months.length === 0) {
      // Year-round → single band spanning all 12 slots.
      out.push({ band, startSlot: 0, endSlot: 11 });
      continue;
    }
    const slotsInOrder = band.months
      .map((m) => monthOrder.indexOf(m))
      .filter((s) => s >= 0)
      .sort((a, b) => a - b);
    if (slotsInOrder.length === 0) continue;
    // Break into contiguous runs.
    let runStart = slotsInOrder[0];
    let prev = slotsInOrder[0];
    for (let i = 1; i < slotsInOrder.length; i++) {
      const cur = slotsInOrder[i];
      if (cur === prev + 1) {
        prev = cur;
        continue;
      }
      out.push({ band, startSlot: runStart, endSlot: prev });
      runStart = cur;
      prev = cur;
    }
    out.push({ band, startSlot: runStart, endSlot: prev });
  }
  return out;
}

export default function SowingCalendarMonthStrip({
  bands,
  monthOrder,
  onBandClick,
  todayMonth,
}: Props) {
  const positioned = positionBands(bands, monthOrder);

  // Group positioned bands by activity to render in separate rows so
  // overlapping windows stay readable.
  const rows: Array<{ activity: SowingActivity; items: PositionedBand[] }> = [
    { activity: "sow_indoors", items: [] },
    { activity: "sow_direct", items: [] },
    { activity: "transplant_out", items: [] },
  ];
  for (const p of positioned) {
    const row = rows.find((r) => r.activity === p.band.activity);
    if (row) row.items.push(p);
  }

  return (
    <div className="bg-white border border-rhozly-outline/15 rounded-2xl p-4 overflow-x-auto" data-testid="sowing-calendar-strip">
      <div className="min-w-[640px]">
        {/* Month header row */}
        <div className="grid grid-cols-12 gap-1 mb-2">
          {monthOrder.map((m, i) => {
            const isToday = todayMonth === m;
            return (
              <div
                key={`${m}-${i}`}
                className={`text-center text-[10px] font-black uppercase tracking-widest py-1 rounded-md ${
                  isToday
                    ? "bg-rhozly-primary/10 text-rhozly-primary"
                    : "text-rhozly-on-surface/40"
                }`}
              >
                {MONTH_ABBREVS[m]}
              </div>
            );
          })}
        </div>

        {/* Activity rows — empty placeholders for the empty rows still show so
            the user sees there's nothing to do at that stage. */}
        <div className="space-y-1.5">
          {rows.map((row) => {
            const label =
              row.activity === "sow_indoors"
                ? "Sow indoors"
                : row.activity === "sow_direct"
                  ? "Direct sow"
                  : "Transplant out";
            return (
              <div key={row.activity} className="grid grid-cols-12 gap-1 relative">
                {/* Empty cell underlay so the row has visual height. */}
                {Array.from({ length: 12 }).map((_, i) => (
                  <div
                    key={i}
                    className={`h-8 rounded-md bg-rhozly-surface-low/70 ${
                      todayMonth === monthOrder[i]
                        ? "ring-1 ring-inset ring-rhozly-primary/20"
                        : ""
                    }`}
                  />
                ))}
                {/* Bands overlaid on top. Each band is absolutely positioned
                    so it spans multiple month columns cleanly. */}
                {row.items.map((p, i) => {
                  const span = p.endSlot - p.startSlot + 1;
                  const leftPct = (p.startSlot / 12) * 100;
                  const widthPct = (span / 12) * 100;
                  return (
                    <button
                      key={`${p.band.id}-${i}`}
                      type="button"
                      onClick={() => onBandClick?.(p.band)}
                      title={`${p.band.sourceTask.title} — tap to add to calendar`}
                      data-testid={`sowing-band-${p.band.activity}`}
                      className={`absolute top-0 h-8 rounded-md text-[10px] font-black flex items-center justify-center px-2 truncate hover:opacity-90 active:scale-95 transition ${
                        ACTIVITY_CLASS[p.band.activity]
                      }`}
                      style={{
                        left: `calc(${leftPct}% + ${p.startSlot * 0.25}rem)`,
                        width: `calc(${widthPct}% - 0.25rem)`,
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="mt-4 flex items-center gap-4 text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/50 flex-wrap">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-emerald-500" /> Sow indoors
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-amber-500" /> Direct sow
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-sky-500" /> Transplant out
          </span>
        </div>
      </div>
    </div>
  );
}
