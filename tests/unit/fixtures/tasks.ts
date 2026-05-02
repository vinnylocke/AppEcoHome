let _seq = 0;
const uid = (prefix: string) => `${prefix}-${++_seq}`;

// Matches the shape returned by Supabase `tasks` table rows used across the app.
export interface Task {
  id: string;
  home_id: string;
  blueprint_id: string | null;
  title: string;
  description: string | null;
  type: string;
  due_date: string;
  status: "Pending" | "Completed" | "Skipped";
  location_id: string | null;
  area_id: string | null;
  plan_id: string | null;
  inventory_item_ids: string[];
  created_at: string;
  updated_at: string | null;
  auto_completed_reason: string | null;
  // Joined relations
  locations?: { name: string; is_outside: boolean } | null;
  areas?: { name: string } | null;
  plans?: { name: string } | null;
  isGhost?: boolean;
}

// Matches `task_blueprints` table rows used by the ghost task engine.
export interface TaskBlueprint {
  id: string;
  home_id: string;
  title: string;
  description: string | null;
  task_type: string;
  frequency_days: number;
  start_date: string;
  end_date: string | null;
  is_recurring: boolean;
  location_id: string | null;
  area_id: string | null;
  plan_id: string | null;
  ailment_id: string | null;
  blueprint_type: string | null;
  inventory_item_ids: string[];
  priority: "Low" | "Medium" | "High";
  // Joined relations
  locations?: { name: string; is_outside: boolean } | null;
  areas?: { name: string } | null;
  plans?: { name: string } | null;
}

export function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: uid("task"),
    home_id: uid("home"),
    blueprint_id: null,
    title: "Water plants",
    description: null,
    type: "Watering",
    due_date: "2026-05-01",
    status: "Pending",
    location_id: null,
    area_id: null,
    plan_id: null,
    inventory_item_ids: [],
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: null,
    auto_completed_reason: null,
    locations: null,
    areas: null,
    plans: null,
    ...overrides,
  };
}

export function makeTaskBlueprint(overrides: Partial<TaskBlueprint> = {}): TaskBlueprint {
  return {
    id: uid("bp"),
    home_id: uid("home"),
    title: "Weekly Watering",
    description: null,
    task_type: "Watering",
    frequency_days: 7,
    start_date: "2026-01-01",
    end_date: null,
    is_recurring: true,
    location_id: null,
    area_id: null,
    plan_id: null,
    ailment_id: null,
    blueprint_type: null,
    inventory_item_ids: [],
    priority: "Medium",
    locations: null,
    areas: null,
    plans: null,
    ...overrides,
  };
}
