import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { log, error as logError } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";
import { callGeminiCascade } from "../_shared/gemini.ts";
import { requireAuth } from "../_shared/requireAuth.ts";
import { enforceRateLimit } from "../_shared/rateLimit.ts";
import { getCached, setCached, cacheKey } from "../_shared/aiCache.ts";
import { logAiUsage } from "../_shared/aiUsage.ts";

const FN = "app-help";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Full knowledge base — detailed content for AI context.
// Keep in sync with src/data/appHelp.ts (display data lives there).
const KNOWLEDGE_BASE = `
## Dashboard
SECTION[dashboard-overview]: The Dashboard is the home screen showing today's tasks, live weather conditions, weather alerts, and a snapshot of all your locations and areas. It refreshes automatically. Weather alerts appear as banners when conditions require action (e.g. frost warning, heat wave).
SECTION[dashboard-tasks]: Tasks appear on the Dashboard grouped by due date. Tap a task to open its detail panel where you can mark it complete, skip it, or postpone it. Completing a task records the date and increments your streak.
SECTION[dashboard-weather]: Rhozly fetches live weather for your home location and shows a 7-day forecast. Weather alerts are generated automatically when conditions like frost, drought, or extreme heat are detected, and they suggest protective actions.

## The Shed (Plant Inventory)
SECTION[shed-overview]: The Shed is your plant inventory. Every plant you own lives here, whether assigned to a specific area or just stored. You can filter by status (active, archived), search by name, and see which area each plant is in.
SECTION[shed-add-ai]: To add a plant using AI: tap the + button in the Shed, select one or more plants from a recommendation or search result, then tap "Generate with AI". Rhozly calls the AI to build a full care plan including watering frequency, pruning schedule, and light requirements. This requires the Sage or Evergreen plan.
SECTION[shed-add-database]: To add a plant from the Plant Database: tap +, search the 10,000+ species database, select your plant, and tap "Match via Plant Database". This imports accurate care schedules based on scientific data. Requires the Botanist or Evergreen plan.
SECTION[shed-add-manual]: To add a plant manually: tap + and choose "Add Manually". Enter a name, optionally a photo, and the plant is added without AI or database data. You can add tasks and care notes yourself.
SECTION[shed-view-instance]: Tap any plant card in the Shed to open its full detail view. Here you can see the care routine (watering, pruning, feeding schedule), stats (tasks completed, yields), the growth stage, linked ailments, and a journal of past care actions.
SECTION[shed-archive]: To archive a plant, open its detail view, tap the menu (⋯) in the top-right corner, and choose Archive. Archived plants are hidden from the main Shed view but not deleted. You can restore them from the Archived filter.

## Tasks & Blueprints
SECTION[tasks-overview]: Tasks are individual care actions with a specific due date (e.g. "Water tomatoes today"). Blueprints are recurring task templates that automatically generate tasks on a schedule (e.g. "Water every 3 days").
SECTION[tasks-create]: To create a one-off task: tap the + icon on the Dashboard or inside a plant detail, fill in the task type (watering, pruning, feeding, etc.), set a due date, and optionally assign it to a home member.
SECTION[tasks-complete]: To complete a task, tap the circular tick icon. To skip it (mark as done without recording), tap ⋯ then Skip. Skipped tasks still generate the next occurrence if they are blueprint-generated.
SECTION[blueprints-overview]: Blueprints (found under Schedule in the nav) are recurring task templates. You define the task type, frequency (every N days/weeks/months), and which plant it applies to. Rhozly generates "ghost tasks" from blueprints automatically.
SECTION[blueprints-create]: To create a Blueprint: go to Schedule → tap +. Choose a task type, set the frequency interval, assign a plant, and optionally assign it to a home member. The Blueprint starts generating tasks from the next due date.
SECTION[blueprints-manage]: To edit a Blueprint: open Schedule, find the Blueprint, tap it. You can change the frequency, task type, assignee, or archive the Blueprint entirely.
SECTION[tasks-assignee]: When creating or editing a task or Blueprint, tap the Assignee field to assign it to a specific member of your home. Only the assignee and home owners/managers will see the task on their Dashboard.

## Locations & Areas
SECTION[locations-overview]: Locations are physical spaces in your property (e.g. Back Garden, Greenhouse, Kitchen). Areas are zones within a Location (e.g. Raised Bed 1, South-Facing Windowsill). Plants are assigned to Areas, and tasks can be scoped to Locations.
SECTION[locations-create]: To create a Location: go to Management → tap "Add Location". Enter a name, optionally add a description, and set the location type (indoor, outdoor, greenhouse). The Location appears on your Dashboard.
SECTION[areas-create]: To create an Area: open a Location in Management → tap "Add Area". Give it a name, set the area type (bed, container, wall, etc.), and it appears inside the Location ready to have plants assigned.
SECTION[areas-conditions]: Open an Area in Management → tap the "Advanced" or soil icon tab to set growing conditions: soil pH (0-14), growing medium (mineral soil, soilless mix, hydroponics, etc.), medium texture, water movement, and nutrient source. These inform AI recommendations.
SECTION[areas-add-plant]: To add a plant to an Area: open the Area in Management, tap "Add Plant", then choose a plant from your Shed or search to add a new one. The plant becomes a plant instance in that area with its own care history.
SECTION[areas-lux]: To log a light reading: go to the Light Sensor page from the nav or from within an Area. Hold your device towards the light source, tap "Record", and the lux value is saved to the Area. This helps Rhozly recommend plants suited to the light level.

## Plant Doctor
SECTION[doctor-overview]: Plant Doctor is the AI-powered diagnostic tool. It can identify unknown plants from photos, diagnose diseases or deficiencies, and detect pests. It requires the Sage or Evergreen plan for AI features.
SECTION[doctor-identify]: To identify a plant: go to Plant Doctor, tap "Identify Plant", take or upload a clear photo of the plant (whole plant is best), and the AI returns the most likely species with confidence scores.
SECTION[doctor-diagnose]: To diagnose a sick plant: go to Plant Doctor, tap "Diagnose", take or upload a photo of the affected leaves or stems. The AI returns possible diseases, deficiencies, or environmental causes, plus recommended treatment steps.
SECTION[doctor-pest]: To identify a pest: go to Plant Doctor, tap "Pest", take or upload a photo of the pest or the damage it has caused. The AI identifies the pest type and suggests organic and chemical control methods.
SECTION[doctor-chat]: After a diagnosis or identification, a "Chat" option appears. Tap it to open a conversation with the AI about that specific plant and issue. You can ask follow-up questions, refine the diagnosis, or ask for care advice.
SECTION[doctor-history]: Tap "History" on the Plant Doctor page to see all past sessions. Each session shows the photo used, the result, and the date. Tap a session to re-read the diagnosis or continue the chat.

## Area Scan
SECTION[scan-overview]: Area Scan uses AI to analyse a photo of your growing area. It identifies plants present, flags potential pest or disease signs, suggests companion plants, and estimates growing capacity. Requires Sage or Evergreen plan.
SECTION[scan-run]: To run a scan: open an Area in Management, tap the Scan icon (camera with sparkle), take a clear overhead or wide photo of the area. The AI analyses it and returns a structured report you can act on.

## Planner
SECTION[planner-overview]: The Planner is for creating structured garden projects — "In-Progress", "Completed", or "Archived". Each plan contains tasks you can assign to plants and areas. AI can generate task suggestions based on your goals.
SECTION[planner-create]: To create a plan: go to Planner → tap "New Plan". Enter a name and optional goal description. The plan starts in "In Progress" status. Add tasks manually or use AI suggestions.
SECTION[planner-ai]: Inside a plan, tap "AI Suggest" to describe what you want to achieve (e.g. "set up a vegetable patch for spring"). Rhozly generates a list of recommended tasks with suggested timing and priorities.
SECTION[planner-landscape]: The Landscape Plan feature generates a tailored planting layout. Go to Planner, tap "Landscape Plan", answer a few questions about your space and goals, and the AI produces a structured planting recommendation with companion groupings.

## Ailment Watchlist
SECTION[watchlist-overview]: The Watchlist is where you track pests, diseases, and invasive plants that are a threat or active problem in your garden. Each ailment has prevention steps and remedy steps you can follow.
SECTION[watchlist-add]: To add an ailment: go to Watchlist → tap +. Search by name, or tap "AI Search" to describe what you're seeing and the AI will suggest the likely ailment. You can also add manually with a custom name.
SECTION[watchlist-link]: To link an ailment to a specific plant: open the plant instance in the Shed or an Area, tap "Link Ailment", and select from your Watchlist. This creates a record and optionally triggers automated prevention tasks.

## Guides
SECTION[guides-rhozly]: Rhozly Guides are AI-generated, structured plant care guides you can read in the app. They cover growing techniques, seasonal care, pest control, and more. Search and filter by label to find what you need.
SECTION[guides-community]: Community Guides are written and published by Rhozly users. They cover personal experiences, unusual techniques, and local knowledge. You can star, comment on, and reply to community guides.
SECTION[guides-create]: To write a Community Guide: go to Guides → Community tab → tap "Write a Guide". Use the rich-text editor to write sections, add tips and warnings, then choose labels and publish. Drafts are saved automatically.

## Shopping List
SECTION[shopping-overview]: The Shopping List helps you track what to buy for your garden — seeds, tools, fertilisers, or anything else. You can create multiple lists for different occasions or stores.
SECTION[shopping-add]: To add an item: open a Shopping List → tap +. Search the Plant Database, browse your Shed plants, or type a custom item name. Items can have quantities and notes.
SECTION[shopping-lists]: To create a new list: tap "New List" on the Shopping page. Name it (e.g. "Spring Planting", "Hardware Store Run") and it becomes its own independent list you can share or archive.

## Home Profile & AI Preferences
SECTION[profile-quiz]: The Garden Quiz (Home Profile → Quiz tab) asks about your gardening style, experience, goals, and plant preferences. Your answers are saved as AI preferences that influence Planner suggestions and companion plant recommendations.
SECTION[profile-preferences]: AI preferences are automatically learned from your quiz, plant swipes, and Plant Doctor chats. You can view and delete individual preferences from the Home Profile page. Resetting the profile clears all preferences and your quiz completion.
SECTION[profile-swipe]: The Discover Plants swipe deck (Home Profile → Discover Plants tab) shows you plant cards. Swipe right to mark a plant as liked, swipe left to dislike. This trains your AI preferences for more personalised recommendations.

## Gardener Profile (Account Settings)
SECTION[account-name]: To change your display name: tap your avatar or initials in the top-right corner of the nav to open your Gardener Profile, go to the Account tab, and update the Display Name field.
SECTION[account-plan]: Rhozly has four plans: Sprout (free — basic tracking, no AI), Botanist (species database), Sage (AI features — Plant Doctor, scans, AI planning), Evergreen (all features). Switch plans in Gardener Profile → Account → Your Plan.
SECTION[account-ai-usage]: Your AI usage is shown in Gardener Profile → Account → AI Usage section. It shows calls made today, total this month, estimated cost, and your hourly rate limits per AI feature. Custom limits set by support appear highlighted.

## Integrations
SECTION[integrations-overview]: Integrations connect physical IoT devices to your Rhozly home. Supported: Ecowitt soil sensors (temperature, moisture, EC) and eWeLink smart water valves (remote on/off with auto-off timer). Reach the Integrations page from the nav bar.
SECTION[integrations-connect]: To connect a device: go to Integrations (nav bar), tap "Connect Device", choose the device type (soil sensor or water valve), follow the on-screen wizard. For Ecowitt sensors, enter your API key. For eWeLink valves, sign in with your eWeLink account via the OAuth flow.
SECTION[integrations-valve-ewelink]: To connect an eWeLink water valve: tap "Connect Device" → choose "Water Valve" → choose "eWeLink". A browser window opens for you to log in to your eWeLink account and grant Rhozly permission. Once authorised, all your eWeLink valves are imported automatically. Each valve appears on the Integrations page where you can rename it, assign it to a location/area, and set a default run duration. The valve auto-shuts off after the duration as a safety failsafe.
SECTION[integrations-valve-control]: To manually control a valve: open the valve card from the Integrations page, then tap "Turn On". The valve opens for its configured duration and auto-shuts off. You can see the valve's live state (on/off) and the last time it was used. Use this to test a valve or water on demand outside of any automation.

## Automations
SECTION[automations-overview]: Automations (shown below the device list on the Integrations page) automatically fire your water valves on a daily schedule when linked watering tasks are due. After firing, all linked tasks are marked complete. If a task is not yet due, the automation skips itself for that day. You can have multiple automations for different zones or schedules. Each valve can only belong to one automation.
SECTION[automations-create]: To create an automation: go to Integrations, scroll to the Automations section, tap "New Automation". Fill in: a name, an active toggle, the UTC start time (the hour when the automation is checked — it will run once per day at this hour if a controlling task is due), the run duration in seconds for how long valves stay open, which valves to include, which task Blueprints are controlling vs driven, and optional settings like weather-skip and sequential firing. Tap "Create automation" to save.
SECTION[automations-tasks]: Automations use two task roles. A "controlling" task is a recurring Blueprint that triggers the automation — the automation only runs on days when the controlling task is due. A "driven" task is auto-completed by the automation but does not trigger it (e.g. a feeding blueprint you want ticked off on watering days). Controlling tasks are automatically treated as driven too, so they are always marked complete when the automation runs. If a task is already marked complete that day, it is not double-completed.
SECTION[automations-run-now]: Tap "Run Now" on an automation card to fire the automation immediately, ignoring the schedule, time check, and weather check. This is useful for testing or for watering on demand. The result (valves fired, tasks completed) is recorded in the run history.
SECTION[automations-weather]: To skip watering when it has already rained: open or create an automation, enable "Skip if it rained", and set a rainfall threshold in mm (default 5 mm). If today's weather forecast shows rainfall at or above the threshold, the automation skips itself and logs the run as "Rain skipped". This uses the weather data Rhozly already fetches for your home location.
SECTION[automations-sequential]: If your automation includes multiple valves, you can choose how they fire. "Fire sequentially" runs each valve one at a time — each valve waits for the previous one to finish before starting. This prevents pressure drops if your plumbing cannot supply multiple zones at once. If disabled, all valves fire simultaneously at the scheduled time. Sequential mode is only available when two or more valves are selected.

## Light Sensor
SECTION[lightsensor-overview]: The Light Sensor page (nav → Light Sensor) uses your device camera to estimate ambient lux. Point your device at the light source in your growing area and tap Record. The reading is logged to the Area you select and appears in the Area's Advanced settings.

## Plant Visualiser
SECTION[visualiser-overview]: The Plant Visualiser (nav → Visualiser) shows a top-down 2D view of your garden. Drag and drop plant sprites to arrange them visually. This is a planning tool — it does not affect your actual plant data.

## Home Management
SECTION[home-invite]: To invite someone to your home: go to Management → tap the Home Settings or Members section → tap "Invite Member". Enter their email address. They will receive an invitation to join your Rhozly home.
SECTION[home-roles]: Rhozly has three member roles: Owner (full control — can delete the home, manage members, change all settings), Manager (can add/edit plants, tasks, and areas), Member (can complete tasks and view data but cannot add or delete).

## Achievements
SECTION[achievements-overview]: Achievements are earned automatically as you use the app. Examples: completing 10 tasks (Dedicated Gardener), running your first AI scan (Eagle Eye), logging your first yield (First Harvest). View them in Gardener Profile → Achievements tab.
`.trim();

