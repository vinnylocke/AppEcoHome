import type { Page, Route } from "@playwright/test";

// Note: Gemini and Open-Meteo are called server-side from Supabase Edge Functions,
// so Playwright's route() cannot intercept those requests. These helpers intercept
// browser-level calls only (direct fetch from the frontend to external services).
//
// For AI-heavy flows (Plant Doctor, Planner), the recommended approach is to
// run against a local Supabase instance and stub the edge function responses at
// the DB level, OR accept a real Gemini call in a dedicated slow-test suite.

// ---- Supabase Edge Function mocks ----
// Intercept calls to a specific edge function and return a canned response.
// Usage: await mockEdgeFunction(page, 'plant-doctor', { notes: '...', possible_names: [] })

export async function mockEdgeFunction(
  page: Page,
  functionName: string,
  response: object,
  statusCode = 200,
): Promise<void> {
  await page.route(
    `**/functions/v1/${functionName}`,
    (route: Route) => {
      route.fulfill({
        status: statusCode,
        contentType: "application/json",
        body: JSON.stringify(response),
      });
    },
  );
}

// ---- Canned AI responses for Phase 6 tests ----

export const MOCK_PLANT_DOCTOR_IDENTIFY = {
  notes: "This appears to be a healthy tomato plant (Solanum lycopersicum).",
  possible_names: ["Tomato", "Cherry Tomato"],
};

export const MOCK_PLANT_DOCTOR_DIAGNOSE = {
  notes: "Signs of early blight detected on lower leaves.",
  possible_diseases: ["Early Blight"],
  possible_names: ["Tomato"],
  remedial_schedules: [
    { title: "Apply fungicide", description: "Spray leaves weekly.", is_recurring: true, frequency_days: 7 },
  ],
};

export const MOCK_SCAN_AREA = {
  summary: "A well-maintained raised bed with tomatoes and basil.",
  capacity: { current_count: 3, estimated_max: 6, label: "Well stocked" as const },
  plants: [
    {
      identified_name: "Tomato",
      scientific_name: "Solanum lycopersicum",
      confidence: 0.92,
      health_status: "good" as const,
      health_notes: "Looks healthy.",
      position_suitability: "good" as const,
      position_notes: "Well positioned.",
    },
  ],
  companions: [],
  maintenance: [],
  pests_diseases: [],
  soil_conditions: { observed_medium: "soil", drainage_notes: "Good", recommendations: "None" },
  weather_advice: "No weather concerns currently.",
};

export const MOCK_WATCHLIST_AI_RESULT = {
  results: [
    {
      name: "Aphid",
      scientific_name: "Aphidoidea",
      type: "pest",
      description: "Small sap-sucking insects that cluster on young growth.",
      symptoms: ["Sticky residue", "Curled leaves", "Distorted shoots"],
      prevention_steps: ["Encourage ladybirds", "Use reflective mulch"],
      remedy_steps: ["Blast with water", "Apply neem oil"],
      affected_plants: ["Rose", "Tomato", "Pepper"],
    },
  ],
};

export const MOCK_WEATHER_SNAPSHOT = {
  daily: Array.from({ length: 7 }, (_, i) => ({
    date: (() => { const d = new Date("2026-05-01"); d.setDate(d.getDate() + i - 1); return d.toISOString().split("T")[0]; })(),
    precipMm: 0,
    maxTempC: 18 + i,
    minTempC: 10,
    maxWindKph: 20,
    wmoCode: 0,
    precipProbability: 10,
  })),
  hourly: [],
  fetchedAt: "2026-05-01T08:00:00.000Z",
};
