/**
 * Garden AI chat — evaluation question bank.
 *
 * The single source of truth for what we ask the assistant each run. Kept
 * separate from the runner so it's easy to EXPAND: add another object to NEW or
 * EXP (or a new persona array) and the next `run-eval.mjs` picks it up. Re-using
 * the same bank across runs is what makes runs comparable over time.
 *
 * Each conversation:
 *   { id, persona, cat, expect, turns }
 *   - id      unique, stable (don't renumber existing ones — reports key on it)
 *   - persona "New / Beginner" | "Experienced"  (shapes the question, not the tools)
 *   - cat     short category label shown on the report
 *   - expect  tool names that would be appropriate ([] = pure knowledge). A GUIDE
 *             for raters, not gospel.
 *   - turns   [opener, ...follow-ups]  — follow-ups are threaded with history so
 *             we can review deeper conversations.
 *
 * To grow the bank: append new ids (e.g. N23, E25, or a new prefix for a new
 * persona). Keep opener + follow-ups realistic to that persona.
 */

export const NEW = [
  { id: "N01", cat: "Getting started", expect: [], turns: ["I'm brand new to gardening and feeling a bit overwhelmed. Where do I even start?", "I only have a small balcony that gets afternoon sun — what's easy to grow there?"] },
  { id: "N02", cat: "Daily guidance", expect: ["get_overdue_summary", "list_tasks"], turns: ["What should I be doing in my garden today?"] },
  { id: "N03", cat: "Care knowledge", expect: ["add_plant_to_shed"], turns: ["How often should I water a peace lily?"] },
  { id: "N04", cat: "Diagnosis", expect: [], turns: ["My tomato leaves are turning yellow — what's wrong?", "How do I fix it?"] },
  { id: "N05", cat: "Plant not owned", expect: ["add_plant_to_shed", "create_one_off_task"], turns: ["We have a crab apple tree, when should we harvest the apples?", "Can you add it to my shed and remind me to check them in September?"] },
  { id: "N06", cat: "See a plant", expect: ["show_plant_images"], turns: ["What does a runner bean plant actually look like?"] },
  { id: "N07", cat: "Add plant", expect: ["add_plant_to_shed", "search_plant_database"], turns: ["Can you add basil to my shed?", "Actually make it Thai basil instead."] },
  { id: "N08", cat: "Create task", expect: ["create_one_off_task"], turns: ["Remind me to water my plants this Saturday.", "Actually can you make that every week instead?"] },
  { id: "N09", cat: "Weather", expect: ["get_weather_now"], turns: ["What's the weather looking like for my garden this week?"] },
  { id: "N10", cat: "Seasonal", expect: [], turns: ["Is it too late to plant carrots?"] },
  { id: "N11", cat: "List plants", expect: ["list_plants"], turns: ["What plants do I actually have saved?"] },
  { id: "N12", cat: "Recurring help", expect: ["create_blueprint"], turns: ["I keep forgetting to water things. Can you help me stay on top of it?"] },
  { id: "N13", cat: "Harvest knowledge", expect: [], turns: ["How do I know when my strawberries are ripe?"] },
  { id: "N14", cat: "Recommendation", expect: [], turns: ["What's an easy houseplant that's really hard to kill?"] },
  { id: "N15", cat: "Prune knowledge", expect: ["create_one_off_task"], turns: ["Do I need to prune my lavender? I've never done it before."] },
  { id: "N16", cat: "Feature help", expect: [], turns: ["What is the Watchlist for and should I be using it?"] },
  { id: "N17", cat: "Add ailment", expect: ["add_ailment"], turns: ["Add slugs to my watchlist — they're eating everything."] },
  { id: "N18", cat: "Feeding", expect: ["create_blueprint"], turns: ["What should I feed my tomatoes and how often?"] },
  { id: "N19", cat: "Companions", expect: [], turns: ["I want to grow some herbs together — which ones go well side by side?"] },
  { id: "N20", cat: "Sunlight", expect: [], turns: ["How much sun does a tomato plant actually need?"] },
  { id: "N21", cat: "Holiday cover", expect: [], turns: ["I'm going away for two weeks in summer — what do I do about watering?", "Could the app handle that watering for me automatically?"] },
  { id: "N22", cat: "Myth check", expect: [], turns: ["Are coffee grounds actually good for my plants?"] },
];

