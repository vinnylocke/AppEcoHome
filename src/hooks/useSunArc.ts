import { useMemo } from "react";
import SunCalc from "suncalc";

export interface SunArcPoint {
  time: Date;
  altitude: number; // radians
  azimuth: number;  // radians (SunCalc convention: 0=South, +westward)
}

export interface SunArcEvents {
  sunrise: Date;
  goldenHourAM: Date;  // end of morning golden hour
  solarNoon: Date;
  goldenHourPM: Date;  // start of evening golden hour
  sunset: Date;
}

export interface SunArcData {
  arc: SunArcPoint[];
  events: SunArcEvents;
  dayLengthHours: number;
}

const STEP_MS = 10 * 60 * 1000; // 10-minute intervals

export function computeSunArc(lat: number, lng: number, date: Date): SunArcData | null {
  const times = SunCalc.getTimes(date, lat, lng);
  const startMs = times.sunrise.getTime();
  const endMs = times.sunset.getTime();

  if (!isFinite(startMs) || !isFinite(endMs) || endMs <= startMs) return null;

  const arc: SunArcPoint[] = [];
  for (let t = startMs; t <= endMs; t += STEP_MS) {
    const d = new Date(t);
    const pos = SunCalc.getPosition(d, lat, lng);
    arc.push({ time: d, altitude: pos.altitude, azimuth: pos.azimuth });
  }

  // Ensure the sunset point is always included
  if (arc.length === 0 || arc[arc.length - 1].time.getTime() < endMs) {
    const pos = SunCalc.getPosition(times.sunset, lat, lng);
    arc.push({ time: times.sunset, altitude: pos.altitude, azimuth: pos.azimuth });
  }

  return {
    arc,
    events: {
      sunrise: times.sunrise,
      goldenHourAM: times.goldenHourEnd,
      solarNoon: times.solarNoon,
      goldenHourPM: times.goldenHour,
      sunset: times.sunset,
    },
    dayLengthHours: (endMs - startMs) / 3_600_000,
  };
}

/**
 * React hook that returns the sun's trajectory arc for a given location and day.
 * Memoised on lat/lng and the calendar date string — re-computes when the day changes,
 * not on every minute tick.
 */
export function useSunArc(
  lat: number | null,
  lng: number | null,
  date: Date,
): SunArcData | null {
  // Only re-compute when the date changes, not when the time changes
  const dateKey = date.toISOString().split("T")[0];

  return useMemo(() => {
    if (lat === null || lng === null) return null;
    return computeSunArc(lat, lng, new Date(dateKey + "T12:00:00"));
  // dateKey intentionally used instead of date — memoised per calendar day
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng, dateKey]);
}
