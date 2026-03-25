import { WeatherData } from "../types";

const API_KEY = import.meta.env.VITE_WEATHER_API_KEY;

const WMO_CODE_MAP: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
  45: "Fog", 48: "Depositing rime fog",
  51: "Light drizzle", 53: "Moderate drizzle", 55: "Dense drizzle",
  61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
  71: "Slight snow", 73: "Moderate snow", 75: "Heavy snow",
  80: "Slight rain showers", 81: "Moderate rain showers", 82: "Violent rain showers",
  95: "Thunderstorm",
};

export const fetchWeather = async (lat: number, lon: number) => {
  const params = new URLSearchParams({
    latitude: lat.toString(),
    longitude: lon.toString(),
    // 'current' includes all your requested stats
    current: 'temperature_2m,relative_humidity_2m,rain,weather_code,surface_pressure,wind_speed_10m,dew_point_2m',
    // 'hourly' gives us the 24-hour forecast data
    hourly: 'temperature_2m,weather_code,uv_index',
    daily: 'uv_index_max,rain_sum',
    timezone: 'auto',
    forecast_days: '1'
  });

  const url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error("Weather fetch failed");

  const data = await response.json();
  const weatherCode = data.current.weather_code;
  
  // Map 24-hour forecast
  const hourlyForecast = data.hourly.time.map((time: string, index: number) => ({
    time: time,
    temp: data.hourly.temperature_2m[index],
    code: data.hourly.weather_code[index],
    uv: data.hourly.uv_index[index]
  }));

  return {
  temp: data.current.temperature_2m,
  condition: WMO_CODE_MAP[weatherCode] || "Unknown",
  humidity: data.current.relative_humidity_2m,
  rainExpected: data.current.rain > 0 || (data.daily?.rain_sum?.[0] || 0) > 0,
  windSpeed: data.current.wind_speed_10m,
  pressure: data.current.surface_pressure,
  // ✅ Use the daily maximum UV instead of the current hour
  uvMax: data.daily.uv_index_max[0], 
  dewPoint: data.current.dew_point_2m,
  forecast24h: hourlyForecast 
};
};

export async function geocodeAddress(
  address: string,
): Promise<{ lat: number; lon: number } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "EcoHome Gardening App",
      },
    });
    const data = await response.json();
    if (data && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lon: parseFloat(data[0].lon),
      };
    }
    return null;
  } catch (error) {
    console.error("Geocoding error:", error);
    return null;
  }
}
