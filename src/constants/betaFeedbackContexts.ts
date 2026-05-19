export const BETA_FEEDBACK_CONTEXTS = {
  complete_task:       { label: "How was completing that task?",    criteria: ["Was this task relevant?", "Is the timing right?"] },
  add_plant:           { label: "How was adding that plant?",        criteria: ["How easy was it?", "Did you find what you needed?"] },
  doctor_diagnosis:    { label: "How was the plant diagnosis?",      criteria: ["How accurate was it?", "Was the advice useful?"] },
  blueprint_create:    { label: "How was creating that schedule?",   criteria: ["Was it easy to set up?", "Is the frequency right for you?"] },
  ailment_add:         { label: "How was logging that ailment?",     criteria: ["Was it easy to log?", "Were the suggestions useful?"] },
  optimise_apply:      { label: "How were those optimisations?",     criteria: ["Were the suggestions useful?", "Easy to understand?"] },
  guide_read:          { label: "How was that guide?",               criteria: ["Was it helpful?", "Was it relevant to you?"] },
  shopping_item_check: { label: "How's the shopping list?",          criteria: ["Is it easy to manage?", "Useful for your gardening?"] },
  location_create:     { label: "How was adding that location?",     criteria: ["Was it easy to set up?", "Are the options clear?"] },
  area_create:         { label: "How was adding that area?",         criteria: ["Was it easy to set up?", "Are the options clear?"] },
  plant_assign_area:   { label: "How was assigning that plant?",     criteria: ["Was the process clear?", "Did you find the right area?"] },
} as const;

export type FeedbackContext = keyof typeof BETA_FEEDBACK_CONTEXTS;
