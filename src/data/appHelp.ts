/**
 * Client-side registry of app help sections.
 * The edge function holds the full content for AI context.
 * This file holds only the display data (id, title, summary, route)
 * used to render section cards after the AI responds.
 */

export interface HelpSection {
  id: string;
  title: string;
  route: string;
  summary: string;
}

export const APP_HELP_SECTIONS: HelpSection[] = [
  // ── Dashboard ──────────────────────────────────────────────────────────────
  {
    id: "dashboard-overview",
    title: "Understanding the Dashboard",
    route: "/dashboard",
    summary: "Your daily command centre — see today's tasks, live weather, and a snapshot of all your locations.",
  },
  {
    id: "dashboard-tasks",
    title: "Completing tasks from the Dashboard",
    route: "/dashboard",
    summary: "Tap any task on the Dashboard to mark it done, skip it, or open the full detail view.",
  },
  {
    id: "dashboard-weather",
    title: "How weather affects your garden",
    route: "/dashboard",
    summary: "Rhozly shows live weather alerts and automatically adjusts task recommendations when conditions change.",
  },

  // ── Shed ───────────────────────────────────────────────────────────────────
  {
    id: "shed-overview",
    title: "What is the Shed?",
    route: "/shed",
    summary: "The Shed is your plant inventory — every plant you own lives here, whether assigned to an area or not.",
  },
  {
    id: "shed-add-ai",
    title: "Adding a plant using AI",
    route: "/shed",
    summary: "Tap the + button in the Shed, choose 'Generate with AI', and Rhozly will create a full care plan automatically.",
  },
  {
    id: "shed-add-database",
    title: "Adding a plant from the Plant Database",
    route: "/shed",
    summary: "Tap +, choose 'Match via Plant Database' to search 10,000+ species and import accurate care data.",
  },
  {
    id: "shed-add-manual",
    title: "Adding a plant manually",
    route: "/shed",
    summary: "Tap + and choose 'Add Manually' to create a plant entry with your own name and details.",
  },
  {
    id: "shed-view-instance",
    title: "Viewing a plant's care routine and stats",
    route: "/shed",
    summary: "Tap any plant card to open its detail view — care routine, watering history, yield records, and notes.",
  },
  {
    id: "shed-archive",
    title: "Archiving or removing a plant",
    route: "/shed",
    summary: "Open the plant, tap the menu (⋯), and choose Archive. Archived plants are hidden but not deleted.",
  },

  // ── Tasks ──────────────────────────────────────────────────────────────────
  {
    id: "tasks-overview",
    title: "Understanding tasks in Rhozly",
    route: "/dashboard",
    summary: "Tasks are one-off care actions (water today). Blueprints are recurring task templates (water every 3 days).",
  },
  {
    id: "tasks-create",
    title: "Creating a one-off task",
    route: "/dashboard",
    summary: "Tap the + icon on the Dashboard or Shed and choose 'Add Task' to create a task due on a specific date.",
  },
  {
    id: "tasks-complete",
    title: "Completing and skipping tasks",
    route: "/dashboard",
    summary: "Swipe a task or tap the tick to complete it. Tap '…' and choose Skip to defer it to the next due date.",
  },

  // ── Blueprints ─────────────────────────────────────────────────────────────
  {
    id: "blueprints-overview",
    title: "What are Blueprints?",
    route: "/schedule",
    summary: "Blueprints are recurring task templates — define them once and Rhozly generates due tasks automatically.",
  },
  {
    id: "blueprints-create",
    title: "Creating a recurring task Blueprint",
    route: "/schedule",
    summary: "Go to Schedule → tap + to create a Blueprint. Set the task type, frequency, and which plant it applies to.",
  },
  {
    id: "blueprints-manage",
    title: "Editing or pausing a Blueprint",
    route: "/schedule",
    summary: "Find the Blueprint in the Schedule page, tap it to edit the interval, task type, or assigned plant.",
  },
  {
    id: "tasks-assignee",
    title: "Assigning tasks to home members",
    route: "/schedule",
    summary: "When creating or editing a task or Blueprint, use the Assignee field to assign it to a specific home member.",
  },

  // ── Locations & Areas ──────────────────────────────────────────────────────
  {
    id: "locations-overview",
    title: "Understanding Locations and Areas",
    route: "/management",
    summary: "Locations are physical spaces (Garden, Greenhouse). Areas are zones within a Location (Raised Bed, Window Sill).",
  },
  {
    id: "locations-create",
    title: "Creating a Location",
    route: "/management",
    summary: "Go to Management → tap 'Add Location'. Give it a name and optionally link it to your property address.",
  },
  {
    id: "areas-create",
    title: "Creating an Area within a Location",
    route: "/management",
    summary: "Open a Location, then tap 'Add Area'. Areas represent growing zones where you place plant instances.",
  },
  {
    id: "areas-conditions",
    title: "Setting up growing conditions for an Area",
    route: "/management",
    summary: "Open an Area and tap 'Advanced' to set soil pH, growing medium, water movement, and nutrient source.",
  },
  {
    id: "areas-add-plant",
    title: "Adding a plant to an Area",
    route: "/management",
    summary: "Open an Area and tap 'Add Plant' to assign a plant from your Shed into that growing zone.",
  },
  {
    id: "areas-lux",
    title: "Measuring light levels in an Area",
    route: "/lightsensor",
    summary: "Go to the Light Sensor page, hold your device in the Area, and tap Record to log the lux reading.",
  },

  // ── Plant Doctor ───────────────────────────────────────────────────────────
  {
    id: "doctor-overview",
    title: "What is Plant Doctor?",
    route: "/doctor",
    summary: "Plant Doctor uses AI to identify unknown plants, diagnose sick ones, and detect pest problems from photos.",
  },
  {
    id: "doctor-identify",
    title: "Identifying an unknown plant from a photo",
    route: "/doctor",
    summary: "On Plant Doctor, tap 'Identify', take or upload a photo, and the AI will suggest what plant it is.",
  },
  {
    id: "doctor-diagnose",
    title: "Diagnosing a sick plant from a photo",
    route: "/doctor",
    summary: "On Plant Doctor, tap 'Diagnose', upload a photo of the affected area, and receive a diagnosis with treatment steps.",
  },
  {
    id: "doctor-pest",
    title: "Reporting a pest problem",
    route: "/doctor",
    summary: "On Plant Doctor, tap 'Pest', upload a photo of the pest or damage, and Rhozly will identify it and suggest action.",
  },
  {
    id: "doctor-chat",
    title: "Chatting with Plant Doctor AI",
    route: "/doctor",
    summary: "After a diagnosis or identification, tap 'Chat' to ask follow-up questions about your specific plant situation.",
  },
  {
    id: "doctor-history",
    title: "Viewing your Plant Doctor history",
    route: "/doctor",
    summary: "Tap 'History' on the Plant Doctor page to review all past sessions, diagnoses, and identifications.",
  },

  // ── Area Scan ──────────────────────────────────────────────────────────────
  {
    id: "scan-overview",
    title: "What is Area Scan?",
    route: "/management",
    summary: "Area Scan uses AI to photograph your growing area and identify plants present, potential pests, and companion suggestions.",
  },
  {
    id: "scan-run",
    title: "Running an AI scan on an area",
    route: "/management",
    summary: "Open an Area, tap the Scan icon, take a photo of the area, and wait for the AI to analyse it.",
  },

  // ── Planner ────────────────────────────────────────────────────────────────
  {
    id: "planner-overview",
    title: "What is the Planner?",
    route: "/planner",
    summary: "The Planner lets you create structured garden plans with AI assistance, broken into actionable tasks.",
  },
  {
    id: "planner-create",
    title: "Creating a new garden plan",
    route: "/planner",
    summary: "Go to Planner → tap 'New Plan', give it a name and goal, then use AI to generate task suggestions.",
  },
  {
    id: "planner-ai",
    title: "Getting AI suggestions for your plan",
    route: "/planner",
    summary: "Inside a plan, tap 'AI Suggest' and describe what you want to achieve — Rhozly will draft tasks and timelines.",
  },
  {
    id: "planner-landscape",
    title: "Generating a landscape plan",
    route: "/planner",
    summary: "Tap 'Landscape Plan' in the Planner to get an AI-generated planting layout tailored to your climate and garden profile.",
  },

  // ── Ailment Watchlist ──────────────────────────────────────────────────────
  {
    id: "watchlist-overview",
    title: "What is the Ailment Watchlist?",
    route: "/shed?tab=watchlist",
    summary: "The Watchlist tracks pests, diseases, and invasive plants that affect your garden so you can monitor and treat them.",
  },
  {
    id: "watchlist-add",
    title: "Adding a pest, disease, or invasive plant",
    route: "/shed?tab=watchlist",
    summary: "Go to Watchlist → tap + and search for an ailment, or use AI to identify one from a description or photo.",
  },
  {
    id: "watchlist-link",
    title: "Linking an ailment to a plant",
    route: "/shed?tab=watchlist",
    summary: "Open a plant instance, tap 'Link Ailment', and select the relevant watchlist entry to track it on that plant.",
  },

  // ── Guides ─────────────────────────────────────────────────────────────────
  {
    id: "guides-rhozly",
    title: "What are Rhozly Guides?",
    route: "/guides",
    summary: "Rhozly Guides are AI-generated, structured plant care guides covering growing techniques, pests, and seasonal care.",
  },
  {
    id: "guides-community",
    title: "What are Community Guides?",
    route: "/guides?tab=community",
    summary: "Community Guides are written and published by Rhozly users — share your knowledge with the gardening community.",
  },
  {
    id: "guides-create",
    title: "Writing and publishing a Community Guide",
    route: "/guides?tab=community",
    summary: "Go to Guides → Community tab → tap 'Write a Guide'. Write your content, add labels, and publish when ready.",
  },

  // ── Shopping List ──────────────────────────────────────────────────────────
  {
    id: "shopping-overview",
    title: "What is the Shopping List?",
    route: "/planner?tab=shopping",
    summary: "The Shopping List helps you track what you need to buy for your garden — tools, seeds, fertilisers, and more.",
  },
  {
    id: "shopping-add",
    title: "Adding items to a Shopping List",
    route: "/planner?tab=shopping",
    summary: "Open a list and tap + to add an item. Search the Plant Database, your Shed plants, or type a custom item.",
  },
  {
    id: "shopping-lists",
    title: "Creating multiple Shopping Lists",
    route: "/planner?tab=shopping",
    summary: "Tap 'New List' on the Shopping page to create separate lists for different occasions (e.g. Spring Planting, Hardware Run).",
  },

  // ── Home Profile (Garden Quiz & Preferences) ───────────────────────────────
  {
    id: "profile-quiz",
    title: "What is the Garden Quiz?",
    route: "/profile",
    summary: "The Garden Quiz trains your AI recommendations by learning your gardening style, preferences, and goals.",
  },
  {
    id: "profile-preferences",
    title: "Understanding AI preferences",
    route: "/profile",
    summary: "Preferences are automatically learned from your quiz answers, plant swipes, and Plant Doctor chats.",
  },
  {
    id: "profile-swipe",
    title: "Discovering plants with the swipe deck",
    route: "/profile",
    summary: "Go to Home Profile → Discover Plants tab. Swipe right to like, left to dislike — this trains your recommendations.",
  },

  // ── Gardener Profile (Account) ─────────────────────────────────────────────
  {
    id: "account-name",
    title: "Changing your display name",
    route: "/gardener?tab=account",
    summary: "Open your Gardener Profile (tap your avatar), go to the Account tab, and update your Display Name.",
  },
  {
    id: "account-plan",
    title: "Understanding subscription plans",
    route: "/gardener?tab=account",
    summary: "Sprout (free tracking), Botanist (species database), Sage (AI features), Evergreen (everything). Switch plans in Account → Your Plan.",
  },
  {
    id: "account-ai-usage",
    title: "Viewing your AI usage and rate limits",
    route: "/gardener?tab=account",
    summary: "In your Gardener Profile → Account tab, scroll to AI Usage to see calls today, this month, and your hourly limits.",
  },

  // ── Integrations ───────────────────────────────────────────────────────────
  {
    id: "integrations-overview",
    title: "What are Integrations?",
    route: "/integrations",
    summary: "Integrations connect physical devices — soil sensors and water valves — to your Rhozly home for real-time monitoring.",
  },
  {
    id: "integrations-connect",
    title: "Connecting a device (soil sensor or water valve)",
    route: "/integrations",
    summary: "Go to Integrations, tap 'Connect Device', and follow the wizard to link an Ecowitt or eWeLink device.",
  },
  {
    id: "integrations-valve-ewelink",
    title: "Connecting an eWeLink water valve",
    route: "/integrations",
    summary: "Tap 'Connect Device', choose 'Water Valve' then 'eWeLink', and authorise via your eWeLink account. Rhozly will import all your valves automatically.",
  },
  {
    id: "integrations-valve-control",
    title: "Manually controlling a water valve",
    route: "/integrations",
    summary: "Open a valve from the Integrations page, tap 'Turn On' to start the valve for its set duration. It auto-shuts off when the timer expires.",
  },

  // ── Automations ────────────────────────────────────────────────────────────
  {
    id: "automations-overview",
    title: "What are Automations?",
    route: "/integrations",
    summary: "Automations fire your water valves automatically on a daily schedule when linked watering tasks are due, then mark those tasks as complete.",
  },
  {
    id: "automations-create",
    title: "Creating a watering automation",
    route: "/integrations",
    summary: "In Integrations → Automations, tap 'New Automation'. Give it a name, pick your valves, link a watering Blueprint as the controlling task, set a run time and duration.",
  },
  {
    id: "automations-tasks",
    title: "Controlling vs driven tasks in automations",
    route: "/integrations",
    summary: "A 'controlling' task triggers the automation when it is due. A 'driven' task is auto-completed by the automation but does not trigger it. Controlling tasks are always also driven.",
  },
  {
    id: "automations-run-now",
    title: "Running an automation manually",
    route: "/integrations",
    summary: "Tap 'Run Now' on any automation card to fire it immediately, bypassing the schedule and weather checks.",
  },
  {
    id: "automations-weather",
    title: "Skipping an automation when it rains",
    route: "/integrations",
    summary: "Enable 'Skip if it rained' in the automation settings. If today's rainfall exceeds your threshold (default 5 mm), the run is skipped and logged as 'Rain skipped'.",
  },
  {
    id: "automations-sequential",
    title: "Sequential vs simultaneous valve firing",
    route: "/integrations",
    summary: "With multiple valves, 'Fire sequentially' runs one valve at a time to avoid low water pressure. Disable it to fire all valves at once.",
  },

  // ── Light Sensor ───────────────────────────────────────────────────────────
  {
    id: "lightsensor-overview",
    title: "What is the Light Sensor?",
    route: "/lightsensor",
    summary: "The Light Sensor uses your device's camera to measure ambient lux levels and log them to a specific area.",
  },

  // ── Plant Visualiser ───────────────────────────────────────────────────────
  {
    id: "visualiser-overview",
    title: "What is the Plant Visualiser?",
    route: "/visualiser",
    summary: "The Visualiser lets you arrange your plants in a 2D overhead view of your garden space with drag-and-drop sprites.",
  },

  // ── Home Management ────────────────────────────────────────────────────────
  {
    id: "home-invite",
    title: "Inviting members to your home",
    route: "/management",
    summary: "Go to Management → Home Settings → tap 'Invite Member' and enter their email address.",
  },
  {
    id: "home-roles",
    title: "Understanding member roles",
    route: "/management",
    summary: "Owner has full control. Manager can add/edit plants and tasks. Member can complete tasks and view data.",
  },

  // ── Achievements ───────────────────────────────────────────────────────────
  {
    id: "achievements-overview",
    title: "Understanding Achievements",
    route: "/profile",
    summary: "Achievements are earned automatically as you use Rhozly — completing tasks, logging yields, running AI scans, and more.",
  },
];

export const POPULAR_QUESTIONS = [
  "How do I add a plant to my Shed?",
  "What is a Blueprint?",
  "How does Plant Doctor work?",
  "How do I create a recurring task?",
  "What's the difference between the plans?",
  "How do I invite someone to my home?",
  "What is an Area Scan?",
  "How do I track a pest or disease?",
  "How do I set up an automation?",
  "How do I connect a water valve?",
];
