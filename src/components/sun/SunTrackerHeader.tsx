import React from "react";
import { ArrowLeft, Camera, Compass, MapPin, Calendar, Sparkles } from "lucide-react";
import { computeSunArc } from "../../hooks/useSunArc";
import type { SunArcData } from "../../hooks/useSunArc";

export type SunMode = "ar" | "dome" | "garden" | "year";

interface Props {
  mode: SunMode;
  onModeChange: (mode: SunMode) => void;
  onBack: () => void;
  latLng: { lat: number; lng: number } | null;
  selectedDate: Date;
  dayLengthHours: number | null;
  cameraAvailable: boolean;
  sunArc: SunArcData | null;
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Returns a label for the current/upcoming golden hour:
 *  - "now" if currently in a golden hour window
 *  - "at HH:mm" if there's an upcoming PM golden hour today
 *  - null if golden hour has already passed today / before sunrise
 */
function goldenHourLabel(arc: SunArcData | null, now: Date): string | null {
  if (!arc) return null;
  const t = now.getTime();
  const sunrise = arc.events.sunrise.getTime();
  const goldenAM = arc.events.goldenHourAM.getTime(); // end of morning golden
  const goldenPM = arc.events.goldenHourPM.getTime(); // start of evening golden
  const sunset  = arc.events.sunset.getTime();

  if (t >= sunrise && t <= goldenAM) return "now";
  if (t >= goldenPM && t <= sunset)  return "now";
  if (t < goldenPM) return `at ${formatTime(arc.events.goldenHourPM)}`;
  return null;
}

function formatHoursMinutes(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h} h ${m.toString().padStart(2, "0")} m`;
}

function dayLengthDelta(today: number, lastWeek: number | null): string | null {
  if (lastWeek === null) return null;
  const deltaMin = Math.round((today - lastWeek) * 60);
  if (deltaMin === 0) return "same as last week";
  if (deltaMin > 0) return `${deltaMin} min longer than last week`;
  return `${Math.abs(deltaMin)} min shorter than last week`;
}

const MODES: Array<{ id: SunMode; label: string; shortLabel: string; icon: React.ComponentType<{ size?: number }> }> = [
  { id: "ar",     label: "Live AR",    shortLabel: "AR",     icon: Camera   },
  { id: "dome",   label: "Sky View",   shortLabel: "Sky",    icon: Compass  },
  { id: "garden", label: "Garden Map", shortLabel: "Map",    icon: MapPin   },
  { id: "year",   label: "Year View",  shortLabel: "Year",   icon: Calendar },
];

export default function SunTrackerHeader({
  mode,
  onModeChange,
  onBack,
  latLng,
  selectedDate,
  dayLengthHours,
  cameraAvailable,
  sunArc,
}: Props) {
  // Compute last-week's day length for context
  const lastWeekDayLength = React.useMemo(() => {
    if (!latLng) return null;
    const lastWeek = new Date(selectedDate);
    lastWeek.setDate(lastWeek.getDate() - 7);
    const arc = computeSunArc(latLng.lat, latLng.lng, lastWeek);
    return arc?.dayLengthHours ?? null;
  }, [latLng, selectedDate]);

  const delta = dayLengthHours !== null ? dayLengthDelta(dayLengthHours, lastWeekDayLength) : null;

  // Golden hour chip — only show when viewing today (within ±60s of selectedDate)
  const isToday = React.useMemo(() => {
    const now = new Date();
    return now.toDateString() === selectedDate.toDateString();
  }, [selectedDate]);
  const golden = isToday ? goldenHourLabel(sunArc, selectedDate) : null;

  return (
    <div className="absolute top-0 left-0 right-0 z-20 bg-gradient-to-b from-black/70 via-black/40 to-transparent pb-4">
      {/* Top row: back + title */}
      <div className="flex items-start gap-3 px-3 sm:px-4 pt-3">
        <button
          data-testid="sun-tracker-back"
          onClick={onBack}
          className="w-11 h-11 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white shrink-0 hover:bg-black/70 transition-colors"
          aria-label="Back to Tools"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0 pt-1">
          <h1 className="text-white font-black text-lg leading-tight">Sun Tracker</h1>
          {dayLengthHours !== null ? (
            <p className="text-white/80 text-xs font-bold leading-snug drop-shadow">
              {formatHoursMinutes(dayLengthHours)} of daylight today
              {delta && <span className="text-white/55"> · {delta}</span>}
            </p>
          ) : latLng ? (
            <p className="text-white/60 text-xs font-semibold">Loading day length…</p>
          ) : (
            <p className="text-amber-300 text-xs font-semibold">No home location set</p>
          )}
        </div>
      </div>

      {/* Golden hour chip — only when relevant today */}
      {golden && (
        <div className="mt-2 mx-3 sm:mx-4 flex">
          <button
            data-testid="sun-tracker-golden-chip"
            onClick={() => onModeChange("ar")}
            className="inline-flex items-center gap-1.5 bg-amber-500/90 hover:bg-amber-500 text-white px-3 py-1.5 min-h-[32px] rounded-full text-[11px] font-black shadow-md border border-amber-300/30 transition-colors"
            title={golden === "now" ? "Golden hour now — great light for photos" : "Upcoming golden hour today"}
          >
            <Sparkles size={12} />
            {golden === "now" ? "Golden hour now" : `Golden hour ${golden}`}
          </button>
        </div>
      )}

      {/* Mode tabs */}
      <div
        role="tablist"
        aria-label="Sun Tracker mode"
        className="mt-3 mx-3 sm:mx-4 flex gap-1 bg-black/50 backdrop-blur-md p-1 rounded-2xl border border-white/10"
      >
        {MODES.map((m) => {
          const Icon = m.icon;
          const isActive = mode === m.id;
          const isAr = m.id === "ar";
          const disabled = isAr && !cameraAvailable;
          return (
            <button
              key={m.id}
              role="tab"
              aria-selected={isActive}
              aria-disabled={disabled}
              data-testid={`sun-tracker-mode-${m.id}`}
              onClick={() => !disabled && onModeChange(m.id)}
              className={`flex-1 min-h-[44px] flex items-center justify-center gap-1.5 rounded-xl text-[11px] sm:text-xs font-black uppercase tracking-widest transition-all ${
                isActive
                  ? "bg-amber-500 text-white shadow-md"
                  : disabled
                    ? "text-white/30 cursor-not-allowed"
                    : "text-white/70 hover:text-white hover:bg-white/5"
              }`}
              title={disabled ? "Camera unavailable on this device" : undefined}
            >
              <Icon size={14} />
              <span className="hidden sm:inline">{m.label}</span>
              <span className="sm:hidden">{m.shortLabel}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
