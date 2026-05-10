export type TriggerMode = "automatic" | "manual-only";

export type FlowCategory =
  | "Getting Started"
  | "Garden"
  | "Planning"
  | "Tools"
  | "Community";

export interface StepDef {
  title: string;
  body: string;
  attachTo: {
    element: string | null;
    on: "bottom" | "top" | "left" | "right" | null;
  };
  image?: string;
}

export interface FlowDef {
  id: string;
  trigger: TriggerMode;
  route: string;
  title: string;
  description: string;
  category: FlowCategory;
  estimated_minutes: number;
  steps: StepDef[];
}

export type OnboardingState = Record<string, "completed" | "dismissed">;
