export interface AchievementStats {
  plantAdded: number;
  plantPruned: number;
  plantHarvested: number;
  taskCompleted: number;
  aiIdentify: number;
  aiDiagnose: number;
  planCompleted: number;
  blueprintCreated: number;
  ailmentAdded: number;
  ailmentResolved: number;
  profileComplete: boolean;
}

export interface AchievementProgress {
  current: number;
  total: number;
}

export interface AchievementDef {
  key: string;
  label: string;
  description: string;
  category: "growing" | "tasks" | "ai" | "planning" | "health" | "explorer";
  icon: string;
  check: (stats: AchievementStats) => boolean;
  progress?: (stats: AchievementStats) => AchievementProgress;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  // ── Growing ──────────────────────────────────────────────────
  {
    key: "early_adopter",
    label: "Early Adopter",
    description: "Joined Rhozly and started your gardening journey",
    category: "explorer",
    icon: "🌱",
    check: () => true,
  },
  {
    key: "first_plant",
    label: "Green Thumb",
    description: "Added your first plant to the shed",
    category: "growing",
    icon: "🌿",
    check: (s) => s.plantAdded >= 1,
  },
  {
    key: "plant_5",
    label: "Budding Gardener",
    description: "Added 5 plants to your shed",
    category: "growing",
    icon: "🪴",
    check: (s) => s.plantAdded >= 5,
    progress: (s) => ({ current: Math.min(s.plantAdded, 5), total: 5 }),
  },
  {
    key: "plant_25",
    label: "Plant Collector",
    description: "Added 25 plants to your shed",
    category: "growing",
    icon: "🌳",
    check: (s) => s.plantAdded >= 25,
    progress: (s) => ({ current: Math.min(s.plantAdded, 25), total: 25 }),
  },
  {
    key: "first_prune",
    label: "Pruning Pro",
    description: "Completed your first pruning task",
    category: "growing",
    icon: "✂️",
    check: (s) => s.plantPruned >= 1,
  },
  {
    key: "first_harvest",
    label: "First Harvest",
    description: "Completed your first harvest",
    category: "growing",
    icon: "🍅",
    check: (s) => s.plantHarvested >= 1,
  },
  {
    key: "harvest_10",
    label: "Abundant Harvest",
    description: "Completed 10 harvests",
    category: "growing",
    icon: "🧺",
    check: (s) => s.plantHarvested >= 10,
    progress: (s) => ({ current: Math.min(s.plantHarvested, 10), total: 10 }),
  },
  // ── Tasks ─────────────────────────────────────────────────────
  {
    key: "first_task",
    label: "Getting Started",
    description: "Completed your first care task",
    category: "tasks",
    icon: "✅",
    check: (s) => s.taskCompleted >= 1,
  },
  {
    key: "task_10",
    label: "Consistent Carer",
    description: "Completed 10 tasks",
    category: "tasks",
    icon: "📋",
    check: (s) => s.taskCompleted >= 10,
    progress: (s) => ({ current: Math.min(s.taskCompleted, 10), total: 10 }),
  },
  {
    key: "task_50",
    label: "Dedicated Gardener",
    description: "Completed 50 tasks",
    category: "tasks",
    icon: "🏅",
    check: (s) => s.taskCompleted >= 50,
    progress: (s) => ({ current: Math.min(s.taskCompleted, 50), total: 50 }),
  },
  {
    key: "task_100",
    label: "Task Master",
    description: "Completed 100 tasks",
    category: "tasks",
    icon: "🏆",
    check: (s) => s.taskCompleted >= 100,
    progress: (s) => ({ current: Math.min(s.taskCompleted, 100), total: 100 }),
  },
  // ── AI / Plant Doctor ─────────────────────────────────────────
  {
    key: "first_identify",
    label: "Plant Detective",
    description: "Identified a plant using AI",
    category: "ai",
    icon: "🔍",
    check: (s) => s.aiIdentify >= 1,
  },
  {
    key: "identify_10",
    label: "Plant Expert",
    description: "Identified 10 plants using AI",
    category: "ai",
    icon: "🧠",
    check: (s) => s.aiIdentify >= 10,
    progress: (s) => ({ current: Math.min(s.aiIdentify, 10), total: 10 }),
  },
  {
    key: "first_diagnose",
    label: "Plant Doctor",
    description: "Diagnosed a plant problem with AI",
    category: "ai",
    icon: "🩺",
    check: (s) => s.aiDiagnose >= 1,
  },
  {
    key: "diagnose_10",
    label: "Master Diagnostician",
    description: "Diagnosed 10 plant problems with AI",
    category: "ai",
    icon: "💊",
    check: (s) => s.aiDiagnose >= 10,
    progress: (s) => ({ current: Math.min(s.aiDiagnose, 10), total: 10 }),
  },
  // ── Planning ──────────────────────────────────────────────────
  {
    key: "first_blueprint",
    label: "Automation Pioneer",
    description: "Created your first recurring task automation",
    category: "planning",
    icon: "⚙️",
    check: (s) => s.blueprintCreated >= 1,
  },
  {
    key: "first_plan",
    label: "Planner",
    description: "Completed your first garden plan",
    category: "planning",
    icon: "📝",
    check: (s) => s.planCompleted >= 1,
  },
  {
    key: "plan_5",
    label: "Strategic Gardener",
    description: "Completed 5 garden plans",
    category: "planning",
    icon: "🗺️",
    check: (s) => s.planCompleted >= 5,
    progress: (s) => ({ current: Math.min(s.planCompleted, 5), total: 5 }),
  },
  // ── Health & Watchlist ────────────────────────────────────────
  {
    key: "first_ailment",
    label: "Watchful Eye",
    description: "Logged your first plant ailment",
    category: "health",
    icon: "👁️",
    check: (s) => s.ailmentAdded >= 1,
  },
  {
    key: "ailment_resolved",
    label: "Plant Healer",
    description: "Resolved a plant ailment",
    category: "health",
    icon: "💚",
    check: (s) => s.ailmentResolved >= 1,
  },
  // ── Explorer ──────────────────────────────────────────────────
  {
    key: "profile_complete",
    label: "All About You",
    description: "Completed the garden profile quiz",
    category: "explorer",
    icon: "🌟",
    check: (s) => s.profileComplete,
  },
];

export function computeUnlocked(stats: AchievementStats): string[] {
  return ACHIEVEMENTS.filter((a) => a.check(stats)).map((a) => a.key);
}
