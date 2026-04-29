export interface ScanQuestion {
  id: string;
  question: string;
  type: "yesno" | "select" | "text";
  options?: string[];
  alwaysAsk: boolean;
}

export const SCAN_QUESTIONS: ScanQuestion[] = [
  {
    id: "main_concern",
    question: "What's your main concern with this area right now?",
    type: "select",
    options: ["General check-up", "Plant health", "Pests or disease", "Space planning", "Just curious"],
    alwaysAsk: true,
  },
  {
    id: "recent_watering",
    question: "When did you last water this area?",
    type: "select",
    options: ["Today", "Yesterday", "2–3 days ago", "A week ago", "Unsure"],
    alwaysAsk: true,
  },
  {
    id: "recent_fertilising",
    question: "Have you fertilised recently?",
    type: "yesno",
    alwaysAsk: false,
  },
  {
    id: "known_issues",
    question: "Are you aware of any pest, disease, or other issues here?",
    type: "text",
    alwaysAsk: false,
  },
];

export const getQuestionsToAsk = (alwaysOnly = false): ScanQuestion[] =>
  alwaysOnly ? SCAN_QUESTIONS.filter((q) => q.alwaysAsk) : SCAN_QUESTIONS;
