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
  // Extended stats
  journalEntries: number;
  yieldRecorded: number;
  scansCompleted: number;
  guidesPublished: number;
  commentsPosted: number;
  chatMessages: number;
  streakDays: number;
  longestStreak: number;
  blueprintCreatedFromEvents: number;
  hasWinterTask: boolean;
  hasSpringPlanting: boolean;
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
  // ── New: Tasks (volume + streaks) ────────────────────────────
  {
    key: "task_250",
    label: "Unstoppable",
    description: "Completed 250 care tasks",
    category: "tasks",
    icon: "💎",
    check: (s) => s.taskCompleted >= 250,
    progress: (s) => ({ current: Math.min(s.taskCompleted, 250), total: 250 }),
  },
  {
    key: "first_streak_7",
    label: "Week Warrior",
    description: "Gardened for 7 days in a row",
    category: "tasks",
    icon: "🔥",
    check: (s) => s.longestStreak >= 7,
    progress: (s) => ({ current: Math.min(s.longestStreak, 7), total: 7 }),
  },
  {
    key: "first_streak_30",
    label: "Month of Green",
    description: "Gardened for 30 days in a row",
    category: "tasks",
    icon: "🌿",
    check: (s) => s.longestStreak >= 30,
    progress: (s) => ({ current: Math.min(s.longestStreak, 30), total: 30 }),
  },
  // ── New: Growing ─────────────────────────────────────────────
  {
    key: "plant_50",
    label: "Plant Hoarder",
    description: "Added 50 plants to your shed",
    category: "growing",
    icon: "🌴",
    check: (s) => s.plantAdded >= 50,
    progress: (s) => ({ current: Math.min(s.plantAdded, 50), total: 50 }),
  },
  {
    key: "first_yield",
    label: "First Fruit",
    description: "Logged your first yield",
    category: "growing",
    icon: "🍓",
    check: (s) => s.yieldRecorded >= 1,
  },
  {
    key: "yield_10",
    label: "Bountiful Garden",
    description: "Logged 10 yields",
    category: "growing",
    icon: "🧺",
    check: (s) => s.yieldRecorded >= 10,
    progress: (s) => ({ current: Math.min(s.yieldRecorded, 10), total: 10 }),
  },
  {
    key: "spring_planting",
    label: "Spring Starter",
    description: "Planted something in spring",
    category: "growing",
    icon: "🌸",
    check: (s) => s.hasSpringPlanting,
  },
  // ── New: Health ───────────────────────────────────────────────
  {
    key: "ailment_5",
    label: "Disease Detective",
    description: "Logged 5 plant ailments",
    category: "health",
    icon: "🕵️",
    check: (s) => s.ailmentAdded >= 5,
    progress: (s) => ({ current: Math.min(s.ailmentAdded, 5), total: 5 }),
  },
  {
    key: "ailments_resolved_5",
    label: "Plant Medic",
    description: "Resolved 5 plant ailments",
    category: "health",
    icon: "💉",
    check: (s) => s.ailmentResolved >= 5,
    progress: (s) => ({ current: Math.min(s.ailmentResolved, 5), total: 5 }),
  },
  // ── New: AI ───────────────────────────────────────────────────
  {
    key: "first_chat",
    label: "AI Apprentice",
    description: "Sent your first message to the Plant Doctor",
    category: "ai",
    icon: "🤖",
    check: (s) => s.chatMessages >= 1,
  },
  {
    key: "chat_25",
    label: "AI Power User",
    description: "Sent 25 messages to the Plant Doctor",
    category: "ai",
    icon: "🧬",
    check: (s) => s.chatMessages >= 25,
    progress: (s) => ({ current: Math.min(s.chatMessages, 25), total: 25 }),
  },
  // ── New: Planning ─────────────────────────────────────────────
  {
    key: "blueprint_5",
    label: "Automation Master",
    description: "Created 5 recurring task automations",
    category: "planning",
    icon: "⚡",
    check: (s) => s.blueprintCreatedFromEvents >= 5,
    progress: (s) => ({ current: Math.min(s.blueprintCreatedFromEvents, 5), total: 5 }),
  },
  {
    key: "plan_10",
    label: "Grand Strategist",
    description: "Completed 10 garden plans",
    category: "planning",
    icon: "🗺️",
    check: (s) => s.planCompleted >= 10,
    progress: (s) => ({ current: Math.min(s.planCompleted, 10), total: 10 }),
  },
  // ── New: Explorer ─────────────────────────────────────────────
  {
    key: "first_journal",
    label: "Keeping Notes",
    description: "Added your first plant journal entry",
    category: "explorer",
    icon: "📓",
    check: (s) => s.journalEntries >= 1,
  },
  {
    key: "journal_10",
    label: "Field Researcher",
    description: "Added 10 plant journal entries",
    category: "explorer",
    icon: "🔬",
    check: (s) => s.journalEntries >= 10,
    progress: (s) => ({ current: Math.min(s.journalEntries, 10), total: 10 }),
  },
  {
    key: "first_scan",
    label: "Eagle Eye",
    description: "Completed your first area scan",
    category: "explorer",
    icon: "🦅",
    check: (s) => s.scansCompleted >= 1,
  },
  {
    key: "scan_5",
    label: "Area Inspector",
    description: "Completed 5 area scans",
    category: "explorer",
    icon: "🔭",
    check: (s) => s.scansCompleted >= 5,
    progress: (s) => ({ current: Math.min(s.scansCompleted, 5), total: 5 }),
  },
  {
    key: "first_guide",
    label: "Knowledge Keeper",
    description: "Published your first community guide",
    category: "explorer",
    icon: "📖",
    check: (s) => s.guidesPublished >= 1,
  },
  {
    key: "guide_3",
    label: "Community Mentor",
    description: "Published 3 community guides",
    category: "explorer",
    icon: "🏫",
    check: (s) => s.guidesPublished >= 3,
    progress: (s) => ({ current: Math.min(s.guidesPublished, 3), total: 3 }),
  },
  {
    key: "first_comment",
    label: "Garden Chatter",
    description: "Left your first comment on a community guide",
    category: "explorer",
    icon: "💬",
    check: (s) => s.commentsPosted >= 1,
  },
  {
    key: "winter_gardener",
    label: "Winter Warrior",
    description: "Completed a care task in the depths of winter",
    category: "explorer",
    icon: "❄️",
    check: (s) => s.hasWinterTask,
  },
];

export function computeUnlocked(stats: AchievementStats): string[] {
  return ACHIEVEMENTS.filter((a) => a.check(stats)).map((a) => a.key);
}
