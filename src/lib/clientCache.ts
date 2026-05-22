import {
  Sun,
  Cloud,
  CloudRain,
  CloudLightning,
  CloudFog,
  CloudDrizzle,
} from "lucide-react";

export const extractCurrentWeather = (meteoData: any) => {
  const data = meteoData?.data || meteoData;
  const hourly = data?.hourly;
  const targetTimezone = data?.timezone || "Europe/London";
  if (!hourly) return null;

  const now = new Date();
  let currentHourTarget = "";
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: targetTimezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hour12: false,
    });
    const p: Record<string, string> = {};
    formatter.formatToParts(now).forEach((part) => (p[part.type] = part.value));
    const hr = p.hour === "24" ? "00" : p.hour;
    currentHourTarget = `${p.year}-${p.month}-${p.day}T${hr}:00`;
  } catch {
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, "0");
    const d = String(now.getUTCDate()).padStart(2, "0");
    const hr = String(now.getUTCHours()).padStart(2, "0");
    currentHourTarget = `${y}-${m}-${d}T${hr}:00`;
  }

  const index = hourly?.time?.findIndex((t: string) =>
    t.startsWith(currentHourTarget),
  ) ?? -1;
  const i = index !== -1 ? index : 0;

  const weatherMap: Record<number, { label: string; icon: any }> = {
    0: { label: "Clear Sky", icon: Sun },
    1: { label: "Mainly Clear", icon: Sun },
    2: { label: "Partly Cloudy", icon: Cloud },
    3: { label: "Overcast", icon: Cloud },
    45: { label: "Foggy", icon: CloudFog },
    51: { label: "Light Drizzle", icon: CloudDrizzle },
    61: { label: "Light Rain", icon: CloudRain },
    63: { label: "Rain", icon: CloudRain },
    80: { label: "Rain Showers", icon: CloudRain },
    95: { label: "Thunderstorm", icon: CloudLightning },
  };

  const code = hourly.weather_code?.[i] ?? hourly.weathercode?.[i];
  const info = weatherMap[code] || { label: "Partly Cloudy", icon: Cloud };

  return {
    temp: hourly.temperature_2m?.[i] ?? 0,
    humidity: hourly.relative_humidity_2m?.[i] ?? 0,
    wind: hourly.wind_speed_10m?.[i] ?? 0,
    description: info.label,
    Icon: info.icon,
  };
};