export const EXP = [
  { id: "E01", cat: "Triage", expect: ["get_overdue_summary"], turns: ["Give me a full rundown of everything that needs attention across my whole garden right now."] },
  { id: "E02", cat: "Create schedule", expect: ["create_blueprint", "list_areas"], turns: ["Set up a watering schedule for my raised beds every 3 days.", "Can you make it every 2 days over summer?"] },
  // E03 reworded in round 3: it said "South Border", an area the demo home doesn't
  // have, making it unachievable. Now targets Raised Bed A, where the seeded valve
  // + sensor live (comparability with pre-round-3 runs is broken for E03 only).
  { id: "E03", cat: "Automation", expect: ["create_automation", "list_devices"], turns: ["Create an automation that opens the valve on Raised Bed A when soil moisture drops below 30%.", "Also make it only run in the mornings."] },
  { id: "E04", cat: "Run now", expect: ["run_automation", "list_automations", "list_devices"], turns: ["Water Raised Bed A right now."] },
  { id: "E05", cat: "Neglect check", expect: ["get_overdue_summary", "list_plants"], turns: ["Which of my plants haven't been watered in a while?"] },
  { id: "E06", cat: "Bulk reschedule", expect: ["bulk_reschedule"], turns: ["It's been raining all week — push all my watering tasks back by 3 days.", "Actually only the ones in the greenhouse."] },
  { id: "E07", cat: "Bulk complete", expect: ["bulk_complete_tasks"], turns: ["Mark all of this week's tasks in the veg patch as done."] },
  { id: "E08", cat: "Optimise", expect: ["optimise_area_schedule", "list_areas"], turns: ["I think I've got redundant waterings on Raised Bed A — can you optimise its schedule?"] },
  { id: "E09", cat: "Sensor read", expect: ["list_devices"], turns: ["What's my soil moisture reading right now?", "Is that too dry for my tomatoes?"] },
  { id: "E10", cat: "Automation audit", expect: ["list_automations"], turns: ["List my automations and tell me if any of them overlap or conflict."] },
  { id: "E11", cat: "Create plan", expect: ["create_plan", "add_plant_to_plan"], turns: ["I'm planning a three-sisters bed. Can you set up a plan for it?", "Add sweetcorn, climbing beans and squash to that plan."] },
  { id: "E12", cat: "Care ranges", expect: [], turns: ["What's the ideal soil EC and moisture range for tomatoes?"] },
  { id: "E13", cat: "Propagation", expect: ["create_one_off_task"], turns: ["How do I take softwood cuttings from my hydrangea?"] },
  { id: "E14", cat: "Succession", expect: ["create_blueprint"], turns: ["For succession planting of lettuce, how often should I sow — and can you set that up?"] },
  { id: "E15", cat: "Recurring feed", expect: ["create_blueprint"], turns: ["Set a reminder to feed the roses every fortnight from now on."] },
  { id: "E16", cat: "Ailment + link", expect: ["add_ailment", "link_ailment_to_instance"], turns: ["My courgettes have powdery mildew. Add it to the watchlist and link it to them.", "What's the best organic treatment for it?"] },
  { id: "E17", cat: "Shopping list", expect: ["create_shopping_list", "add_to_shopping_list"], turns: ["Create a spring shopping list and add tomato feed and slug pellets to it."] },
  { id: "E18", cat: "Climate prune", expect: ["get_weather_now"], turns: ["When's the best time to prune my apple trees in my climate?"] },
  { id: "E19", cat: "Weather automation", expect: ["create_automation"], turns: ["Set up an automation to notify me whenever a heatwave is forecast."] },
  { id: "E20", cat: "End of life", expect: ["end_of_life_instance", "list_plants"], turns: ["My summer crops are done — archive my finished courgettes."] },
  { id: "E21", cat: "List blueprints", expect: ["list_blueprints"], turns: ["What recurring schedules do I have running and how often does each one fire?"] },
  { id: "E22", cat: "Move schedule", expect: ["update_blueprint", "list_blueprints"], turns: ["I want to move my greenhouse watering schedule to run every 4 days instead of every 2."] },
  { id: "E23", cat: "Nursery", expect: ["add_seed_packet", "log_sowing"], turns: ["Log that I sowed a tray of kale today."] },
  { id: "E24", cat: "Bulk + ambiguous", expect: [], turns: ["Delete everything and start over."] },
];

/** Combined bank with persona attached. Extend by adding to NEW / EXP above. */
export const CONVERSATIONS = [
  ...NEW.map((c) => ({ ...c, persona: "New / Beginner" })),
  ...EXP.map((c) => ({ ...c, persona: "Experienced" })),
];