const SYSTEM_PROMPT = `
You are the in-app help assistant for Rhozly, a plant care and garden management app.
Your ONLY job is to answer questions about how to USE the Rhozly app — navigation, features, settings, and workflows.
Do NOT answer questions about plant care, plant requirements, diseases, gardening techniques, or anything outside the app itself.
If asked about plants or gardening (not the app), reply: "I can only help with questions about using the Rhozly app itself. For plant care advice, try Plant Doctor or the Guides section."

You will be given a knowledge base of app sections formatted as SECTION[id]: description.
Answer the user's question in 2-4 clear, friendly sentences. Be specific and actionable — tell them exactly what to tap or where to go.
Then return 1-4 section IDs that are most relevant to the question.

Respond ONLY with valid JSON matching this exact shape:
{"answer": "...", "sectionIds": ["id1", "id2"]}
`.trim();

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { question } = await req.json();
    if (!question || typeof question !== "string" || question.trim().length < 3) {
      return new Response(JSON.stringify({ error: "question is required" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!geminiApiKey || !supabaseUrl || !supabaseServiceKey) throw new Error("Missing env vars");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authResult = await requireAuth(req, supabase);
    if (authResult instanceof Response) return authResult;

    const rateLimitErr = await enforceRateLimit(supabase, authResult.user.id, FN);
    if (rateLimitErr) return rateLimitErr;

    // Normalise question for cache key
    const normalised = question.toLowerCase().trim().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").slice(0, 120);
    const key = cacheKey("app-help", normalised);
    const cached = await getCached<{ answer: string; sectionIds: string[] }>(supabase, key);
    if (cached) {
      log(FN, "cache_hit", { normalised });
      return new Response(JSON.stringify(cached), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const userMessage = `KNOWLEDGE BASE:\n${KNOWLEDGE_BASE}\n\nUSER QUESTION: ${question.trim()}`;

    const { text: rawText, usage } = await callGeminiCascade(
      geminiApiKey,
      FN,
      [{ role: "user", parts: [{ text: userMessage }] }],
      { systemPrompt: SYSTEM_PROMPT, responseMimeType: "application/json", temperature: 0.2 },
    );

    const parsed = JSON.parse(rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
    const result = {
      answer: String(parsed.answer ?? ""),
      sectionIds: Array.isArray(parsed.sectionIds) ? parsed.sectionIds.filter((s: unknown) => typeof s === "string") : [],
    };

    log(FN, "answered", { question: normalised, sectionCount: result.sectionIds.length });
    await setCached(supabase, key, FN, result, 30);
    await logAiUsage(supabase, { userId: authResult.user.id, functionName: FN, action: "app_help", usage });

    return new Response(JSON.stringify(result), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    logError(FN, "error", { error: err.message });
    await captureException(FN, err);
    return new Response(
      JSON.stringify({ answer: "Sorry, I couldn't process that right now. Please try again in a moment.", sectionIds: [] }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }
});
