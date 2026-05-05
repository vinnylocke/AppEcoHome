import SunCalc from "suncalc";

export function useSunPosition(
  lat: number | null,
  lng: number | null,
  date: Date
): { altitude: number; azimuth: number } | null {
  if (lat === null || lng === null) return null;
  const pos = SunCalc.getPosition(date, lat, lng);
  return { altitude: pos.altitude, azimuth: pos.azimuth };
}
