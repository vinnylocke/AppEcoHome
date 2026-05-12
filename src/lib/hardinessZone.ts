const USDA_BANDS: Array<{ maxC: number; zone: number }> = [
  { maxC: -51.1, zone: 1  },
  { maxC: -45.6, zone: 2  },
  { maxC: -40.0, zone: 3  },
  { maxC: -34.4, zone: 4  },
  { maxC: -28.9, zone: 5  },
  { maxC: -23.3, zone: 6  },
  { maxC: -17.8, zone: 7  },
  { maxC: -12.2, zone: 8  },
  { maxC:  -6.7, zone: 9  },
  { maxC:  -1.1, zone: 10 },
  { maxC:   4.4, zone: 11 },
  { maxC:  10.0, zone: 12 },
];

function tempToZone(minTempC: number): number {
  for (const band of USDA_BANDS) {
    if (minTempC <= band.maxC) return band.zone;
  }
  return 13;
}

/**
 * Fetch the USDA hardiness zone for a lat/lng from the Open-Meteo Climate API.
 * Uses the average annual minimum temperature over the past 10 complete years.
 * Returns a zone integer 1–13.
 */
export async function fetchUsdaZone(lat: number, lng: number): Promise<number> {
  const endYear = new Date().getFullYear() - 1;
  const startYear = endYear - 9;

  const params = new URLSearchParams({
    latitude:   lat.toFixed(4),
    longitude:  lng.toFixed(4),
    start_date: `${startYear}-01-01`,
    end_date:   `${endYear}-12-31`,
    daily:      "temperature_2m_min",
    timezone:   "UTC",
  });

  const res = await fetch(`https://climate-api.open-meteo.com/v1/climate?${params}`);
  if (!res.ok) throw new Error(`Climate API ${res.status}`);
  const data = await res.json();

  const temps: (number | null)[] = data.daily?.temperature_2m_min ?? [];
  const times: string[]          = data.daily?.time ?? [];
  if (!temps.length) throw new Error("No climate data");

  const yearMins: Record<string, number> = {};
  for (let i = 0; i < temps.length; i++) {
    const t = temps[i];
    if (t == null) continue;
    const yr = times[i].slice(0, 4);
    if (yearMins[yr] === undefined || t < yearMins[yr]) yearMins[yr] = t;
  }

  const mins = Object.values(yearMins);
  if (!mins.length) throw new Error("No annual minimums");

  const avgMin = mins.reduce((a, b) => a + b, 0) / mins.length;
  return tempToZone(avgMin);
}
