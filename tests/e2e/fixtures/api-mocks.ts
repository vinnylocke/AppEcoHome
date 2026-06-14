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

// ---- Canned `agent-chat` chat responses (PR 4) ----
// Edge-function payload contract per src/components/PlantDoctorChat.tsx
// — the text path uses `agent-chat` and returns `reply`. When the function
// doesn't return `messageId`, the client persists the assistant row itself
// (the duplicate-on-reload guard, Wave 22.0023). Leaving `messageId` unset
// in test mocks is intentional so the row goes into chat_messages — that
// means the close-and-reopen reload assertion (CHAT-003) works.

/** Simple text reply — no suggested plants/tasks/actions. */
export const MOCK_PLANT_DOCTOR_AI_TEXT = {
  reply:
    "Tomatoes love full sun and consistent watering — water about 2-3 times per week.",
};

/** Reply that includes suggested plants → renders ChatPlantCards + PlantActionButtons. */
export const MOCK_PLANT_DOCTOR_AI_SUGGESTED_PLANTS = {
  reply: "Here are a few options that grow well together:",
  suggested_plants: [
    { name: "Tomato", search_query: "Solanum lycopersicum" },
    { name: "Basil", search_query: "Ocimum basilicum" },
  ],
};

/** Reply that includes suggested tasks → renders TaskActionButtons. */
export const MOCK_PLANT_DOCTOR_AI_SUGGESTED_TASKS = {
  reply: "Weekly watering and a fortnightly feed should do it.",
  suggested_tasks: [
    {
      title: "Water tomato",
      description: "Deep watering twice a week.",
      task_type: "Watering" as const,
      due_in_days: 0,
      is_recurring: true,
      frequency_days: 3,
    },
  ],
};

/** Cucumber-not-in-Shed regression case (Wave 22.0023) — agent-chat
 *  surfaces this via a `pendingToolCalls` entry for the `add_plant_to_shed`
 *  tool, which renders as an inline ToolConfirmCard. */
export const MOCK_PLANT_DOCTOR_AI_ADD_TO_SHED = {
  reply:
    "Cucumbers love a sunny spot. I don't see one in your Shed — want to add it?",
  pendingToolCalls: [
    {
      id: "test-call-cucumber-001",
      tool: "add_plant_to_shed",
      args: {
        common_name: "Cucumber",
        scientific_name: "Cucumis sativus",
      },
      risk_level: "confirm",
      preview: "Add Cucumber (Cucumis sativus) to your Shed.",
    },
  ],
};

/** Plan-suggestion case — renders PlanSuggestionCard with "Create this Plan". */
export const MOCK_PLANT_DOCTOR_AI_PLAN_SUGGESTION = {
  reply: "Looks like you're planning a salad bed. Want to formalise that?",
  plan_suggestion: {
    headline: "Salad bed for summer",
    plan_name: "Summer Salad Bed",
    description:
      "Tomato + Cucumber + Basil + Lettuce in one shared raised bed.",
    plants_of_interest: ["Tomato", "Cucumber", "Basil", "Lettuce"],
  },
};

export const MOCK_PREDICT_YIELD = {
  estimated_value: 2.4,
  unit: "kg",
  confidence: "medium",
  reasoning:
    "Based on 3 past harvests averaging 1.8 kg and favorable spring weather, a slightly higher yield is expected.",
  tips: [
    "Ensure consistent watering during fruit set.",
    "Apply potassium-rich fertiliser two weeks before harvest.",
  ],
};
