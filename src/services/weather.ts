import { WeatherData } from "../types";

const API_KEY = import.meta.env.VITE_WEATHER_API_KEY;

export async function fetchWeather(lat: number, lon: number): Promise<WeatherData> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,dew_point_2m,precipitation,surface_pressure,wind_speed_10m,uv_index,weather_code&hourly=temperature_2m,precipitation,weather_code,wind_speed_10m&timezone=auto`;
  
  const response = await fetch(url);
  const data = await response.json();

  if (!data.current) throw new Error("Weather data not available");

  const current = data.current;
  const hourly = data.hourly;

  const getCondition = (code: number) => {
    if (code >= 1 && code <= 3) return 'Cloudy';
    if (code >= 45 && code <= 48) return 'Fog';
    if (code >= 51 && code <= 67) return 'Rain';
    if (code >= 71 && code <= 77) return 'Snow';
    if (code >= 95) return 'Thunderstorm';
    return 'Clear';
  };

  const condition = getCondition(current.weather_code);

  const currentTimeStr = current.time || new Date().toISOString();
  const currentHourStr = currentTimeStr.slice(0, 14) + "00";
  let currentIndex = hourly.time.indexOf(currentHourStr);
  if (currentIndex === -1) currentIndex = 0;

  const forecast = [];
  for (let i = currentIndex; i < currentIndex + 12 && i < hourly.time.length; i++) {
    forecast.push({
      date: hourly.time[i],
      temp: hourly.temperature_2m[i],
      condition: getCondition(hourly.weather_code[i]),
      rain: hourly.precipitation[i],
    });
  }

  // Next 24 hours from now for general rain expectation
  const next24hPrecip = hourly.precipitation.slice(currentIndex, currentIndex + 24);
  const rainAmount = next24hPrecip.reduce((a: number, b: number) => a + b, 0);
  const rainExpected = rainAmount > 5;

  // Helper to calculate warnings for a 24h period or less
  const calculateWarnings = (times: string[], temps: number[], precips: number[], winds: number[]) => {
    const frostIndices: number[] = [];
    const heatIndices: number[] = [];
    const windIndices: number[] = [];
    const rainIndices: number[] = [];

    let maxWind = 0;
    let totalRain = 0;

    for (let i = 0; i < times.length; i++) {
      if (temps[i] < 2) frostIndices.push(i);
      if (temps[i] > 32) heatIndices.push(i);
      if (winds[i] >= 29) {
        windIndices.push(i);
        if (winds[i] > maxWind) maxWind = winds[i];
      }
      if (precips[i] > 0) {
        rainIndices.push(i);
        totalRain += precips[i];
      }
    }

    const formatTimeRange = (indices: number[]) => {
      if (indices.length === 0) return undefined;
      const startStr = times[indices[0]].split('T')[1].slice(0, 5);
      const endStr = times[indices[indices.length - 1]].split('T')[1].slice(0, 5);
      if (startStr === endStr) return startStr;
      return `${startStr} - ${endStr}`;
    };

    return {
      frost: { active: frostIndices.length > 0, timePeriod: formatTimeRange(frostIndices) },
      heat: { active: heatIndices.length > 0, timePeriod: formatTimeRange(heatIndices) },
      wind: { 
        active: windIndices.length > 0, 
        timePeriod: formatTimeRange(windIndices), 
        maxSpeed: maxWind,
        severity: getWindSeverity(maxWind),
        description: getWindDescription(maxWind)
      },
      rain: { active: rainIndices.length > 0, timePeriod: formatTimeRange(rainIndices), amount: totalRain },
    };
  };

  const getWindSeverity = (speed: number): 'Low to Moderate' | 'Moderate to Strong' | 'High' | 'Extreme' => {
    if (speed >= 89) return 'Extreme';
    if (speed >= 50) return 'High';
    if (speed >= 29) return 'Moderate to Strong';
    return 'Low to Moderate';
  };

  const getWindDescription = (speed: number) => {
    if (speed >= 118) return 'Hurricane. Devastation; widespread destruction.';
    if (speed >= 103) return 'Violent Storm. Widespread damage.';
    if (speed >= 89) return 'Storm. Trees are uprooted; considerable structural damage.';
    if (speed >= 75) return 'Strong Gale. Slight structural damage occurs.';
    if (speed >= 62) return 'Gale. Twigs break off trees; walking is generally impeded.';
    if (speed >= 50) return 'Near Gale. Whole trees in motion; walking is inconvenient.';
    if (speed >= 39) return 'Strong Breeze. Large branches in motion; whistling heard.';
    if (speed >= 29) return 'Fresh Breeze. Small trees in leaf begin to sway.';
    return 'Moderate Breeze or less.';
  };

  // Today's warnings (from current hour to end of day)
  const currentDateStr = currentHourStr.split('T')[0];
  const todayIndices = hourly.time.reduce((acc: number[], t: string, i: number) => {
    if (t.startsWith(currentDateStr) && t >= currentHourStr) acc.push(i);
    return acc;
  }, []);

  const todayWarnings = calculateWarnings(
    todayIndices.map((i: number) => hourly.time[i]),
    todayIndices.map((i: number) => hourly.temperature_2m[i]),
    todayIndices.map((i: number) => hourly.precipitation[i]),
    todayIndices.map((i: number) => hourly.wind_speed_10m[i])
  );

  // Tomorrow's warnings (full 24h)
  const tomorrowDate = new Date(new Date(currentDateStr).getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const tomorrowIndices = hourly.time.reduce((acc: number[], t: string, i: number) => {
    if (t.startsWith(tomorrowDate)) acc.push(i);
    return acc;
  }, []);

  const tomorrowWarnings = calculateWarnings(
    tomorrowIndices.map((i: number) => hourly.time[i]),
    tomorrowIndices.map((i: number) => hourly.temperature_2m[i]),
    tomorrowIndices.map((i: number) => hourly.precipitation[i]),
    tomorrowIndices.map((i: number) => hourly.wind_speed_10m[i])
  );

  return {
    temp: current.temperature_2m,
    condition,
    rainExpected,
    rainAmount,
    isFrostWarning: todayWarnings.frost.active || tomorrowWarnings.frost.active,
    forecast,
    humidity: current.relative_humidity_2m,
    windSpeed: current.wind_speed_10m,
    dewPoint: current.dew_point_2m,
    uvIndex: current.uv_index,
    pressure: current.surface_pressure,
    todayWarnings,
    tomorrowWarnings,
    nextDayWarnings: tomorrowWarnings, // Keep for backward compatibility
  };
}

export async function geocodeAddress(address: string): Promise<{ lat: number; lon: number } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'EcoHome Gardening App'
      }
    });
    const data = await response.json();
    if (data && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lon: parseFloat(data[0].lon)
      };
    }
    return null;
  } catch (error) {
    console.error('Geocoding error:', error);
    return null;
  }
}
