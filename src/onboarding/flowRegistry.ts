import type { FlowDef } from "./types";

export const flowRegistry: FlowDef[] = [
  // ─── GETTING STARTED ────────────────────────────────────────────────────────

  {
    id: "global_welcome",
    order: 1,
    trigger: "automatic",
    route: "global",
    // Wave 23.0001 — first-session essential, bypasses the per-day
    // throttle so brand-new users always see it on day 1.
    important: true,
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
        body: "The Garden tab holds your master plant library, your Notes notebook, your Nursery seed packets, and the Ailment Watchlist. Plant search is library-first — fast, free, with image credits on every result.",
        attachTo: { element: null, on: null },
        image: "/assets/onboarding/shed-overview.png",
      },
      {
        title: "Plan like a pro",
        body: "The Plan tab lets you build seasonal growing plans with AI assistance — or, on Sage+, redesign an existing garden from a photo with Garden Overhaul. It also holds your recurring Routines and shopping lists. Everything connects back to your actual plants.",
        attachTo: { element: null, on: null },
        image: "/assets/onboarding/planner-overview.png",
      },
      {
        title: "AI Tools — your secret weapon",
        body: "The Tools tab is where the magic happens. Plant Doctor identifies plants via Pl@ntNet first, then cross-checks with Rhozly AI. The Weekly Overview gives you a Sunday-morning recap of the whole week. And every chat surface supports Voice — tap to talk, tap to listen.",
        attachTo: { element: null, on: null },
        image: "/assets/onboarding/tools-overview.png",
      },
      {
        title: "You're all set!",
        body: "Your garden journey starts now. We'll surface short tours as you actually open each feature — never more than one a day. You can replay any of them from the Help button (the ? icon) any time. Happy growing!",
        attachTo: { element: null, on: null },
      },
    ],
  },

  {
    id: "home_setup_tips",
    order: 2,
    trigger: "automatic",
    route: "global",
    // Wave 23.0001 — first-session essential. Chains after global_welcome
    // so users always see the welcome first.
    important: true,
    prerequisite: "global_welcome",
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
        body: "Open Account Settings → Location Manager (or just go to /management) to add your first growing space. Give it a meaningful name like 'Back Garden' or 'Greenhouse' — you can add as many as you like.",
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
    order: 3,
    trigger: "automatic",
    route: "/dashboard",
    title: "The Home Dashboard",
    description: "Your status strip, garden overview, quick actions, and daily task list.",
    category: "Getting Started",
    estimated_minutes: 2,
    // Anchors target the merged home (Phase 4.2) in its default Simple
    // density — new users (the tour audience) always land there.
    steps: [
      {
        title: "Four views in one",
        body: "This switcher jumps between your home dashboard, a location overview, a full task calendar, and a 7-day weather forecast.",
        attachTo: { element: "[data-testid='dashboard-view-switcher']", on: "bottom" },
        image: "/assets/onboarding/dashboard-view-switcher.png",
      },
      {
        title: "Your day in one sentence",
        body: "The greeting is your garden's summary — tasks left, rain on the way, frost tonight, whatever matters most right now. \"Plan my day\" takes you straight to the calendar, and the weather chip to the full forecast.",
        attachTo: { element: "[data-testid='home-status-strip']", on: "bottom" },
      },
      {
        title: "Your garden overview",
        body: "One card per location, with growth-state dots for every area. Tap a card to drill into that location. Flip the little toggle above to Detailed for sensor readings, stats, and the full week's numbers.",
        // Wrapper testid exists in BOTH the populated-grid and empty-garden
        // states — new users (this tour's audience) may have zero locations.
        attachTo: { element: "[data-testid='home-garden-section']", on: "top" },
      },
      {
        title: "Quick actions",
        body: "Your most-used tools, one tap away — identify a plant, capture a photo, start a Garden Walk. Customise which tiles appear from Gardener Profile.",
        attachTo: { element: "[data-testid='home-quick-actions']", on: "top" },
      },
      {
        title: "Seasonal Picks — what to grow right now",
        body: "AI-curated suggestions for plants suited to your hemisphere, climate, and quiz answers. Especially useful when your Shed is still empty. Tap any pick to see growing notes.",
        attachTo: { element: "[data-testid='seasonal-picks-card']", on: "top" },
      },
      {
        title: "Your daily tasks",
        body: "Rhozly generates smart care tasks for every plant in your garden — watering, pruning, harvesting, and more. Tick them off here as you go. They're based on your plant data and today's weather.",
        attachTo: { element: "[data-testid='home-todays-tasks']", on: "top" },
      },
    ],
  },

  // ─── GARDEN ─────────────────────────────────────────────────────────────────

  {
    id: "garden_hub_tour",
    order: 4,
    trigger: "automatic",
    route: "/shed",
    title: "The Garden Hub",
    description: "How to manage your plant library, Nursery, Notes, and Watchlist.",
    category: "Garden",
    estimated_minutes: 2,
    steps: [
      {
        title: "The Shed — your plant library",
        body: "This is where every plant you grow lives. Search is library-first: free local results appear instantly, with Pl@ntNet, Perenual, Verdantly, and Rhozly AI as opt-in sources behind them. Each entry becomes the source of truth for all your tasks and recommendations.",
        attachTo: { element: "[data-testid='garden-hub-tab-shed']", on: "bottom" },
      },
      {
        title: "Adding plants",
        body: "Tap Add to bring up the plant search. Type a name — Rhozly tries the library first, then offers Pl@ntNet, Perenual, Verdantly, and AI as fallbacks. No plant is too obscure.",
        // Anchor by testid — the button's aria-label is "Find a plant"; the
        // old "[aria-label='Add plant']" anchor had drifted and matched nothing.
        attachTo: { element: "[data-testid='shed-add-plant-btn']", on: "bottom" },
      },
      {
        title: "Your plant cards",
        body: "Each card shows the plant's photo, a small credit badge (so you can see where the image came from), source (Manual, Perenual, Verdantly, Pl@ntNet, or AI), and how many instances you have in the ground. Tap a card for full care notes.",
        attachTo: { element: "[data-testid='shed-plant-list']", on: "top" },
        image: "/assets/onboarding/shed-plant-cards.png",
      },
      {
        title: "Nursery + Notes + Watchlist",
        body: "The Garden tab also holds the Nursery (your seed packets and sowings), Notes (your garden notebook), and the Watchlist (plants flagged with an active health problem after a Plant Doctor diagnosis). Flip between them using the tabs above.",
        attachTo: { element: "[data-testid='garden-hub-tab-watchlist']", on: "bottom" },
      },
    ],
  },

  {
    id: "weather_insights_tour",
    order: 5,
    trigger: "manual-only",
    route: "/dashboard",
    title: "Weather Insights & Forecast",
    description: "How to read the 7-day forecast, interpret alerts, and use the weekly weather watch.",
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
        title: "Weather alerts (24-hour expiry)",
        body: "When serious weather is approaching — frost, heat waves, or heavy rain — you'll see an alert banner at the top of the dashboard. Each alert auto-expires 24 hours after the event passes, so you're never staring at yesterday's frost warning.",
        attachTo: { element: "[data-testid='weather-alert-banner']", on: "bottom" },
      },
      {
        title: "Garden intelligence",
        body: "Every morning, Rhozly checks the forecast and runs your automations. If rain is coming, outdoor watering is skipped. If frost is forecast, you'll get an alert to bring in tender plants. It works while you sleep.",
        attachTo: { element: null, on: null },
      },
      {
        title: "Weekly Overview — the full weather story",
        body: "If you only check Rhozly once a week, the Weekly Overview page (Tools → Weekly Overview, or tap the Week Ahead card) rolls every alert, frost risk, heatwave, and rain event into one Sunday-morning summary — alongside tasks, sowings, and harvests.",
        attachTo: { element: null, on: null },
      },
      {
        title: "Golden Hour push",
        body: "Enable notifications and Rhozly will send a Golden Hour push when conditions are perfect for gardening — dry, mild, low wind. Toggle it under Profile → Notifications.",
        attachTo: { element: null, on: null },
      },
    ],
  },

  // ─── PLANNING ───────────────────────────────────────────────────────────────

  {
    id: "planner_tour",
    order: 6,
    trigger: "automatic",
    route: "/planner",
    title: "The Landscape Planner",
    description: "Create AI-generated growing plans, redesign with Garden Overhaul, and stage tasks.",
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
        title: "AI plan modes (Sage+)",
        body: "The little caret next to New Plan opens two AI-powered modes. 'Reimagine' redesigns an existing space — upload a photo and Rhozly's vision AI + Imagen 4 produce concept 'after' images plus a redesign blueprint. 'My Plants' arranges plants you already own into a multi-area plan. Both flow into the same phase staging as a regular plan.",
        // Anchors the visible split-menu trigger (the Reimagine/My-Plants
        // items live inside the menu, which is closed by default).
        attachTo: { element: "[data-testid='planner-create-menu-btn']", on: "bottom" },
      },
      {
        title: "Phase staging",
        body: "Once a plan exists, tap it to enter the 5-phase staging flow — Infrastructure → The Shed → Staging → Execution → Maintenance. Each phase unlocks as you complete the previous, and the AI blueprint stays on the left as you work through.",
        attachTo: { element: "[data-testid='planner-plan-list']", on: "top" },
        image: "/assets/onboarding/planner-plan-list.png",
      },
      {
        title: "Shopping lists",
        body: "The Shopping tab lets you keep lists of seeds, compost, tools — anything you need to buy. When Plant Doctor suggests a treatment for a sick plant, it can add the remedy straight to a list for you. Templates ('Starter Toolkit', 'Seasonal Veg Patch') get you started fast.",
        attachTo: { element: "[data-testid='planner-hub-tab-shopping']", on: "bottom" },
      },
    ],
  },

  {
    id: "task_schedule_tour",
    order: 7,
    trigger: "automatic",
    route: "/schedule",
    title: "Routines",
    description: "Set up recurring care Routines, tune them with Optimise, and let Rhozly run your garden on rails.",
    category: "Planning",
    estimated_minutes: 2,
    steps: [
      {
        title: "Your Routines",
        body: "Routines are recurring rules that tell Rhozly to generate a task at regular intervals. For example: 'Water my tomatoes every 3 days from May to September'. Set it once and forget it.",
        attachTo: { element: "[data-testid='schedule-heading']", on: "bottom" },
      },
      {
        title: "Creating a Routine",
        body: "Tap 'New Routine' to open the builder. Choose a task type, pick a plant and location, set the frequency, and optionally restrict it to a seasonal window. Harvesting Routines with an end date use the new harvest window model — one task per window, not one per day.",
        attachTo: { element: "[data-testid='blueprint-new-btn']", on: "bottom" },
      },
      {
        title: "Your Routines library",
        body: "Each card here is one active Routine. You can filter by task type, plant, or location. Rhozly checks these every morning and creates ghost tasks for the day — so you wake up knowing exactly what the garden needs.",
        attachTo: { element: "[data-testid='blueprint-list']", on: "top" },
        image: "/assets/onboarding/schedule-blueprint-list.png",
      },
      {
        title: "Smart postponement",
        body: "If Rhozly detects heavy rain is forecast, it will automatically skip a watering task for that day. You don't need to do anything — it handles it. You'll see a 'Postponed — Rain Expected' note on the task.",
        attachTo: { element: null, on: null },
      },
      {
        title: "Optimise — tune your schedule",
        body: "The Optimise tab reviews your blueprints and suggests time-saving changes — merge duplicates, adjust frequency, retire schedules that don't apply anymore. Sage+ users also get AI-Powered Suggestions for seasonal tuning.",
        attachTo: { element: null, on: null },
      },
    ],
  },

  // ─── TOOLS ──────────────────────────────────────────────────────────────────

  {
    id: "tools_hub_tour",
    order: 8,
    trigger: "automatic",
    route: "/tools",
    title: "Tools Overview",
    description: "A quick map of every tool in Rhozly and what each one is for.",
    category: "Tools",
    estimated_minutes: 1,
    steps: [
      {
        title: "Your toolbox",
        body: "The Tools section brings together every specialist feature in Rhozly. Each one is standalone — use them in any order. Let's run through what's available.",
        attachTo: { element: "[data-testid='tools-heading']", on: "bottom" },
      },
      {
        title: "Plant Doctor",
        body: "Photo identification, disease diagnosis, and pest detection. Upload any plant photo and Pl@ntNet + Rhozly AI return results in seconds. (Formerly 'Garden AI'.)",
        attachTo: { element: "[data-testid='tools-hub-plant-doctor']", on: "right" },
      },
      {
        title: "Garden Layout (2D / 3D)",
        body: "Design your garden in 2D or 3D. Draw beds and borders to scale, link them to your actual locations, and use the sun simulator to see which areas get the most light through the year.",
        attachTo: { element: "[data-testid='tools-hub-garden-layout']", on: "right" },
      },
      {
        title: "Plant Visualiser",
        body: "Point your camera at a spot in your garden and see what your plants would look like there before you buy or move them. Great for planning borders.",
        attachTo: { element: "[data-testid='tools-hub-plant-visualiser']", on: "right" },
      },
      {
        title: "Light Sensor",
        body: "Uses your device's ambient light sensor (or camera fallback) to measure lux at any spot. Save the reading directly to an area so Rhozly's recommendations factor in real-world light.",
        attachTo: { element: "[data-testid='tools-hub-light-sensor']", on: "right" },
      },
      {
        title: "Sun Tracker (AR)",
        body: "Augmented-reality view of the sun's path and where shadows fall at different times of day. Use it to find the sunniest spot before planting, or to plan a polytunnel that won't shade your tomatoes.",
        attachTo: { element: "[data-testid='tools-hub-sun-tracker']", on: "right" },
      },
    ],
  },

  {
    id: "plant_doctor_tour",
    order: 9,
    trigger: "automatic",
    route: "/doctor",
    title: "Plant Doctor — Identify & Diagnose",
    description: "How Pl@ntNet + Rhozly AI work together to identify plants and diagnose health problems.",
    category: "Tools",
    estimated_minutes: 2,
    steps: [
      {
        title: "Plant Doctor — your in-pocket plant scientist",
        body: "Take one or more photos of a plant, leaf, or affected area. Plant Doctor runs them through Pl@ntNet first (a botany-trained ID database, free for every tier), then asks Rhozly AI for a second opinion.",
        attachTo: { element: "[data-testid='doctor-upload-zone']", on: "top" },
        image: "/assets/onboarding/doctor-upload.png",
      },
      {
        title: "Three analysis modes",
        body: "Once you have an image, you get three choices: Identify tells you what the plant is. Diagnose looks for disease or nutrient issues. Pest spots insects, eggs, or pest damage and tells you what to do about it.",
        attachTo: { element: "[data-testid='doctor-btn-identify']", on: "top" },
      },
      {
        title: "Reading the result — Pl@ntNet candidates",
        body: "When Pl@ntNet is confident, you'll see its top matches first. Each shows a small CC-BY-SA badge so you can see which photographer contributed the reference photo — tap the badge for full credit.",
        attachTo: { element: "[data-testid='identify-plantnet-tile']", on: "top" },
      },
      {
        title: "Also from Rhozly AI",
        body: "Even when Pl@ntNet is confident, Rhozly AI runs in parallel and shows its top guesses underneath. When the two agree, you'll see a 'both engines agree' chip. When they disagree, pick whichever match feels right based on the reasoning shown.",
        attachTo: { element: "[data-testid='identify-ai-alternative-0']", on: "top" },
      },
      {
        title: "Add to Shed",
        body: "Confirming a plant routes through the same library-first search you use elsewhere — so credits, care data, and source badge all travel with the new entry.",
        attachTo: { element: "[data-testid='doctor-add-to-shed']", on: "top" },
      },
      {
        title: "Your diagnosis history",
        body: "Every analysis you run is saved to your history so you can track a plant's recovery over time. Switch to the History tab to review past sessions.",
        attachTo: { element: "[data-testid='doctor-tab-history']", on: "bottom" },
      },
    ],
  },

  {
    id: "visualiser_tour",
    order: 10,
    trigger: "automatic",
    route: "/visualiser",
    title: "Plant Visualiser",
    description: "How to use the camera overlay to preview plants in your garden space.",
    category: "Tools",
    estimated_minutes: 1,
    steps: [
      {
        title: "Choose your plants",
        body: "Select one or more plants from your Shed by tapping their cards. You can pick several at once to see how they'd look together — great for planning mixed borders. Tip: filter by source (All / Manual / Perenual / Pl@ntNet / AI) to narrow the list.",
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

  // ─── INTERACTIVE GUIDED TASKS ───────────────────────────────────────────────

  {
    id: "add_manual_plant",
    order: 4.5,
    trigger: "manual-only",
    route: "/shed",
    title: "Add a Manual Plant",
    description: "Step-by-step walkthrough: create a plant entry with just the details you know.",
    category: "Garden",
    estimated_minutes: 2,
    steps: [
      {
        title: "Let's add your first plant",
        body: "This guide walks you through creating a manual plant entry — useful when the plant isn't in any database, or when you want to record something quirky. Most of the time, you can find what you want via the library-first search instead; this is the fallback path.",
        attachTo: { element: null, on: null },
      },
      {
        title: "Tap Add",
        body: "Tap the green Add button to open the plant panel.",
        attachTo: { element: "[data-testid='shed-add-plant-btn']", on: "bottom" },
        advanceOn: { selector: "[data-testid='shed-add-plant-btn']", event: "click" },
      },
      {
        title: "Skip the library — Choose Manual",
        body: "Search the library first if you can — it's faster and includes care data. If nothing matches, tap the Manual tab to type the plant in from scratch.",
        attachTo: { element: "[data-testid='bulk-search-tab-manual']", on: "bottom" },
        advanceOn: { selector: "[data-testid='bulk-search-tab-manual']", event: "click" },
        noSpotlight: true,
      },
      {
        title: "Name your plant",
        body: "Type the common name — 'Tomato', 'Peace Lily', 'Fiddle Leaf Fig'. This is what Rhozly will use across tasks and recommendations. Tap Next when you've typed it.",
        attachTo: { element: null, on: null },
        noSpotlight: true,
      },
      {
        title: "Fill in what you know",
        body: "Scroll down to see care fields — watering schedule, sunlight, cycle type, and more. Don't worry about completing every field; you can always edit the plant later. Tap Next when you're happy.",
        attachTo: { element: null, on: null },
        noSpotlight: true,
      },
      {
        title: "Save your plant",
        body: "Tap Save Plant and your entry will appear in the Shed immediately.",
        attachTo: { element: "[data-testid='plant-form-save-btn']", on: "top" },
        advanceOn: { selector: "[data-testid='plant-form-save-btn']", event: "click" },
        noSpotlight: true,
      },
      {
        title: "Your plant is in the Shed!",
        body: "Well done — it's part of your library now. From here you can assign it to a garden bed, set up care automations in the Schedule, or run an AI diagnosis if something looks wrong.",
        attachTo: { element: null, on: null },
      },
    ],
  },

  {
    id: "add_location_and_area",
    order: 4.6,
    trigger: "manual-only",
    route: "/management",
    title: "Add a Location & Area",
    description: "Guided walkthrough: create your first garden location and add an area inside it.",
    category: "Getting Started",
    estimated_minutes: 2,
    steps: [
      {
        title: "Set up your garden space",
        body: "A Location is any growing space you manage — a back garden, a balcony, a greenhouse. Each location holds one or more Areas (raised beds, pots, borders). Let's create your first one.",
        attachTo: { element: null, on: null },
      },
      {
        title: "Tap New Location",
        body: "Tap 'New Location' to open the creation form.",
        attachTo: { element: "[data-testid='location-add-btn']", on: "bottom" },
        advanceOn: { selector: "[data-testid='location-add-btn']", event: "click" },
      },
      {
        title: "Name your location",
        body: "Give it a descriptive name — 'Back Garden', 'Kitchen Windowsill', 'Polytunnel'. Tap Next when you've typed it.",
        attachTo: { element: "[data-testid='location-name-input']", on: "bottom" },
      },
      {
        title: "Inside or outside?",
        body: "Toggle whether this space is indoors or outdoors. This affects which plants Rhozly recommends and whether weather-based rules apply to tasks here.",
        attachTo: { element: "[data-testid='location-name-input']", on: "bottom" },
      },
      {
        title: "Save your location",
        body: "Tap 'Save Location' to create it. It will appear in your list below.",
        attachTo: { element: "[data-testid='location-save-btn']", on: "top" },
        advanceOn: { selector: "[data-testid='location-save-btn']", event: "click" },
      },
      {
        title: "Add an area",
        body: "Find your new location in the list and tap 'Add Area' inside it. Areas are the specific spots within a location — a raised bed, a row of pots, a shady corner.",
        attachTo: { element: "[data-testid='area-add-btn']", on: "top" },
        advanceOn: { selector: "[data-testid='area-add-btn']", event: "click" },
      },
      {
        title: "Name your area",
        body: "A new area called 'New Area' has been created. Tap its name in the list to rename it — 'North Bed', 'Patio Pots', 'Herb Spiral'. The name saves automatically when you click or tap away.",
        attachTo: { element: null, on: null },
      },
      {
        title: "You're all set up!",
        body: "Your location and area are live. Head to the Garden tab to add plants and assign them here. Once your plants are in, Rhozly will start generating care tasks and weather-aware automations automatically.",
        attachTo: { element: null, on: null },
      },
    ],
  },

  // ─── COMMUNITY ──────────────────────────────────────────────────────────────

  {
    id: "guides_tour",
    order: 11,
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
    order: 12,
    trigger: "automatic",
    route: "/profile",
    title: "Home Profile Quiz",
    description: "What the quiz does and how it shapes your AI recommendations.",
    category: "Getting Started",
    estimated_minutes: 1,
    steps: [
      {
        title: "Train your AI",
        body: "The Home Profile is how Rhozly learns your taste. Answer a few quick questions about your growing style and the plants you like, and the AI will personalise every recommendation, plan, and care suggestion to suit you.",
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
        title: "Voice settings",
        body: "Under Profile → Voice you can turn on auto-read replies, pick a voice, and set the speed. Plant Doctor chat and the Garden AI overlay both support tap-to-talk and tap-to-listen — handy when your hands are muddy.",
        attachTo: { element: null, on: null },
      },
      {
        title: "Persona + Quick Launcher",
        body: "Profile also lets you pick a Persona (how Rhozly speaks to you — Plain, Cheerful, Expert, Mentor) and customise the Quick Launcher (drag-to-reorder the 16 shortcut tiles in the + menu). Both update everywhere instantly.",
        attachTo: { element: null, on: null },
      },
      {
        title: "What happens next",
        body: "Your preferences automatically surface in three places: the Shed sorts plants by how well they match your taste, the Planner prioritises plants you'd enjoy growing, and the AI assistant tailors its advice to your style. The more you interact, the better it gets.",
        attachTo: { element: null, on: null },
      },
    ],
  },

  // ─── WAVE 23.0003: NEW PACING-AWARE FLOWS ──────────────────────────────────
  //
  // Each new flow uses 23.0001's mechanics:
  //   - `triggerSignal` — fires only after the user touches the feature
  //   - `prerequisite`  — chains so deep-feature tours never fire before
  //                       the welcome flow
  // Throttle (one auto-tour per day) applies unless `important: true`.

  // quick_access_tour removed 2026-07-20 — the phone /quick launcher home it
  // described was retired ("one responsive home"); its launcher now lives on
  // the responsive /dashboard (see quick_launcher_customise_tour below).

  {
    id: "weekly_overview_tour",
    order: 14,
    trigger: "automatic",
    route: "/weekly",
    prerequisite: "global_welcome",
    triggerSignal: "first_weekly_visit",
    title: "Weekly Overview",
    description: "Your Sunday-morning recap of the week ahead — tasks, weather, sowings, harvests.",
    category: "Tools",
    estimated_minutes: 1,
    steps: [
      {
        title: "The whole week, on one page",
        body: "Weekly Overview is Rhozly's Sunday-morning recap of the next 7 days. Tasks, weather events, sowings, harvest windows opening, pruning windows opening, AI tips, pest-risk lines, pollen — every angle.",
        attachTo: { element: null, on: null },
      },
      {
        title: "When it updates",
        body: "A new overview is generated every Sunday at 06:00 UTC by Rhozly's weekly cron. Sage+ users see a Regenerate button to rebuild it on demand.",
        attachTo: { element: null, on: null },
      },
      {
        title: "Tap to drill in",
        body: "Every row on the overview is a launchpad — tap a task count to see those tasks, tap a sowing to log it, tap a harvest window to jump into Plant Doctor. It's a glance-and-act page, not a read-and-forget one.",
        attachTo: { element: null, on: null },
      },
      {
        title: "Notifications",
        body: "If you have push notifications enabled, you'll get a nudge on Sunday morning when the new overview lands. Toggle under Profile → Notifications.",
        attachTo: { element: null, on: null },
      },
    ],
  },

  {
    id: "notes_tour",
    order: 15,
    trigger: "automatic",
    route: "/journal",
    prerequisite: "global_welcome",
    triggerSignal: "first_notes_visit",
    title: "Notes",
    description: "Rich-text garden notebook — jot anything, link to plants/areas/plans, find it from those screens.",
    category: "Garden",
    estimated_minutes: 1,
    steps: [
      {
        title: "Your garden notebook",
        body: "Notes is for everything that isn't a task or a plan — observations, ideas, reminders, sketches. Type a title (optional) and start writing. Notes auto-save as you go.",
        attachTo: { element: "[data-testid='notes-page']", on: "bottom" },
      },
      {
        title: "Rich text, when you want it",
        body: "The editor supports headings, bullet and numbered lists, checkbox lists, tables, images, and the usual bold/italic/link. Pasted images attach inline.",
        attachTo: { element: null, on: null },
      },
      {
        title: "Link to plants, areas, and plans",
        body: "The killer feature: tap +Link at the bottom of any note to attach it to a plant, area, or plan. Now that note shows up on those screens — so a thought about your tomato bed surfaces from the tomato page, the bed area page, AND the plan page.",
        attachTo: { element: null, on: null },
      },
      {
        title: "Pin the important ones",
        body: "Tap the 📌 icon on any note to keep it at the top of the Notes feed. Great for standing reminders like 'Frost dates 2026' or 'Lawn problem zones'.",
        attachTo: { element: null, on: null },
      },
      {
        title: "Shared across the home",
        body: "Notes are shared with every member of your home — write them as a team. Archive (don't delete) when you're done with one; you can always restore later.",
        attachTo: { element: null, on: null },
      },
    ],
  },

  {
    id: "voice_chat_tour",
    order: 16,
    trigger: "automatic",
    route: "/dashboard",
    prerequisite: "global_welcome",
    triggerSignal: "first_chat_opened",
    title: "Voice in Chat",
    description: "Tap to talk, tap to listen — mic in and read-aloud out across every chat surface.",
    category: "Tools",
    estimated_minutes: 1,
    steps: [
      {
        title: "Voice in",
        body: "Tap the 🎙️ mic next to the input field, speak naturally, then tap again to send. Rhozly uses your device's native speech recognition — no audio leaves your device, only the transcript.",
        attachTo: { element: null, on: null },
      },
      {
        title: "Voice out",
        body: "Every AI reply has a 🔊 speaker icon at the top right of the message. Tap it to hear the reply once. Long-press to skip to the end.",
        attachTo: { element: null, on: null },
      },
      {
        title: "Auto-read everything",
        body: "Want every reply to play automatically? Turn on 'Voice replies' under Profile → Voice. Pick your voice and set the speed there too.",
        attachTo: { element: null, on: null },
      },
      {
        title: "Works everywhere chat works",
        body: "Plant Doctor chat, the Garden AI overlay — voice is on by default for both. No setup required besides granting microphone access the first time you tap the mic.",
        attachTo: { element: null, on: null },
      },
    ],
  },

  {
    id: "image_credits_tour",
    order: 17,
    trigger: "manual-only",
    route: "/credits",
    prerequisite: "global_welcome",
    title: "Image Credits",
    description: "Why every plant photo carries a credit badge — and where to find the full register.",
    category: "Community",
    estimated_minutes: 1,
    steps: [
      {
        title: "Every photo has a story",
        body: "Plant photos in Rhozly come from contributors — Pl@ntNet community photographers, Unsplash artists, the Perenual database, Verdantly's botanists, and the Rhozly team. We credit every one.",
        attachTo: { element: null, on: null },
      },
      {
        title: "The credit badge",
        body: "A small badge appears in the corner of every tile, hero, and lightbox showing the source. Tap it for the popover — contributor name, licence (often CC-BY-SA), and a link to the original.",
        attachTo: { element: null, on: null },
      },
      {
        title: "The /credits page",
        body: "This page lists every credited image in your home. Filter by source or contributor to find a specific photographer's work. Useful if you want to thank someone whose photo helped you grow something.",
        attachTo: { element: null, on: null },
      },
    ],
  },

  {
    id: "garden_ai_chat_tour",
    order: 18,
    trigger: "automatic",
    route: "/dashboard",
    prerequisite: "global_welcome",
    triggerSignal: "first_chat_opened",
    title: "Garden AI Chat",
    description: "How the AI uses your garden context — page-aware suggestions, plans, and plant picks.",
    category: "Tools",
    estimated_minutes: 1,
    steps: [
      {
        title: "Context-aware from the start",
        body: "The Garden AI chat knows what page you opened it from. Ask 'what should I do today?' on the dashboard and it factors in today's tasks and weather. Open it from a plant page and it focuses on that plant.",
        attachTo: { element: null, on: null },
      },
      {
        title: "Suggested plants and tasks",
        body: "When the AI suggests a plant or a task, it appears as a tile with an Add button — tap once to drop it into your Shed or schedule. No retyping.",
        attachTo: { element: null, on: null },
      },
      {
        title: "Plan suggestions",
        body: "Ask the AI to draft a plan ('a low-water herb bed for the south wall') and it returns a structured proposal you can save straight to the Planner. The full 5-phase staging flow takes it from there.",
        attachTo: { element: null, on: null },
      },
      {
        title: "Voice in, voice out",
        body: "Garden AI fully supports the voice flow — tap the mic to talk, tap the speaker on any reply to listen. See the Voice in Chat tour for the full setup.",
        attachTo: { element: null, on: null },
      },
    ],
  },

  {
    id: "plantnet_identification_tour",
    order: 19,
    trigger: "manual-only",
    route: "/doctor",
    prerequisite: "plant_doctor_tour",
    title: "Pl@ntNet Identification (Deep Dive)",
    description: "Why Pl@ntNet leads, what CC-BY-SA means, and how to read the dual-tile result.",
    category: "Tools",
    estimated_minutes: 1,
    steps: [
      {
        title: "Pl@ntNet first, always",
        body: "Pl@ntNet runs before Rhozly AI for three reasons: it's accurate (community-verified photos), it's fast (<1s), and it's free for every tier. The AI tile is the second-opinion safety net.",
        attachTo: { element: null, on: null },
      },
      {
        title: "CC-BY-SA — credit + share-alike",
        body: "Pl@ntNet photos are licensed CC-BY-SA. That's why every result tile shows a small badge with the contributor's name. Click it to see the original observation on Pl@ntNet.",
        attachTo: { element: null, on: null },
      },
      {
        title: "When the two engines agree",
        body: "If Pl@ntNet and Rhozly AI converge on the same species, you'll see a 'both engines agree' chip. Strongest signal — pick the species and move on.",
        attachTo: { element: null, on: null },
      },
      {
        title: "When they disagree",
        body: "Read both reasonings. Pl@ntNet may pick a regional contributor photo while AI weighs broader plant traits. Tap 'None of these' to run another round if neither feels right.",
        attachTo: { element: null, on: null },
      },
      {
        title: "Where Pl@ntNet is weaker",
        body: "Hybrid cultivars, extreme close-ups, seedlings, and unusual houseplants — these tend to be where AI's cross-check matters most. Use them as a signal to trust the AI tile more.",
        attachTo: { element: null, on: null },
      },
    ],
  },

  {
    id: "nursery_tour",
    order: 20,
    trigger: "automatic",
    route: "/shed",
    prerequisite: "garden_hub_tour",
    triggerSignal: "first_nursery_open",
    title: "Nursery & Sowing",
    description: "Seed packets, sowings, germination tracking, and the plant-out queue.",
    category: "Garden",
    estimated_minutes: 1,
    steps: [
      {
        title: "From packet to plant-out",
        body: "The Nursery tracks everything before plants make it into a bed — seed packets, active sowings, germinated seedlings, and the plant-out queue. Flip between Shed and Nursery from the page header.",
        attachTo: { element: null, on: null },
      },
      {
        title: "Three ways to add a packet",
        body: "Add packets manually, paste a multi-line list of plant names, or scan the back of a real packet — Rhozly's AI extracts species, sow-by, and growing instructions in seconds.",
        attachTo: { element: null, on: null },
      },
      {
        title: "Sow → Germinate → Plant out",
        body: "Tap a packet to sow seeds. Log germination when sprouts appear (and the success rate, so Rhozly learns). Plant out when seedlings are ready — optionally creating matching plants in the Shed.",
        attachTo: { element: null, on: null },
      },
      {
        title: "The Plant Out queue",
        body: "The Plant Out sub-view collects every active sowing that's ready to go in the ground. Useful when you've sown a lot at once and want to work through plant-outs over a weekend.",
        attachTo: { element: null, on: null },
      },
      {
        title: "Sowing calendar",
        body: "Switch to Calendar view inside the Nursery to see the month-by-month sow-by windows, recommended sow windows, and active sowings. Hemisphere-aware — Northern users see Northern windows.",
        attachTo: { element: null, on: null },
      },
    ],
  },

  {
    id: "garden_walk_tour",
    order: 21,
    trigger: "automatic",
    route: "/walk",
    prerequisite: "garden_hub_tour",
    triggerSignal: "first_walk_started",
    title: "Garden Walk",
    description: "A guided card-by-card walk through your plants — Snap, Note, All good, or Skip.",
    category: "Garden",
    estimated_minutes: 1,
    steps: [
      {
        title: "Your daily walkthrough",
        body: "Garden Walk presents your plants one card at a time so you can do a quick health check without staring at a giant grid. Use it as your morning coffee routine.",
        attachTo: { element: null, on: null },
      },
      {
        title: "Four actions per plant",
        body: "On each card you can: 📸 Snap (take a photo and log it), ✏️ Note (drop a quick observation), ✅ All good (no issues — moves to the next), or ⏭ Skip (haven't checked, keep in queue for tomorrow).",
        attachTo: { element: null, on: null },
      },
      {
        title: "Walk again later",
        body: "When the walk finishes, the summary card shows how many plants you visited, photos taken, notes added, tasks completed, and ailments flagged. Tap 'Walk again' to do another pass — skipped plants surface first.",
        attachTo: { element: null, on: null },
      },
      {
        title: "Flagged ailments hop to the Watchlist",
        body: "If you log an ailment during the walk (a flag for aphids on the kale, for example), it lands on the Watchlist with the same prevention/remedy structure as Plant Doctor diagnoses. Walk → Diagnose flows in one place.",
        attachTo: { element: null, on: null },
      },
    ],
  },

  {
    id: "seasonal_picks_tour",
    order: 22,
    trigger: "manual-only",
    route: "/dashboard",
    prerequisite: "dashboard_tour",
    title: "Seasonal Picks",
    description: "Why these specific plants — and how the deterministic vs AI fallback decides.",
    category: "Getting Started",
    estimated_minutes: 1,
    steps: [
      {
        title: "Curated for your garden",
        body: "Seasonal Picks suggests plants you could realistically grow right now — factoring in your hemisphere, climate zone, areas, and quiz answers. Especially helpful when your Shed is empty.",
        attachTo: { element: "[data-testid='seasonal-picks-card']", on: "top" },
      },
      {
        title: "Deterministic first, AI fallback",
        body: "Rhozly tries the deterministic engine first — a curated seasonal database that runs instantly and consumes no AI credits. If your context is unusual (rare climate zone, unusual area combos), Sage+ users get an AI fallback that generates fresh picks.",
        attachTo: { element: null, on: null },
      },
      {
        title: "Tap to learn more",
        body: "Tap any pick to open the plant detail modal — care guide, companion plants, optional Add to Shed. Picks rotate as your garden state changes.",
        attachTo: { element: null, on: null },
      },
    ],
  },

  {
    id: "quick_launcher_customise_tour",
    order: 23,
    trigger: "manual-only",
    route: "/profile",
    prerequisite: "global_welcome",
    title: "Customise the Quick Launcher",
    description: "Pick which 8 (or more) tiles appear in the Quick Actions on your dashboard, and in what order.",
    category: "Getting Started",
    estimated_minutes: 1,
    steps: [
      {
        title: "Your toolbox, your way",
        body: "The Quick Launcher — the Quick Actions tiles on your dashboard — defaults to the eight most-used shortcuts. Sixteen are available — let's pick yours.",
        attachTo: { element: null, on: null },
      },
      {
        title: "Toggle and reorder",
        body: "Under Profile → Quick Launcher, toggle each of the 16 tiles on or off, and drag the row handle to reorder them. Changes apply instantly — no save button needed.",
        attachTo: { element: null, on: null },
      },
      {
        title: "Reset to defaults",
        body: "Made a mess of it? Tap Reset to restore the original eight. The customisation lives per-user and persists across devices.",
        attachTo: { element: null, on: null },
      },
    ],
  },
];
