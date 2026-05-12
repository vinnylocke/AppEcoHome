/**
 * Per-action fallback payloads returned when an AI call fails.
 *
 * Each fallback matches the exact shape the frontend expects so no
 * UI breakage occurs. The user sees a graceful "try again" message
 * rather than an error toast.
 */

const FALLBACKS: Record<string, unknown> = {
  diagnose: {
    notes: "Unable to analyse this image right now. Please try again in a moment.",
    possible_diseases: [],
    severity: null,
    environmental_factors: null,
    immediate_actions: null,
    possible_names: null,
  },
  identify_vision: {
    notes: "Plant identification is temporarily unavailable. Please try again in a moment.",
    possible_names: [],
  },
  identify_pest: {
    notes: "Pest identification is temporarily unavailable. Please try again in a moment.",
    possible_pests: [],
    is_pest: false,
    pest_severity: null,
  },
  generate_care_guide: {
    plantData: null,
  },
  recommend_plants: {
    recommendations: [],
  },
  get_ai_disease_info: {
    diseaseInfo: {
      description: "Detailed information is temporarily unavailable.",
      solution: "Please try again in a moment or consult a local garden centre.",
      source: "fallback",
    },
  },
  get_ai_pest_info: {
    pestInfo: {
      description: "Detailed pest information is temporarily unavailable.",
      affected_plants: "Unknown",
      treatment: "Please try again in a moment.",
      prevention: "Please try again in a moment.",
      source: "fallback",
    },
  },
  generate_remedial_plan: {
    remedial_schedules: [],
  },
  search_plants_text: {
    matches: [],
  },
  plant_doctor_chat: {
    reply: "I'm having a little trouble right now. Please try again in a moment.",
    suggested_plants: [],
    suggested_tasks: [],
    preferences_captured: 0,
  },
  search_plants_ai: {
    plants: [],
  },
  ailment_suggestions: {
    results: [],
  },
  generate_guide: {
    guide_data: {
      title: "Temporarily Unavailable",
      subtitle: "Guide generation is temporarily unavailable.",
      difficulty: "Easy",
      estimated_minutes: 0,
      sections: [
        {
          type: "paragraph",
          content:
            "We're unable to generate this guide right now. Please try again in a few minutes.",
        },
      ],
    },
    labels: [],
  },
};

/** Return the fallback payload for the given key, or a generic error object. */
export function getFallback(key: string): unknown {
  return FALLBACKS[key] ?? { error: "Service temporarily unavailable. Please try again." };
}
