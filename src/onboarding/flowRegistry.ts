import type { FlowDef } from "./types";

export const flowRegistry: FlowDef[] = [
  // ─── GETTING STARTED ────────────────────────────────────────────────────────

  {
    id: "global_welcome",
    trigger: "automatic",
    route: "global",
    title: "Welcome to Rhozly",
    description: "A quick tour of everything Rhozly can do for your garden.",
    category: "Getting Started",
    estimated_minutes: 2,
    steps: [
      {
        title: "Welcome to Rhozly!",
        body: "We're so glad you're here. Rhozly is your all-in-one gardening companion — smart enough to use AI but simple enough that you'll actually enjoy it. This quick tour will show you the five things that make Rhozly brilliant.",
        attachTo: { element: null, on: null },
        image: "/assets/onboarding/welcome-hero.png",
      },
      {
        title: "Your Garden, at a glance",
        body: "The Home tab is your command centre. You'll see all your growing locations, today's weather, and the tasks waiting for you — all in one place. It updates in real time.",
        attachTo: { element: null, on: null },
        image: "/assets/onboarding/dashboard-overview.png",
      },
      {
        title: "Your Plant Library — The Shed",
        body: "The Garden tab holds your master plant library. Add plants manually, search the Perenual database, or let the AI generate care data for any plant in the world. Once they're in the Shed, you can assign them to beds and areas.",
        attachTo: { element: null, on: null },
        image: "/assets/onboarding/shed-overview.png",
      },
      {
        title: "Plan like a pro",
        body: "The Plan tab lets you build seasonal growing plans with AI assistance, manage recurring task automations, and keep a shopping list for what you need next. Everything connects back to your actual plants.",
        attachTo: { element: null, on: null },
        image: "/assets/onboarding/planner-overview.png",
      },
      {
        title: "AI Tools — your secret weapon",
        body: "The Tools tab is where the magic happens. Upload a photo of a sick leaf and the Garden AI will identify the disease and suggest treatments. The Plant Visualiser lets you see how plants look in your space before you buy them.",
        attachTo: { element: null, on: null },
        image: "/assets/onboarding/tools-overview.png",
      },
      {
        title: "You're all set!",
        body: "Your garden journey starts now. We'll pop up short tours as you explore each section — or you can find them anytime using the Help button in the bottom corner. Happy growing!",
        attachTo: { element: null, on: null },
      },
    ],
  },

  {
    id: "home_setup_tips",
    trigger: "automatic",
    route: "global",
    title: "Setting up your first home",
    description: "Tips on adding your first garden location after creating a home.",
    category: "Getting Started",
    estimated_minutes: 1,
    steps: [
      {
        title: "Your home is ready!",
        body: "Now let's make it yours. The first thing to do is add a garden location — this could be your back garden, a balcony, a greenhouse, or any space where you grow things.",
        attachTo: { element: null, on: null },
      },
      {
        title: "Add your first location",
        body: "Head to Location Management (in your account menu) to add your first growing space. Give it a meaningful name like 'Back Garden' or 'Greenhouse' — you can add as many as you like.",
        attachTo: { element: "header", on: "bottom" },
      },
      {
        title: "Then add your plants",
        body: "Once you have a location, pop over to the Garden tab and add the plants you're growing. That's all Rhozly needs to start generating care tasks, AI advice, and personalised recommendations for you.",
        attachTo: { element: null, on: null },
      },
    ],
  },

  // ─── DASHBOARD ──────────────────────────────────────────────────────────────

  {
    id: "dashboard_tour",
    trigger: "automatic",
    route: "/dashboard",
    title: "The Home Dashboard",
    description: "Locations, weather, tasks, and the view switcher explained.",
    category: "Getting Started",
    estimated_minutes: 2,
    steps: [
      {
        title: "Three views in one",
        body: "This switcher lets you jump between your location overview, a full task calendar, and a 7-day weather forecast. You're on Locations view right now.",
        attachTo: { element: "[data-testid='dashboard-view-switcher']", on: "bottom" },
        image: "/assets/onboarding/dashboard-view-switcher.png",
      },
      {
        title: "Today's weather",
        body: "This card shows the current temperature, humidity, and wind speed for your area. Tap 'Full Forecast' to see the 7-day outlook with garden-specific insights like frost warnings and heavy rain alerts.",
        attachTo: { element: "[data-testid='dashboard-weather-widget']", on: "bottom" },
      },
      {
        title: "Your growing spaces",
        body: "Each card here is one of your garden locations. Tap any card to dive into that space — you'll see which plants are growing there, open tasks, and a light sensor reading if you've taken one.",
        attachTo: { element: "[data-testid='dashboard-location-grid']", on: "top" },
        image: "/assets/onboarding/dashboard-location-tiles.png",
      },
      {
        title: "Your AI garden assistant",
        body: "The assistant card surfaces personalised insights based on your plants, preferences, and the season. It'll flag upcoming tasks, suggest timely actions, and answer questions about your garden.",
        attachTo: { element: "[data-testid='dashboard-assistant-card']", on: "top" },
      },
      {
        title: "Your daily tasks",
        body: "Rhozly generates smart care tasks for every plant in your garden — watering, pruning, harvesting, and more. Tick them off here as you go. They're based on your plant data and today's weather.",
        attachTo: { element: "[data-testid='dashboard-task-list']", on: "top" },
      },
    ],
  },

  // ─── GARDEN ─────────────────────────────────────────────────────────────────

  {
    id: "garden_hub_tour",
    trigger: "automatic",
    route: "/shed",
    title: "The Garden Hub",
    description: "How to manage your plant library and monitor plants with active problems.",
    category: "Garden",
    estimated_minutes: 2,
    steps: [
      {
        title: "The Shed — your plant library",
        body: "This is where every plant you grow lives. You can add plants manually, search the Perenual database of 10,000+ species, or ask the AI to generate care data for anything. Each entry becomes the source of truth for all your tasks and recommendations.",
        attachTo: { element: "[data-testid='garden-hub-tab-shed']", on: "bottom" },
      },
      {
        title: "Adding plants",
        body: "Tap Add to bring up the plant search. You can search by common name, browse the database, or type any plant name and let AI fill in the care details. No plant is too obscure.",
        attachTo: { element: "[aria-label='Add plant']", on: "bottom" },
      },
      {
        title: "Your plant cards",
        body: "Each card shows the plant's photo, source (Manual, Perenual, or AI), and how many instances you have in the ground. Tap a card to see full care notes, edit details, or assign new instances to a bed.",
        attachTo: { element: "[data-testid='shed-plant-list']", on: "top" },
        image: "/assets/onboarding/shed-plant-cards.png",
      },
      {
        title: "The Watchlist",
        body: "The Watchlist tab tracks plants flagged with an active health problem — disease, pest, or stress. When the Garden AI diagnoses an issue and you confirm it, the plant appears here so you can monitor its recovery.",
        attachTo: { element: "[data-testid='garden-hub-tab-watchlist']", on: "bottom" },
      },
    ],
  },

  {
    id: "weather_insights_tour",
    trigger: "manual-only",
    route: "/dashboard",
    title: "Weather Insights & Forecast",
    description: "How to read the 7-day forecast and interpret weather alerts for your garden.",
    category: "Garden",
    estimated_minutes: 1,
    steps: [
      {
        title: "Your garden's weather",
        body: "The Weather view shows a 7-day forecast tailored for gardeners — not just temperature, but rainfall, frost probability, UV index, and humidity. All of these affect your plants differently.",
        attachTo: { element: null, on: null },
        image: "/assets/onboarding/weather-forecast.png",
      },
      {
        title: "Weather alerts",
        body: "When serious weather is approaching — frost, heat waves, or heavy rain — you'll see an alert banner at the top of the dashboard. Rhozly will also automatically postpone any watering tasks on rainy days.",
        attachTo: { element: "[data-testid='weather-alert-banner']", on: "bottom" },
      },
      {
        title: "Garden intelligence",
        body: "Every morning, Rhozly checks the forecast and runs your automations. If rain is coming, outdoor watering is skipped. If frost is forecast, you'll get an alert to bring in tender plants. It works while you sleep.",
        attachTo: { element: null, on: null },
      },
    ],
  },

  // ─── PLANNING ───────────────────────────────────────────────────────────────

  {
    id: "planner_tour",
    trigger: "automatic",
    route: "/planner",
    title: "The Landscape Planner",
    description: "Create AI-generated growing plans and manage your shopping list.",
    category: "Planning",
    estimated_minutes: 2,
    steps: [
      {
        title: "Plan your garden",
        body: "The Planner lets you create full growing plans with the AI's help. Tell it what you want to grow and when, and it'll lay out a phased planting schedule complete with tasks, timings, and plant suggestions.",
        attachTo: { element: "[data-testid='planner-hub-tab-planner']", on: "bottom" },
      },
      {
        title: "Creating a plan",
        body: "Hit 'New Plan' to get started. Give the AI a brief description of your goals — 'I want to grow salad leaves for spring harvests' — and it will generate a structured plan with phases. You review and approve it before anything gets added to your schedule.",
        attachTo: { element: "[data-testid='planner-new-plan-btn']", on: "bottom" },
      },
      {
        title: "Your plans",
        body: "Active plans live in the Pending tab. Move them to Completed when the season ends or you've harvested everything. Plans link directly to tasks and blueprints, so your schedule stays in sync.",
        attachTo: { element: "[data-testid='planner-plan-list']", on: "top" },
        image: "/assets/onboarding/planner-plan-list.png",
      },
      {
        title: "Shopping lists",
        body: "The Shopping tab lets you keep lists of seeds, compost, tools — anything you need to buy. When the Garden AI suggests a treatment for a sick plant, it can add the remedy straight to a list for you.",
        attachTo: { element: "[data-testid='planner-hub-tab-shopping']", on: "bottom" },
      },
    ],
  },

  {
    id: "task_schedule_tour",
    trigger: "automatic",
    route: "/schedule",
    title: "Automations & Task Schedule",
    description: "Set up recurring task blueprints so Rhozly automatically generates care tasks.",
    category: "Planning",
    estimated_minutes: 2,
    steps: [
      {
        title: "Automated task scheduling",
        body: "Automations are recurring rules that tell Rhozly to generate a task at regular intervals. For example: 'Water my tomatoes every 3 days from May to September'. Set it once and forget it.",
        attachTo: { element: "[data-testid='schedule-heading']", on: "bottom" },
      },
      {
        title: "Creating an automation",
        body: "Tap 'New Automation' to open the builder. Choose a task type, pick a plant and location, set the frequency, and optionally restrict it to a seasonal window. The AI can also suggest schedules based on your plants' care requirements.",
        attachTo: { element: "[data-testid='blueprint-new-btn']", on: "bottom" },
      },
      {
        title: "Your automation library",
        body: "Each card here is one active automation. You can filter by task type, plant, or location. Rhozly checks these every morning and creates tasks for the day — so you wake up knowing exactly what the garden needs.",
        attachTo: { element: "[data-testid='blueprint-list']", on: "top" },
        image: "/assets/onboarding/schedule-blueprint-list.png",
      },
      {
        title: "Smart postponement",
        body: "If Rhozly detects heavy rain is forecast, it will automatically skip a watering task for that day. You don't need to do anything — it handles it. You'll see a 'Postponed — Rain Expected' note on the task.",
        attachTo: { element: null, on: null },
      },
    ],
  },

  // ─── TOOLS ──────────────────────────────────────────────────────────────────

  {
    id: "tools_hub_tour",
    trigger: "automatic",
    route: "/tools",
    title: "Tools Overview",
    description: "A quick map of every tool in Rhozly and what each one is for.",
    category: "Tools",
    estimated_minutes: 1,
    steps: [
      {
        title: "Your toolbox",
        body: "The Tools section brings together six specialist features. Each one is a standalone tool — you don't need to use them in any order. Let's run through what's available.",
        attachTo: { element: "[data-testid='tools-heading']", on: "bottom" },
      },
      {
        title: "Garden AI",
        body: "Photo identification, disease diagnosis, and pest detection. Upload any plant photo and get an AI-powered analysis in seconds.",
        attachTo: { element: "[data-testid='tools-hub-garden-ai']", on: "right" },
      },
      {
        title: "Garden Layout",
        body: "Design your garden in 2D or 3D. Draw beds and borders to scale, link them to your actual locations, and use the sun simulator to see which areas get the most light.",
        attachTo: { element: "[data-testid='tools-hub-garden-layout']", on: "right" },
      },
      {
        title: "Plant Visualiser",
        body: "Point your camera at a spot in your garden and see what your plants would look like there before you buy or move them. Great for planning borders.",
        attachTo: { element: "[data-testid='tools-hub-plant-visualiser']", on: "right" },
      },
      {
        title: "Light Sensor",
        body: "Uses your device's ambient light sensor to measure lux levels at any point in your garden. Compare readings against each plant's ideal light requirements to find the perfect spot for them.",
        attachTo: { element: "[data-testid='tools-hub-light-sensor']", on: "right" },
      },
    ],
  },

  {
    id: "plant_doctor_tour",
    trigger: "automatic",
    route: "/doctor",
    title: "Garden AI — Identify & Diagnose",
    description: "How to use AI photo analysis to identify plants and diagnose health problems.",
    category: "Tools",
    estimated_minutes: 2,
    steps: [
      {
        title: "Your AI plant doctor",
        body: "Upload or photograph any plant and the AI will tell you what it is, what might be wrong with it, or whether it has a pest problem. The more of the plant you show — leaves, stems, and any affected areas — the better the result.",
        attachTo: { element: "[data-testid='doctor-upload-zone']", on: "top" },
        image: "/assets/onboarding/doctor-upload.png",
      },
      {
        title: "Three analysis modes",
        body: "Once you have an image, you get three choices: Identify tells you what the plant is. Diagnose looks for disease or nutrient issues. Pest spots insects, eggs, or pest damage and tells you what to do about it.",
        attachTo: { element: "[data-testid='doctor-btn-identify']", on: "top" },
      },
      {
        title: "Your diagnosis history",
        body: "Every analysis you run is saved to your history so you can track a plant's recovery over time. Switch to the History tab to review past sessions.",
        attachTo: { element: "[data-testid='doctor-tab-history']", on: "bottom" },
      },
      {
        title: "Connecting diagnoses to your garden",
        body: "When you confirm a plant identification, Rhozly can add it directly to your Shed. When you confirm a diagnosis, the affected plant goes on your Watchlist so you can monitor it. Everything stays connected.",
        attachTo: { element: null, on: null },
      },
    ],
  },

  {
    id: "visualiser_tour",
    trigger: "automatic",
    route: "/visualiser",
    title: "Plant Visualiser",
    description: "How to use the camera overlay to preview plants in your garden space.",
    category: "Tools",
    estimated_minutes: 1,
    steps: [
      {
        title: "Choose your plants",
        body: "Select one or more plants from your Shed by tapping their cards. You can pick several at once to see how they'd look together — great for planning mixed borders.",
        attachTo: { element: "[data-testid='visualiser-plant-grid']", on: "top" },
        image: "/assets/onboarding/visualiser-select.png",
      },
      {
        title: "Generate sprites",
        body: "Once you've picked your plants, tap Continue. If the plant has an image, Rhozly can create a transparent PNG sprite of it using AI background removal. These sprites are what appear in the camera view.",
        attachTo: { element: "[data-testid='visualiser-open-camera-btn']", on: "top" },
      },
      {
        title: "Point and place",
        body: "In the camera view, you'll see your selected plants overlaid on the live camera feed. Drag them to position, pinch to resize, and take a screenshot to share your vision with anyone who tends the garden with you.",
        attachTo: { element: null, on: null },
      },
    ],
  },

  // ─── COMMUNITY ──────────────────────────────────────────────────────────────

  {
    id: "guides_tour",
    trigger: "automatic",
    route: "/guides",
    title: "Guides Library",
    description: "Browse Rhozly guides and community-written how-tos.",
    category: "Community",
    estimated_minutes: 1,
    steps: [
      {
        title: "Rhozly Guides",
        body: "The Rhozly Guides tab contains expert-written, AI-generated care guides covering propagation, pruning, planting, and harvesting for hundreds of plant species. Filter by tag or search by name to find exactly what you need.",
        attachTo: { element: "[data-testid='guides-tab-rhozly']", on: "bottom" },
      },
      {
        title: "Community Guides",
        body: "The Community tab is where Rhozly users share their own how-tos. You can star the ones you find useful, leave comments, and write your own guide with the rich editor.",
        attachTo: { element: "[data-testid='guides-tab-community']", on: "bottom" },
      },
      {
        title: "Share your knowledge",
        body: "Got a tip that's saved your courgettes? Tap 'Write a Guide' to open the editor. Guides support headers, images, tips, and warnings. Once published, the community can find them by tag and give them a star.",
        attachTo: { element: "[data-testid='write-guide-btn']", on: "bottom" },
      },
    ],
  },

  // ─── PROFILE ────────────────────────────────────────────────────────────────

  {
    id: "profile_quiz_tour",
    trigger: "automatic",
    route: "/profile",
    title: "Garden Profile Quiz",
    description: "What the quiz does and how it shapes your AI recommendations.",
    category: "Getting Started",
    estimated_minutes: 1,
    steps: [
      {
        title: "Train your AI",
        body: "The Garden Profile is how Rhozly learns your taste. Answer a few quick questions about your growing style and the plants you like, and the AI will personalise every recommendation, plan, and care suggestion to suit you.",
        attachTo: { element: "[data-testid='profile-heading']", on: "bottom" },
      },
      {
        title: "The Garden Quiz",
        body: "The quiz asks about your experience level, how much time you spend gardening, what you like to grow, and what you'd rather avoid. It takes about two minutes and you can retake it any time.",
        attachTo: { element: "[data-testid='profile-tab-quiz']", on: "bottom" },
      },
      {
        title: "Discover Plants",
        body: "The Swipe tab shows you plant cards one at a time. Swipe right for 'I'd grow that' and left for 'not for me'. The more you swipe, the sharper your recommendations become.",
        attachTo: { element: "[data-testid='profile-tab-swipe']", on: "bottom" },
      },
      {
        title: "What happens next",
        body: "Your preferences automatically surface in three places: the Shed sorts plants by how well they match your taste, the Planner prioritises plants you'd enjoy growing, and the AI assistant tailors its advice to your style. The more you interact, the better it gets.",
        attachTo: { element: null, on: null },
      },
    ],
  },
];
