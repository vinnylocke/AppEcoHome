import fetch from "node-fetch";

let accessToken: string | null = null;
let tokenExpiry: number | null = null;

async function getAccessToken(): Promise<string | null> {
  const clientId = process.env.PLANTBOOK_CLIENT_ID;
  const clientSecret = process.env.PLANTBOOK_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.warn("Plantbook API credentials missing.");
    return null;
  }

  if (accessToken && tokenExpiry && Date.now() < tokenExpiry) {
    return accessToken;
  }

  try {
    const response = await fetch("https://open.plantbook.io/api/v1/token/", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to get Plantbook token: ${response.statusText}`);
    }

    const data = (await response.json()) as any;
    accessToken = data.access_token;
    tokenExpiry = Date.now() + data.expires_in * 1000 - 60000; // 1 minute buffer
    return accessToken;
  } catch (error) {
    console.error("Plantbook auth error:", error);
    return null;
  }
}

export async function searchPlantbookServer(query: string) {
  const token = await getAccessToken();
  if (!token) return [];

  // Normalize the query to lowercase for PID/Name matching
  const searchTerms = query.toLowerCase().trim();

  try {
    // 1. Try searching by alias (common names)
    const urlAlias = `https://open.plantbook.io/api/v1/plant/search?alias=${encodeURIComponent(searchTerms)}&limit=5`;
    const responseAlias = await fetch(urlAlias, {
      headers: { Authorization: `Bearer ${token}` },
    });

    let data = { results: [] as any[] };
    if (responseAlias.ok) {
      data = (await responseAlias.json()) as any;
    }

    // 2. If no alias results, try searching by PID/Name (case-sensitive on server side)
    if (!data.results || data.results.length === 0) {
      const urlName = `https://open.plantbook.io/api/v1/plant/search?name=${encodeURIComponent(searchTerms)}&limit=5`;
      const responseName = await fetch(urlName, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (responseName.ok) {
        data = (await responseName.json()) as any;
      }
    }

    console.log("Plantbook search response:", data);
    const results = data.results || [];

    const detailedResults = await Promise.all(
      results.map(async (result: any) => {
        return await getPlantbookDetail(result.pid, token);
      }),
    );

    return detailedResults.filter(Boolean);
  } catch (error) {
    console.error("Plantbook search error:", error);
    return [];
  }
}

async function getPlantbookDetail(pid: string, token: string) {
  try {
    console.log(`Fetching details for PID: ${pid}`); // ADD THIS LOG
    const response = await fetch(
      `https://open.plantbook.io/api/v1/plant/detail/${pid}/`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    if (!response.ok) {
      throw new Error(`Plantbook detail failed: ${response.statusText}`);
    }

    const data = (await response.json()) as any;

    return {
      name: data.display_pid || data.pid,
      scientificName: data.alias || data.pid,
      careGuide: {
        sun: translateLight(data.max_light_mmol, data.min_light_mmol),
        water: translateWater(data.max_soil_moist, data.min_soil_moist),
        soil: translateSoil(data.max_soil_ec, data.min_soil_ec),
        plantingMonth: "Spring/Summer (Typical)",
        harvestMonth: "Varies by region",
      },
    };
  } catch (error) {
    console.error("Plantbook detail error:", error);
    return null;
  }
}

function translateLight(max?: number, min?: number): string {
  if (!max && !min) return "Partial shade to full sun";
  if (max && max > 5000) return "Full sun";
  if (min && min < 1000) return "Partial shade";
  return "Moderate light";
}

function translateWater(max?: number, min?: number): string {
  if (!max && !min) return "Water when soil is dry";
  if (min && min > 30) return "Keep soil consistently moist";
  if (max && max < 20) return "Drought tolerant, water sparingly";
  return "Water 1-2 times per week";
}

function translateSoil(max?: number, min?: number): string {
  if (!max && !min) return "Well-draining garden soil";
  if (max && max > 2000) return "Rich, fertile soil";
  return "Standard well-draining soil";
}
