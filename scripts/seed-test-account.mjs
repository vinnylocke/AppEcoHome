/**
 * Seed a comprehensive, realistic dataset for a Rhozly TEST account.
 *
 * Strictly scoped to a single test account's own home(s): it find-or-creates the
 * auth user, ensures its homes, then RESETS (deletes) + RESEEDS only data whose
 * home_id belongs to that user. It can never read or write another user's data.
 *
 * Usage:
 *   node scripts/seed-test-account.mjs --email test.rhozly+sprout@rhozly.com \
 *        --password "SomePassword123!" --tier sprout [--prod]
 *
 * Default target is LOCAL (http://127.0.0.1:54321). Pass --prod to target the
 * live project (SUPABASE_PROD_URL + SUPABASE_SERVICE_ROLE_KEY from .env).
 *
 * Local credentials come from env: LOCAL_SUPABASE_URL (optional) +
 * LOCAL_SERVICE_ROLE_KEY (required for local) — get the latter from
 * `supabase status` and export it before running.
 *
 * Safe to re-run: each run wipes the test account's data and rebuilds it.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";
import { randomUUID, createCipheriv, randomBytes } from "crypto";

// ───────────────────────── env + args ─────────────────────────
function loadEnvFile(filename) {
  try {
    const content = readFileSync(resolve(process.cwd(), filename), "utf8");
    for (const line of content.split("\n")) {
      const m = line.match(/^([A-Z_a-z][A-Z_a-z0-9]*)=(.*)$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
      }
    }
  } catch { /* optional */ }
}
loadEnvFile(".env");
loadEnvFile(".env.local");

function arg(name, fallback = undefined) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const FLAG = (name) => process.argv.includes(`--${name}`);

const IS_PROD = FLAG("prod");
const EMAIL = arg("email");
const PASSWORD = arg("password");
const TIER = (arg("tier", "sprout") || "sprout").toLowerCase();

// Matches src/constants/tiers.ts + migration 20260514000001 (the enforced
// lattice): Botanist = species database (enable_perenual), Sage = AI
// (ai_enabled). An earlier version of this table had the two swapped —
// fixed 2026-07-03 alongside the cross-home favourites work.
const TIER_FLAGS = {
  sprout:    { ai_enabled: false, enable_perenual: false },
  botanist:  { ai_enabled: false, enable_perenual: true },
  sage:      { ai_enabled: true,  enable_perenual: false },
  evergreen: { ai_enabled: true,  enable_perenual: true },
};

function die(msg) { console.error(`\n✖  ${msg}\n`); process.exit(1); }

if (!EMAIL) die("Missing --email");
if (!TIER_FLAGS[TIER]) die(`Unknown --tier "${TIER}" (sprout|botanist|sage|evergreen)`);

// ── SAFETY GUARD — only ever operate on dedicated test addresses ──
const SAFE_EMAIL = /^test(\.rhozly\+[a-z0-9._-]+|\d*)@rhozly\.com$/i;
if (!SAFE_EMAIL.test(EMAIL)) {
  die(`Refusing to run: "${EMAIL}" is not a recognised test address ` +
      `(expected test.rhozly+<label>@rhozly.com or testN@rhozly.com).`);
}

const URL = IS_PROD
  ? process.env.SUPABASE_PROD_URL
  : (process.env.LOCAL_SUPABASE_URL || "http://127.0.0.1:54321");
const KEY = IS_PROD
  ? process.env.SUPABASE_SERVICE_ROLE_KEY
  : process.env.LOCAL_SERVICE_ROLE_KEY;

if (!URL) die(IS_PROD ? "SUPABASE_PROD_URL not set in .env" : "LOCAL_SUPABASE_URL not set");
if (!KEY) die(IS_PROD ? "SUPABASE_SERVICE_ROLE_KEY not set in .env" : "LOCAL_SERVICE_ROLE_KEY not set (get it from `supabase status`)");
if (IS_PROD && !PASSWORD) die("--password is required when creating a --prod account");

const sb = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

console.log(`\n🌱  Seeding ${TIER} test account → ${IS_PROD ? "PRODUCTION" : "LOCAL"}`);
console.log(`    ${EMAIL}  (${URL})\n`);

// ───────────────────────── helpers ─────────────────────────
const day = 24 * 60 * 60 * 1000;
function isoDate(offsetDays = 0) {
  return new Date(Date.now() + offsetDays * day).toISOString().slice(0, 10);
}
function isoTs(offsetDays = 0) {
  return new Date(Date.now() + offsetDays * day).toISOString();
}
function pick(arr, n) { return arr.slice(0, n); }

// AES-256-GCM, matching _shared/integrations/encrypt.ts: base64(iv[12] || ciphertext || authTag[16]).
function encryptCreds(obj) {
  const b64 = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!b64) die("INTEGRATION_ENCRYPTION_KEY not set — needed to seed a smart-home integration");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(b64, "base64"), iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(obj), "utf8"), cipher.final()]);
  return Buffer.concat([iv, enc, cipher.getAuthTag()]).toString("base64");
}

async function insert(table, rows) {
  if (!rows.length) return;
  // Chunk to stay well under any payload limits.
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { error } = await sb.from(table).insert(chunk);
    if (error) {
      // Pinpoint the actual offending row by retrying individually.
      let culprit = chunk[0];
      for (const r of chunk) {
        const { error: e } = await sb.from(table).insert(r);
        if (e) { culprit = r; break; }
      }
      die(`insert ${table} failed: ${error.message}\n${JSON.stringify(culprit, null, 2)}`);
    }
  }
  console.log(`    + ${rows.length.toString().padStart(3)} ${table}`);
}

async function delEq(table, homeId) {
  const { error } = await sb.from(table).delete().eq("home_id", homeId);
  if (error && !/does not exist|column .* does not exist/i.test(error.message)) {
    die(`reset ${table} failed: ${error.message}`);
  }
}

// ───────────────────────── plant catalogue (manual) ─────────────────────────
// edible flag drives whether yields/harvest tasks make sense.
const PLANTS = [
  ["Tomato","Solanum lycopersicum","Average","Medium","Annual",["Full sun"],"Versatile fruiting plant for beds and containers.",true],
  ["Basil","Ocimum basilicum","Frequent","Low","Annual",["Full sun","Partial shade"],"Fragrant culinary herb that loves warmth.",true],
  ["Lavender","Lavandula angustifolia","Minimum","Low","Perennial",["Full sun"],"Drought-tolerant fragrant shrub for borders.",false],
  ["Rose","Rosa rugosa","Average","Medium","Perennial",["Full sun"],"Classic flowering shrub needing seasonal pruning.",false],
  ["Carrot","Daucus carota","Average","Low","Annual",["Full sun"],"Root crop; sow direct in loose stone-free soil.",true],
  ["Lettuce","Lactuca sativa","Frequent","Low","Annual",["Full sun","Partial shade"],"Fast salad leaf; succession-sow for a steady supply.",true],
  ["Strawberry","Fragaria × ananassa","Average","Low","Perennial",["Full sun"],"Runners spread readily; net against birds.",true],
  ["Courgette","Cucurbita pepo","Frequent","Low","Annual",["Full sun"],"Prolific summer squash — pick young and often.",true],
  ["Apple","Malus domestica","Average","Medium","Perennial",["Full sun"],"Fruit tree; prune in winter for shape and airflow.",true],
  ["Mint","Mentha spicata","Average","Low","Perennial",["Full sun","Partial shade"],"Vigorous spreading herb — keep contained in a pot.",true],
  ["Sunflower","Helianthus annuus","Average","Low","Annual",["Full sun"],"Tall cheerful annual; great for pollinators.",false],
  ["Sage","Salvia officinalis","Minimum","Low","Perennial",["Full sun"],"Hardy Mediterranean herb; trim after flowering.",true],
  ["Chilli","Capsicum annuum","Average","Medium","Annual",["Full sun"],"Heat-loving fruiting plant; best under cover.",true],
  ["Blueberry","Vaccinium corymbosum","Frequent","Medium","Perennial",["Full sun","Partial shade"],"Acid-loving shrub; grow in ericaceous compost.",true],
  ["Hosta","Hosta sieboldiana","Average","Low","Perennial",["Partial shade","Shade"],"Shade foliage plant; watch for slug damage.",false],
  ["Boston Fern","Nephrolepis exaltata","Frequent","Low","Perennial",["Partial shade","Shade"],"Indoor fern preferring indirect light and humidity.",false],
  ["Marigold","Tagetes patula","Average","Low","Annual",["Full sun"],"Companion plant that deters many pests.",false],
  ["Garlic","Allium sativum","Minimum","Low","Annual",["Full sun"],"Plant cloves in autumn; harvest the next summer.",true],
  ["Pepper","Capsicum annuum","Average","Medium","Annual",["Full sun"],"Sweet fruiting plant; thrives in a greenhouse.",true],
  ["Cucumber","Cucumis sativus","Frequent","Medium","Annual",["Full sun"],"Climbing fruiter; needs warmth and steady water.",true],
  ["Rosemary","Salvia rosmarinus","Minimum","Low","Perennial",["Full sun"],"Evergreen woody herb; excellent drainage essential.",true],
  ["Thyme","Thymus vulgaris","Minimum","Low","Perennial",["Full sun"],"Low mat-forming herb for sunny edges and pots.",true],
  ["Dahlia","Dahlia pinnata","Average","Medium","Perennial",["Full sun"],"Showy tuberous flower; lift tubers in cold areas.",false],
  ["Pumpkin","Cucurbita maxima","Frequent","Medium","Annual",["Full sun"],"Sprawling vine needing rich soil and space.",true],
  ["Spinach","Spinacia oleracea","Frequent","Low","Annual",["Full sun","Partial shade"],"Cool-season leaf; bolts in summer heat.",true],
  ["Geranium","Pelargonium hortorum","Average","Low","Perennial",["Full sun"],"Reliable container bedding with long flowering.",false],
  ["Raspberry","Rubus idaeus","Average","Medium","Perennial",["Full sun","Partial shade"],"Cane fruit; tie in and prune by type (summer/autumn).",true],
  ["Parsley","Petroselinum crispum","Frequent","Low","Biennial",["Full sun","Partial shade"],"Staple culinary herb; slow to germinate.",true],
];

// Reusable ailment step blocks (mirrors the seed structure).
const APHID = {
  symptoms: ["Sticky honeydew on leaves","Curled or distorted new growth","Clusters of insects on stems","Yellowing leaves"],
  affected: ["Rose","Tomato","Pepper"],
  prevention: [
    { id: randomUUID(), step_order: 1, title: "Encourage predators", description: "Attract ladybirds and lacewings.", task_type: "inspect", frequency_type: "weekly" },
    { id: randomUUID(), step_order: 2, title: "Companion planting", description: "Use marigolds to deter aphids.", task_type: "other", frequency_type: "once" },
  ],
  remedy: [
    { id: randomUUID(), step_order: 1, title: "Blast with water", description: "Dislodge colonies with a water jet.", task_type: "water", frequency_type: "daily" },
    { id: randomUUID(), step_order: 2, title: "Insecticidal soap", description: "Spray soap or neem on affected areas.", task_type: "spray", frequency_type: "every_n_days", frequency_every_n_days: 3 },
  ],
};
const AILMENT_POOL = [
  ["Aphid","Aphidoidea","pest", APHID.symptoms, APHID.affected, APHID.prevention, APHID.remedy],
  ["Slugs & Snails","Gastropoda","pest",
    ["Irregular holes in leaves","Slime trails","Seedlings grazed to the ground"],
    ["Lettuce","Hosta","Strawberry","Courgette"],
    [{ id: randomUUID(), step_order: 1, title: "Clear hiding spots", description: "Remove debris and damp cover near plants.", task_type: "other", frequency_type: "weekly" }],
    [{ id: randomUUID(), step_order: 1, title: "Evening patrol", description: "Hand-pick after dark or after rain.", task_type: "inspect", frequency_type: "daily" }]],
  ["Powdery Mildew","Erysiphales","disease",
    ["White powdery coating on leaves","Distorted growth","Premature leaf drop"],
    ["Courgette","Cucumber","Rose","Apple"],
    [{ id: randomUUID(), step_order: 1, title: "Improve airflow", description: "Space plants and prune for circulation.", task_type: "prune", frequency_type: "weekly" }],
    [{ id: randomUUID(), step_order: 1, title: "Remove affected leaves", description: "Pick off and bin infected leaves.", task_type: "remove", frequency_type: "daily" }]],
  ["Early Blight","Alternaria solani","disease",
    ["Dark target-like spots on lower leaves","Yellow halos","Defoliation from the base up"],
    ["Tomato","Potato","Pepper"],
    [{ id: randomUUID(), step_order: 1, title: "Water at the base", description: "Keep foliage dry to slow spread.", task_type: "water", frequency_type: "daily" }],
    [{ id: randomUUID(), step_order: 1, title: "Copper fungicide", description: "Apply every 7–10 days in wet spells.", task_type: "spray", frequency_type: "every_n_days", frequency_every_n_days: 7 }]],
  ["Vine Weevil","Otiorhynchus sulcatus","pest",
    ["Notched leaf margins","Sudden wilting of container plants","Grubs in the rootball"],
    ["Strawberry","Geranium","Hosta"],
    [{ id: randomUUID(), step_order: 1, title: "Check rootballs", description: "Inspect pots when repotting.", task_type: "inspect", frequency_type: "monthly" }],
    [{ id: randomUUID(), step_order: 1, title: "Nematode drench", description: "Apply biological nematodes in late summer.", task_type: "other", frequency_type: "yearly" }]],
  ["Bindweed","Convolvulus arvensis","invasive_plant",
    ["Twining white-flowered climber","Smothers nearby plants","Regrows from root fragments"],
    ["Any surrounding vegetation"],
    [{ id: randomUUID(), step_order: 1, title: "Do not rotavate", description: "Cutting roots only multiplies the plant.", task_type: "other", frequency_type: "once" }],
    [{ id: randomUUID(), step_order: 1, title: "Persistent removal", description: "Trace and dig out roots repeatedly.", task_type: "remove", frequency_type: "weekly" }]],
];

const tipTap = (text) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });

// ───────────────────────── auth user + homes ─────────────────────────
async function findOrCreateUser() {
  const created = await sb.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD || randomUUID(),
    email_confirm: true,
  });
  if (created.data?.user) {
    console.log(`👤  Created auth user ${created.data.user.id}`);
    return created.data.user.id;
  }
  // Already exists → find uid via the profile (created by the handle_new_user trigger).
  const { data: prof } = await sb.from("user_profiles").select("uid").eq("email", EMAIL).maybeSingle();
  if (!prof?.uid) die(`createUser failed (${created.error?.message}) and no profile found for ${EMAIL}`);
  if (PASSWORD) await sb.auth.admin.updateUserById(prof.uid, { password: PASSWORD });
  console.log(`👤  Reusing existing auth user ${prof.uid}`);
  return prof.uid;
}

const HOME_DEFS = [
  { name: "Maple Cottage Garden", lat: 51.5072, lng: -0.1276, address: "12 Maple Lane, London" },
  { name: "Hillside Allotment",   lat: 51.4545, lng: -2.5879, address: "Plot 14, Bristol" },
  { name: "Town Flat",            lat: 53.4808, lng: -2.2426, address: "Apt 3, Manchester" },
];

async function ensureHome(uid, def) {
  // Find a home this user already owns with this name.
  const { data: mems } = await sb.from("home_members").select("home_id").eq("user_id", uid);
  const ownedIds = (mems || []).map((m) => m.home_id);
  if (ownedIds.length) {
    const { data: existing } = await sb.from("homes").select("id,name").in("id", ownedIds).eq("name", def.name);
    if (existing && existing.length) return existing[0].id;
  }
  const id = randomUUID();
  let { error } = await sb.from("homes").insert({ id, name: def.name, lat: def.lat, lng: def.lng, address: def.address });
  if (error) {
    // address column may not exist on older schemas — retry without it.
    ({ error } = await sb.from("homes").insert({ id, name: def.name, lat: def.lat, lng: def.lng }));
    if (error) die(`create home failed: ${error.message}`);
  }
  const { error: mErr } = await sb.from("home_members").insert({ home_id: id, user_id: uid, role: "owner" });
  if (mErr) die(`home_members insert failed: ${mErr.message}`);
  console.log(`🏡  Created home "${def.name}" ${id}`);
  return id;
}

async function nextPlantIdBase() {
  const { data } = await sb.from("plants").select("id").order("id", { ascending: false }).limit(1);
  const max = data?.[0]?.id ?? 1000000;
  return Math.max(max, 1000000) + 1;
}

// ───────────────────────── reset one home ─────────────────────────
async function resetHome(homeId) {
  const idsOf = async (table, col, val) => {
    const { data } = await sb.from(table).select("id").eq(col, val);
    return (data ?? []).map((r) => r.id);
  };
  // ── junction / child deletes (id-subquery), ordered so nothing is orphaned ──
  const noteIds = await idsOf("notes", "home_id", homeId);
  if (noteIds.length) await sb.from("note_links").delete().in("note_id", noteIds);
  const zoneIds = await idsOf("garden_zones", "home_id", homeId);
  if (zoneIds.length) await sb.from("garden_zone_shapes").delete().in("zone_id", zoneIds);
  const walkIds = await idsOf("garden_walk_sessions", "home_id", homeId);
  if (walkIds.length) await sb.from("garden_walk_visits").delete().in("session_id", walkIds);
  const autoIds = await idsOf("automations", "home_id", homeId);
  if (autoIds.length) await sb.from("automation_actions").delete().in("automation_id", autoIds);
  await delEq("garden_shape_notes", homeId); // before garden_shapes
  await delEq("garden_zones", homeId);        // before garden_layouts
  const layoutIds = await idsOf("garden_layouts", "home_id", homeId);
  if (layoutIds.length) await sb.from("garden_shapes").delete().in("layout_id", layoutIds);
  const locIds = await idsOf("locations", "home_id", homeId);

  // ── home_id-scoped deletes, FK-safe order ──
  for (const t of [
    "plant_instance_ailments", "yield_records", "plant_journals", "pruning_records",
    "garden_walk_sessions", "seed_sowings", "seed_packets", "notes", "garden_layouts",
    "shopping_list_items", "shopping_lists",
    "device_readings", "area_lux_readings", "area_moisture_readings",
    "area_temp_readings", "area_ec_readings", "automations", "devices", "integrations",
    "todo_lists", "home_quiz_completions", "planner_preferences",
    "tasks", "task_blueprints", "ailments", "plans", "inventory_items", "plants",
  ]) await delEq(t, homeId);
  if (locIds.length) await sb.from("areas").delete().in("location_id", locIds);
  await delEq("locations", homeId);
}

// ───────────────────────── seed one home ─────────────────────────
// Map a real `ailment_library` row into an `ailments` insert payload — mirrors
// the app's mapLibraryToWatchlistPayload (source='library', the first-class
// value added in 20260824000000). Used so the Watchlist shows genuine library
// ailments (Blossom End Rot, Spider Mites, …), not fabricated ones.
function mapAilmentLibraryRow(a, homeId) {
  const sev = a.severity === "critical" || a.severity === "high" ? "severe" : a.severity === "low" ? "mild" : "moderate";
  const type = a.kind === "pest" ? "pest" : a.kind === "invasive" ? "invasive_plant" : "disease";
  return {
    id: randomUUID(), home_id: homeId, name: a.name,
    scientific_name: a.scientific_name ?? null, type, source: "library",
    description: a.description ?? "",
    symptoms: (a.symptoms ?? []).map((s) => ({ id: randomUUID(), title: s, description: "", severity: sev, location: "" })),
    affected_plants: a.affected_plant_types ?? [],
    prevention_steps: a.prevention ? [{ id: randomUUID(), step_order: 0, title: "Prevention", description: a.prevention, task_type: "inspect", frequency_type: "once" }] : [],
    remedy_steps: a.treatment ? [{ id: randomUUID(), step_order: 0, title: "Treatment", description: a.treatment, task_type: "other", frequency_type: "once" }] : [],
    is_archived: false,
  };
}

// A library plant in a user's shed is a HOME-PRIVATE `plants` row (so it loads —
// the shed filters plants by home_id) with source='ai' + `forked_from_plant_id`
// pointing at the global catalogue/library row (the shallow-fork pattern in
// PlantSearchModal). We fork from existing global catalogue rows where present,
// else fall back to a built-in list (e.g. on a fresh local DB).
const LIBRARY_FALLBACK = [
  ["Potato", "Solanum tuberosum"], ["Spinach", "Spinacia oleracea"], ["Kale", "Brassica oleracea"],
  ["Foxglove", "Digitalis purpurea"], ["Geranium", "Pelargonium hortorum"], ["Fuchsia", "Fuchsia magellanica"],
  ["Dahlia", "Dahlia pinnata"], ["Petunia", "Petunia × atkinsiana"],
];
async function seedLibraryShed(homeId, areas, locations, allocId) {
  const { data: glob } = await sb.from("plants")
    .select("id, common_name, scientific_name, watering, care_level, cycle, sunlight, description")
    .is("home_id", null).eq("source", "ai").limit(10);
  const src = (glob && glob.length)
    ? glob.slice(0, 8).map((g) => ({ fork: g.id, name: g.common_name, sci: g.scientific_name, watering: g.watering, care: g.care_level, cycle: g.cycle, sun: g.sunlight, desc: g.description }))
    : LIBRARY_FALLBACK.map(([name, sci]) => ({ fork: null, name, sci: [sci], watering: "Average", care: "Low", cycle: "Perennial", sun: ["Full sun"], desc: `${name} added from the plant library.` }));
  const STAGES = ["Vegetative", "Flowering/Bloom", "Fruiting/Pollination", "Senescence", "Seedling", "Ripening/Maturity", "Budding/Pre-Flowering"];
  const libPlants = [], libInv = [];
  src.forEach((s, i) => {
    const pid = allocId();
    libPlants.push({
      id: pid, home_id: homeId, common_name: s.name,
      scientific_name: Array.isArray(s.sci) ? s.sci : [s.sci],
      source: "ai", forked_from_plant_id: s.fork, is_archived: false,
      watering: s.watering, care_level: s.care, cycle: s.cycle, sunlight: s.sun, description: s.desc,
    });
    const planted = i % 3 !== 0;
    const loc = locations[i % locations.length];
    const area = areas[i % areas.length];
    const row = {
      id: randomUUID(), home_id: homeId, plant_id: pid, plant_name: s.name,
      status: planted ? "Planted" : "Unplanted", identifier: `LIB-${(i + 1).toString().padStart(3, "0")}`,
    };
    if (planted) Object.assign(row, {
      location_id: loc.id, location_name: loc.name, area_id: area.id, area_name: area.name,
      growth_state: STAGES[i % STAGES.length],
    });
    libInv.push(row);
  });
  await insert("plants", libPlants);
  await insert("inventory_items", libInv);
}

async function seedHome(homeId, uid, homeIndex, allocId) {
  const outdoors = homeIndex < 2; // 3rd home (flat) is indoor-led
  console.log(`\n🏡  Seeding home #${homeIndex + 1} ${homeId}`);

  // — Locations + areas —
  const locations = [];
  const areas = [];
  const locDefs = outdoors
    ? [["Back Garden", "Outside", true], ["Front Garden", "Outside", true], ["Greenhouse", "Outside", true]]
    : [["Balcony", "Outside", true], ["Living Room", "Inside", false], ["Kitchen", "Inside", false]];
  const areaDefs = outdoors
    ? [
        ["Raised Bed A", "Loam", 6.5, 42000, true], ["Raised Bed B", "Loam", 6.6, 41000, true],
        ["South Border", "Clay", 6.8, 35000, true], ["Veg Patch", "Loam", 6.4, 45000, true],
        ["Herb Spiral", "Sandy", 7.0, 38000, true], ["Greenhouse Bench", "Potting Mix", 5.9, 22000, true],
      ]
    : [
        ["Balcony Planters", "Potting Mix", 6.2, 18000, true], ["Windowsill", "Potting Mix", 6.0, 3000, false],
        ["Living Room Shelf", "Potting Mix", 6.1, 1800, false], ["Kitchen Counter", "Potting Mix", 6.0, 2200, false],
      ];
  locDefs.forEach(([name, placement, isOut], li) => {
    const lid = randomUUID();
    locations.push({ id: lid, home_id: homeId, name, placement, is_outside: isOut });
    // Spread areas across locations round-robin.
    areaDefs.filter((_, ai) => ai % locDefs.length === li).forEach(([an, medium, ph, lux]) => {
      areas.push({ id: randomUUID(), location_id: lid, name: an, growing_medium: medium, medium_ph: ph, light_intensity_lux: lux });
    });
  });
  await insert("locations", locations);
  await insert("areas", areas);

  // — Manually-created plants (home-private, source='manual'). Library plants are
  //   added separately (they're shared global-catalogue rows, see seedLibraryShed).
  const offset = homeIndex * 9;
  const chosen = PLANTS.slice(offset, offset + 16).concat(PLANTS.slice(0, Math.max(0, 16 - (PLANTS.length - offset))));
  const uniq = [...new Map(chosen.map((p) => [p[0], p])).values()].slice(0, 15);
  const plants = [];
  const plantIdByName = {};
  uniq.forEach(([name, sci, watering, care, cycle, sun, desc], i) => {
    const id = allocId();
    plantIdByName[name] = id;
    plants.push({
      id, home_id: homeId, common_name: name, scientific_name: [sci], source: "manual",
      is_archived: i === uniq.length - 1, // archive the last one
      watering, care_level: care, cycle, description: desc, sunlight: sun,
    });
  });
  await insert("plants", plants);
  const edibleByName = Object.fromEntries(PLANTS.map((p) => [p[0], p[7]]));

  // — Inventory items (shed + planted) —
  // growth_state spread so every stage section is populated. Main planted rows
  // cycle all 8 stages; the "established" duplicate instances skew to the mature
  // end (incl. Senescence) so end-of-life plants are well represented.
  const GROWTH_STAGES = ["Germination", "Seedling", "Vegetative", "Budding/Pre-Flowering", "Flowering/Bloom", "Fruiting/Pollination", "Ripening/Maturity", "Senescence"];
  const MATURE_STAGES = ["Senescence", "Ripening/Maturity", "Senescence", "Fruiting/Pollination"];
  let stageIdx = 0;
  const nextStage = () => GROWTH_STAGES[stageIdx++ % GROWTH_STAGES.length];
  const inventory = [];
  const plantedInstances = []; // {id, name}
  uniq.forEach(([name], i) => {
    const planted = i % 3 !== 0;     // ~2/3 planted, ~1/3 in shed
    const archived = i === uniq.length - 1;
    const loc = locations[i % locations.length];
    const area = areas[i % areas.length];
    const id = randomUUID();
    const row = {
      id, home_id: homeId, plant_id: plantIdByName[name], plant_name: name,
      status: archived ? "Archived" : planted ? "Planted" : "Unplanted",
      identifier: `${name.slice(0, 3).toUpperCase()}-${(i + 1).toString().padStart(3, "0")}`,
    };
    if (planted && !archived) {
      Object.assign(row, {
        location_id: loc.id, location_name: loc.name, area_id: area.id, area_name: area.name,
        growth_state: nextStage(),
      });
      plantedInstances.push({ id, name });
    }
    inventory.push(row);
    // A couple of plants get a second instance for volume.
    if (i < 4) {
      const id2 = randomUUID();
      inventory.push({
        id: id2, home_id: homeId, plant_id: plantIdByName[name], plant_name: name, status: "Planted",
        location_id: loc.id, location_name: loc.name, area_id: area.id, area_name: area.name,
        identifier: `${name.slice(0, 3).toUpperCase()}-${(i + 1).toString().padStart(3, "0")}B`,
        growth_state: MATURE_STAGES[i],
      });
      plantedInstances.push({ id: id2, name });
    }
  });
  await insert("inventory_items", inventory);
  await seedLibraryShed(homeId, areas, locations, allocId); // manual + library mix in the shed

  // — Task blueprints (routines) —
  const blueprints = [];
  const bp = (title, type, freq, startOffset, scope, areaId, priority, endOffset) => {
    const row = {
      id: randomUUID(), home_id: homeId, title, task_type: type, frequency_days: freq,
      start_date: isoDate(startOffset), end_date: endOffset != null ? isoDate(endOffset) : null,
      is_recurring: true, priority, location_id: locations[0].id, area_id: areaId || null,
      blueprint_type: type === "Pest Control" ? "ailment" : "plant", scope, created_by: uid,
    };
    blueprints.push(row);
  };
  bp("Weekly Watering Round", "Watering", 7, -30, "home", null, "Medium");
  bp("Daily Greenhouse Check", "Maintenance", 1, -10, "home", null, "Low");
  bp("Feed Tomatoes & Fruit", "Fertilizing", 14, -20, "home", null, "Medium");
  bp("Inspect for Pests", "Inspection", 7, -25, "home", null, "High");
  bp("Monthly Pruning", "Pruning", 30, -45, "home", areas[0].id, "Medium", 200);
  bp("Mow & Edge", "Maintenance", 14, -28, "home", null, "Low");
  if (areas[1]) bp("Bed Weeding", "Maintenance", 10, -18, "home", areas[1].id, "Low");
  bp("Aphid Watch", "Pest Control", 14, -12, "home", null, "High");
  await insert("task_blueprints", blueprints);

  // — Tasks (standalone, varied status/dates) —
  const tasks = [];
  const someInv = plantedInstances.slice(0, 6);
  const mkTask = (title, type, status, dueOffset, opts = {}) => {
    const row = {
      id: randomUUID(), home_id: homeId, title, type, status, due_date: isoDate(dueOffset),
      location_id: locations[0].id, inventory_item_ids: opts.inv ? [opts.inv] : [],
      scope: "home", created_by: uid,
    };
    if (opts.area) row.area_id = opts.area;
    if (status === "Completed") row.completed_at = isoTs(dueOffset);
    if (opts.windowEnd != null) row.window_end_date = isoDate(opts.windowEnd);
    tasks.push(row);
  };
  // Past (completed / skipped)
  for (let k = 0; k < 8; k++) mkTask(`Watered the beds (week ${k + 1})`, "Watering", "Completed", -7 * (k + 1), { inv: someInv[k % someInv.length]?.id });
  for (let k = 0; k < 4; k++) mkTask(`Fed the fruit (round ${k + 1})`, "Fertilizing", "Completed", -14 * (k + 1));
  mkTask("Pruned the roses", "Pruning", "Completed", -9, { area: areas[0].id });
  mkTask("Skipped feeding (rain)", "Fertilizing", "Skipped", -2);
  mkTask("Missed inspection", "Inspection", "Skipped", -5);
  // Due now / overdue
  mkTask("Water the greenhouse", "Watering", "Pending", 0, { inv: someInv[0]?.id });
  mkTask("Check seedlings", "Inspection", "Pending", 0);
  mkTask("Overdue: clear weeds", "Maintenance", "Pending", -6);
  mkTask("Deadhead the dahlias", "Pruning", "Pending", 0, { area: areas[0].id });
  mkTask("Aphid treatment", "Pest Control", "Pending", 0);
  // Upcoming
  mkTask("Sow more salad", "Planting", "Pending", 2, { area: areas[Math.min(1, areas.length - 1)].id });
  mkTask("Feed containers", "Fertilizing", "Pending", 3);
  mkTask("Tie in the climbers", "Maintenance", "Pending", 4);
  mkTask("Harvest tomatoes", "Harvesting", "Pending", 0, { inv: someInv[1]?.id, area: areas[0].id, windowEnd: 7 });
  mkTask("Harvest courgettes", "Harvesting", "Pending", 1, { inv: someInv[2]?.id, windowEnd: 6 });
  await insert("tasks", tasks);

  // — Ailments (watchlist) — a MIX of MANUAL (hand-added pool) + LIBRARY entries
  //   pulled from the REAL seeded `ailment_library` (source='library').
  const ailments = [];
  AILMENT_POOL.slice(0, 4).forEach(([name, sci, type, symptoms, affected, prevention, remedy]) => {
    ailments.push({
      id: randomUUID(), home_id: homeId, name, scientific_name: sci, type, source: "manual",
      description: `${name} — a common garden ${type === "invasive_plant" ? "invasive" : type}.`,
      symptoms, affected_plants: affected, prevention_steps: prevention, remedy_steps: remedy, is_archived: false,
    });
  });
  const { data: libAil } = await sb.from("ailment_library")
    .select("name, kind, severity, scientific_name, description, affected_plant_types, symptoms, treatment, prevention")
    .order("name").limit(30);
  (libAil ?? []).slice(homeIndex * 5, homeIndex * 5 + 5).forEach((a) => ailments.push(mapAilmentLibraryRow(a, homeId)));
  await insert("ailments", ailments);

  // Link 3 ailments to matching planted instances where possible.
  const links = [];
  ailments.slice(0, 3).forEach((ail) => {
    const match = plantedInstances.find((p) => ail.affected_plants.includes(p.name)) || plantedInstances[0];
    if (match) links.push({
      plant_instance_id: match.id, ailment_id: ail.id, home_id: homeId,
      linked_by: uid, status: "active",
    });
  });
  // dedupe by (instance, ailment)
  const seen = new Set();
  const linksUniq = links.filter((l) => { const k = `${l.plant_instance_id}|${l.ailment_id}`; if (seen.has(k)) return false; seen.add(k); return true; });
  await insert("plant_instance_ailments", linksUniq);

  // — Notes + note_links —
  const notes = [];
  const noteLinks = [];
  const mkNote = (title, text, pinned, link) => {
    const id = randomUUID();
    notes.push({ id, home_id: homeId, user_id: uid, title, content: tipTap(text), body_text: text, pinned });
    if (link) noteLinks.push({ note_id: id, target_type: link.type, target_id: String(link.id) });
  };
  mkNote("Soil prep notes", "Added a barrow of compost to the raised beds this spring. pH looking good around 6.5.", true, { type: "area", id: areas[0].id });
  mkNote("Variety wishlist", "Try 'Sungold' tomatoes and 'Cobra' climbing beans next year.", true, null);
  mkNote("Pest log", "First aphids spotted on the roses — keeping an eye on it.", false, ailments[0] ? { type: "ailment", id: ailments[0].id } : null);
  mkNote("Watering reminder", "Greenhouse dries out fast in the afternoon sun — check twice on hot days.", false, plantedInstances[0] ? { type: "plant_instance", id: plantedInstances[0].id } : null);
  mkNote("Harvest tally", "Picked the first courgettes today — glut incoming!", false, null);
  if (homeIndex === 0) mkNote("Layout ideas", "Thinking of widening the south border by half a metre.", false, null);
  await insert("notes", notes);
  await insert("note_links", noteLinks);

  // — Plant journals (instance-anchored) —
  const journals = [];
  const jSubjects = [
    ["Germination", "Seeds up after 8 days on the windowsill."],
    ["Potted on", "Moved into 9cm pots; roots filling out nicely."],
    ["First flowers", "Flowering started — pollinators are visiting."],
    ["Problem spotted", "A few yellow lower leaves; watering adjusted."],
    ["Strong growth", "Putting on real height this week."],
    ["First harvest", "Picked the first of the crop today."],
  ];
  plantedInstances.slice(0, 8).forEach((inst, i) => {
    const [subject, desc] = jSubjects[i % jSubjects.length];
    journals.push({
      id: randomUUID(), home_id: homeId, inventory_item_id: inst.id,
      subject: `${inst.name}: ${subject}`, description: desc, created_at: isoTs(-3 * (i + 1)),
    });
  });
  await insert("plant_journals", journals);

  // — Yield records (edible planted instances) —
  const yields = [];
  plantedInstances.filter((p) => edibleByName[p.name]).slice(0, 6).forEach((inst, i) => {
    yields.push({
      id: randomUUID(), home_id: homeId, instance_id: inst.id,
      value: Number((0.3 + i * 0.4).toFixed(2)), unit: i % 3 === 0 ? "count" : "kg",
      notes: `First pick of ${inst.name}.`, harvested_at: isoTs(-2 * (i + 1)),
    });
  });
  await insert("yield_records", yields);

  // — Senescence (End-of-Life) instances — the Senescence tab lists inventory
  //   with `ended_at` set (status Archived + was_natural_end + end_summary),
  //   per LifecycleCompleteModal. (growth_state is a separate live-plant stage.)
  const eolInv = [], eolJournals = [];
  uniq.slice(0, 4).forEach(([name], i) => {
    const id = randomUUID();
    const natural = i % 2 === 0;
    const endedAt = isoTs(-7 - i * 6);
    eolInv.push({
      id, home_id: homeId, plant_id: plantIdByName[name], plant_name: name,
      status: "Archived", identifier: `${name.slice(0, 3).toUpperCase()}-EOL${i + 1}`,
      planted_at: isoTs(-150 - i * 12), ended_at: endedAt, was_natural_end: natural,
      end_summary: natural
        ? `${name} finished its season naturally — a good run this year.`
        : `Lost the ${name.toLowerCase()} to disease; cleared the bed early.`,
    });
    eolJournals.push({
      id: randomUUID(), home_id: homeId, inventory_item_id: id,
      subject: natural ? "Lifecycle complete (natural)" : "Lifecycle complete",
      description: natural ? "Reached the end of its natural life." : "Removed before its time.",
      created_at: endedAt,
    });
  });
  await insert("inventory_items", eolInv);
  await insert("plant_journals", eolJournals);

  // — Garden layout + shapes —
  const layoutId = randomUUID();
  await insert("garden_layouts", [{ id: layoutId, home_id: homeId, name: `${HOME_DEFS[homeIndex].name} Plan`, canvas_w_m: 24, canvas_h_m: 16 }]);
  const shapes = [];
  const colors = ["#4ade80", "#60a5fa", "#f59e0b", "#a78bfa", "#34d399"];
  areas.slice(0, 6).forEach((a, i) => {
    shapes.push({
      id: randomUUID(), layout_id: layoutId, area_id: a.id, shape_type: "rectangle",
      label: a.name, color: colors[i % colors.length],
      x_m: 1 + (i % 3) * 7, y_m: 1 + Math.floor(i / 3) * 6, width_m: 5, height_m: 4, z_index: i,
    });
  });
  // a path + a lawn for flavour
  shapes.push({ id: randomUUID(), layout_id: layoutId, shape_type: "rectangle", label: "Path", color: "#d6d3d1", x_m: 0, y_m: 7, width_m: 24, height_m: 1.2, z_index: 10 });
  shapes.push({ id: randomUUID(), layout_id: layoutId, shape_type: "circle", label: "Lawn", color: "#86efac", x_m: 17, y_m: 10, radius_m: 3, z_index: 0 });
  await insert("garden_shapes", shapes);

  // — Shopping lists —
  const listActive = randomUUID();
  const listDone = randomUUID();
  await insert("shopping_lists", [
    { id: listActive, home_id: homeId, name: "Spring shopping", status: "active" },
    { id: listDone, home_id: homeId, name: "Last weekend", status: "completed" },
  ]);
  await insert("shopping_list_items", [
    { id: randomUUID(), list_id: listActive, home_id: homeId, item_type: "plant", name: "Tomato 'Sungold'", source: "shed", is_checked: false },
    { id: randomUUID(), list_id: listActive, home_id: homeId, item_type: "plant", name: "Climbing bean 'Cobra'", source: "shed", is_checked: false },
    { id: randomUUID(), list_id: listActive, home_id: homeId, item_type: "product", name: "Multipurpose compost (40L)", category: "Soil", is_checked: false },
    { id: randomUUID(), list_id: listActive, home_id: homeId, item_type: "product", name: "Tomato feed", category: "Fertilizer", is_checked: false },
    { id: randomUUID(), list_id: listActive, home_id: homeId, item_type: "product", name: "Slug traps", category: "Pest Control", is_checked: false },
    { id: randomUUID(), list_id: listDone, home_id: homeId, item_type: "product", name: "Bamboo canes", category: "Tools", is_checked: true },
    { id: randomUUID(), list_id: listDone, home_id: homeId, item_type: "product", name: "Garden twine", category: "Tools", is_checked: true },
  ]);

  // ── Nursery: seed packets + sowing batches ──
  const packets = [];
  const sowings = [];
  uniq.slice(0, 5).forEach(([name], i) => {
    const pid = randomUUID();
    packets.push({
      id: pid, home_id: homeId, plant_id: plantIdByName[name],
      variety: `${name} 'Heritage'`, vendor: i % 2 ? "Mr Fothergill's" : "Thompson & Morgan",
      purchased_on: isoDate(-60 - i * 5), sow_by: isoDate(120 - i * 10),
      quantity_remaining: `${20 - i * 3} seeds`, notes: `${name} seeds saved for this season.`,
      is_archived: false,
    });
    if (i < 3) {
      const sown = 8 + i * 2;
      sowings.push({
        id: randomUUID(), home_id: homeId, seed_packet_id: pid,
        sown_on: isoDate(-30 - i * 3), sown_count: sown,
        observed_on: isoDate(-20 - i * 3), germinated_count: Math.max(1, sown - 1 - i),
        status: i === 0 ? "planted_out" : "germinated",
        planted_out_at: i === 0 ? isoDate(-10) : null,
        notes: i === 0 ? "Planted out into the bed." : "Good germination on the windowsill.",
      });
    }
  });
  await insert("seed_packets", packets);
  await insert("seed_sowings", sowings);

  // ── To-do lists ──
  await insert("todo_lists", [
    { id: randomUUID(), home_id: homeId, name: "This weekend", due_date: isoDate(3), created_by: uid },
    { id: randomUUID(), home_id: homeId, name: "Before the frost", due_date: isoDate(45), created_by: uid },
  ]);

  // ── Pruning records ──
  await insert("pruning_records", plantedInstances.slice(0, 3).map((inst, i) => ({
    id: randomUUID(), home_id: homeId, instance_id: inst.id,
    pruned_at: isoTs(-5 * (i + 1)), notes: `Pruned ${inst.name} — removed spent growth.`,
  })));

  // ── Garden zones + per-shape notes (over the layout) ──
  const bedShapes = shapes.filter((s) => s.area_id);
  const zoneA = randomUUID(), zoneB = randomUUID();
  await insert("garden_zones", [
    { id: zoneA, layout_id: layoutId, home_id: homeId, name: "Watering Zone A", colour: "#3b82f6" },
    { id: zoneB, layout_id: layoutId, home_id: homeId, name: "Sunny Border", colour: "#f59e0b" },
  ]);
  await insert("garden_zone_shapes", bedShapes.slice(0, 4).map((s, i) => ({ zone_id: i % 2 ? zoneB : zoneA, shape_id: s.id })));
  await insert("garden_shape_notes", bedShapes.slice(0, 3).map((s, i) => ({
    id: randomUUID(), shape_id: s.id, home_id: homeId, created_by: uid,
    body: ["Gets full sun most of the day.", "Heavy clay — improved with compost.", "Slug hotspot — check after rain."][i],
  })));

  // ── Habit quiz + planner preferences (lived-in profile) ──
  await insert("home_quiz_completions", [{ id: randomUUID(), home_id: homeId, user_id: uid }]);
  await insert("planner_preferences", [
    ["plant", "Tomato", "positive", "Love growing our own."],
    ["plant", "Mint", "negative", "Too invasive last year."],
    ["aesthetic", "Cottage garden", "positive", "Relaxed, informal planting."],
    ["difficulty", "Low maintenance", "positive", "Busy weekends."],
    ["wildlife", "Pollinators", "positive", "Want more bees."],
    ["plant", "Lawn", "negative", "Hate mowing."],
  ].map(([t, n, s, r]) => ({ id: randomUUID(), home_id: homeId, user_id: uid, entity_type: t, entity_name: n, sentiment: s, source: "quiz", reason: r })));

  // ── Garden walk session + visits ──
  const walkId = randomUUID();
  const visited = plantedInstances.slice(0, 5);
  const outcomes = ["all_good", "noted", "task_completed", "ailment_flagged", "all_good"];
  await insert("garden_walk_sessions", [{
    id: walkId, home_id: homeId, user_id: uid, started_at: isoTs(-2), ended_at: isoTs(-2),
    plants_visited: visited.length, photos_taken: 1, notes_added: 1, tasks_completed: 1, ailments_flagged: 1,
  }]);
  await insert("garden_walk_visits", visited.map((inst, i) => ({
    id: randomUUID(), session_id: walkId, inventory_item_id: inst.id, visited_at: isoTs(-2), outcome: outcomes[i % outcomes.length],
  })));

  // ── Smart-home (home #1 only): a push-based custom_http soil sensor you can
  //    "ping" (POST a reading to its webhook) to fire a sensor automation. No
  //    real hardware: custom_http isn't polled by any cron, and the automation's
  //    action is a notification (not a valve), so it runs end-to-end. ──
  if (homeIndex === 0) await seedSmartHome(homeId, uid, areas[0], locations[0], blueprints);
}

async function seedSmartHome(homeId, uid, bed, loc, blueprints) {
  const secret = `demo-secret-${homeId.slice(0, 8)}`;
  const integrationId = randomUUID();
  await insert("integrations", [{
    id: integrationId, home_id: homeId, provider: "custom_http",
    credentials_encrypted: encryptCreds({ webhook_secret: secret }), region: "eu", status: "active",
    metadata: { webhook_secret: secret, family: "generic", friendly_name: "Demo Soil Sensor Feed" },
  }]);
  const sensorId = randomUUID();
  await insert("devices", [{
    id: sensorId, integration_id: integrationId, home_id: homeId, location_id: loc.id, area_id: bed.id,
    external_device_id: "demo-soil-01", name: `${bed.name} Soil Sensor`, device_type: "soil_sensor",
    provider: "custom_http", metadata: { model: "Demo-WH51" }, is_active: true,
    battery_percent: 82, battery_reported_at: isoTs(0), last_seen_at: isoTs(0),
  }]);
  // Latest moisture is HEALTHY (>30%) so the alert below won't auto-fire — the
  // user pushes a dry reading to trigger it.
  await insert("device_readings", [3, 2, 1, 0].map((d) => ({
    id: randomUUID(), device_id: sensorId, home_id: homeId, recorded_at: isoTs(-d),
    data: { soil_moisture: 50 - d, soil_temp: 18 + d * 0.3, soil_ec: 1100 + d * 20, battery: 82 },
  })));
  // A water valve on the same bed so valve automations are demo-able ("open the
  // valve on Raised Bed A when soil moisture drops below 30%"). custom_http
  // isn't polled and nothing auto-fires it — it exists to be referenced.
  const valveId = randomUUID();
  await insert("devices", [{
    id: valveId, integration_id: integrationId, home_id: homeId, location_id: loc.id, area_id: bed.id,
    external_device_id: "demo-valve-01", name: `${bed.name} Water Valve`, device_type: "water_valve",
    provider: "custom_http", metadata: { model: "Demo-WFC01" }, is_active: true, last_seen_at: isoTs(0),
  }]);
  await insert("device_readings", [{
    id: randomUUID(), device_id: valveId, home_id: homeId, recorded_at: isoTs(0),
    data: { state: "off" },
  }]);
  // A week of area sensor readings → populates the sensor charts + light data.
  const m = [], tp = [], ec = [], lux = [];
  for (let d = 7; d >= 0; d--) {
    m.push({ id: randomUUID(), home_id: homeId, area_id: bed.id, value_pct: 45 + (d % 3) * 6, recorded_at: isoTs(-d), source: "sensor", source_device_id: sensorId });
    tp.push({ id: randomUUID(), home_id: homeId, area_id: bed.id, value_c: 16 + (d % 4), recorded_at: isoTs(-d), source: "sensor", source_device_id: sensorId });
    ec.push({ id: randomUUID(), home_id: homeId, area_id: bed.id, value: 1100 + (d % 5) * 40, ec_source: "calibrated_us_cm", recorded_at: isoTs(-d), source: "sensor", source_device_id: sensorId });
    lux.push({ id: randomUUID(), home_id: homeId, area_id: bed.id, lux_value: 30000 + (d % 4) * 4000, recorded_at: isoTs(-d), source: "sensor" });
  }
  await insert("area_moisture_readings", m);
  await insert("area_temp_readings", tp);
  await insert("area_ec_readings", ec);
  await insert("area_lux_readings", lux);

  // Automation 1 — sensor → notification (ACTIVE). Push a <30% moisture reading
  // to the sensor's webhook and the event path fires this + sends a notification.
  const autoSensor = randomUUID();
  await insert("automations", [{
    id: autoSensor, home_id: homeId, name: "Dry soil alert — Raised Bed A", is_active: true,
    trigger_kind: "sensor_threshold", area_id: bed.id, sensor_cooldown_minutes: 120,
    run_limit_count: 4, run_limit_window_hours: 24,
    trigger_logic: { kind: "group", op: "and", children: [
      { kind: "sensor", metric: "soil_moisture", comparator: "<", value: 30, agg: "any", sensorIds: [sensorId] },
    ] },
  }]);
  await insert("automation_actions", [{
    id: randomUUID(), automation_id: autoSensor, action_kind: "send_notification", ord: 0,
    notification_title: "Raised Bed A is getting dry",
    notification_body: "Soil moisture dropped below 30% — time to water.",
  }]);

  // Automation 2 — manual reminder (INACTIVE). Use "Run now" to fire it → sends a
  // notification + completes a watering task. No hardware involved.
  const autoManual = randomUUID();
  const wateringBp = blueprints.find((b) => b.task_type === "Watering");
  await insert("automations", [{
    id: autoManual, home_id: homeId, name: "Morning watering reminder", is_active: false,
    trigger_kind: "time_scheduled", sensor_cooldown_minutes: 60, run_limit_window_hours: 24,
    trigger_logic: { kind: "group", op: "and", children: [
      { kind: "time", schedule: { mon: [{ start: "07:00", end: "07:30" }], tue: [], wed: [{ start: "07:00", end: "07:30" }], thu: [], fri: [{ start: "07:00", end: "07:30" }], sat: [], sun: [] } },
    ] },
  }]);
  const acts = [{
    id: randomUUID(), automation_id: autoManual, action_kind: "send_notification", ord: 0,
    notification_title: "Time to water", notification_body: "Your morning watering reminder.",
  }];
  if (wateringBp) acts.push({ id: randomUUID(), automation_id: autoManual, action_kind: "complete_task", ord: 1, target_blueprint_id: wateringBp.id });
  await insert("automation_actions", acts);
}

// User-scoped extras (saved bed templates + guide bookmarks + cross-home
// favourites) — once per account, NOT inside the per-home loop. Favourites
// are keyed on user_id, so the reset must delete by user_id (a home_id
// delete would silently miss them).
async function seedUserScoped(uid, homeIds = []) {
  await sb.from("garden_shape_templates").delete().eq("user_id", uid);
  await sb.from("guide_bookmarks").delete().eq("user_id", uid);
  await sb.from("user_favourite_plants").delete().eq("user_id", uid);
  await sb.from("user_favourite_ailments").delete().eq("user_id", uid);
  await sb.from("user_favourite_seed_packets").delete().eq("user_id", uid);
  await insert("garden_shape_templates", [
    { id: randomUUID(), user_id: uid, name: "4×8 Raised Bed", shape_type: "rect", colour: "#4ade80", width_m: 4, height_m: 8, dashed: false, suggested_plant_species: ["Tomato", "Basil", "Pepper"] },
    { id: randomUUID(), user_id: uid, name: "Round Herb Pot", shape_type: "circle", colour: "#34d399", radius_m: 0.6, dashed: false, suggested_plant_species: ["Mint", "Thyme", "Sage"] },
    { id: randomUUID(), user_id: uid, name: "Border Strip", shape_type: "rect", colour: "#f59e0b", width_m: 6, height_m: 1, dashed: true, suggested_plant_species: ["Lavender", "Marigold"] },
  ]);
  const { data: guides } = await sb.from("guides").select("id").limit(3);
  if (guides?.length) await insert("guide_bookmarks", guides.map((g) => ({ user_id: uid, guide_id: g.id })));

  // ── Cross-home favourite plants (docs/plans/cross-home-favourites.md §11) ──
  // ~10 favourites spread across the account's homes: manual rows referenced by
  // their own id, library/AI forks by their GLOBAL catalogue id (the immutable
  // canonical reference), plus one dangling-reference tombstone to exercise the
  // snapshot fallback. favourited_from_home_id varies across homes so switching
  // homes demonstrably keeps the list stable. Because favourites carry
  // ai-source rows, a Sprout account directly exercises "sees the AI favourite
  // but every action is tier-locked (view-only)".
  if (homeIds.length) {
    const { data: shedPlants } = await sb.from("plants")
      .select("id, home_id, common_name, scientific_name, source, forked_from_plant_id, thumbnail_url, watering, care_level, cycle, sunlight, description")
      .in("home_id", homeIds)
      .eq("is_archived", false)
      .order("id");
    const manuals = (shedPlants ?? []).filter((p) => p.source === "manual");
    const aiForks = (shedPlants ?? []).filter((p) => p.source === "ai");
    // Spread manual picks across homes (one slice per home) so the
    // favourited_from captions vary.
    const picks = [];
    for (const hid of homeIds) {
      picks.push(...manuals.filter((p) => p.home_id === hid).slice(0, Math.ceil(6 / homeIds.length)));
    }
    picks.push(...aiForks.slice(0, 3));
    const seen = new Set();
    const favRows = [];
    for (const p of picks.slice(0, 9)) {
      const refId = p.source === "ai" && p.forked_from_plant_id != null ? p.forked_from_plant_id : p.id;
      if (seen.has(refId)) continue;
      seen.add(refId);
      favRows.push({
        id: randomUUID(), user_id: uid, plant_id: refId, source: p.source,
        common_name: p.common_name,
        scientific_name: p.scientific_name ?? [],
        image_url: p.thumbnail_url ?? null,
        snapshot: {
          common_name: p.common_name, scientific_name: p.scientific_name ?? [],
          watering: p.watering, care_level: p.care_level, cycle: p.cycle,
          sunlight: p.sunlight, description: p.description,
        },
        favourited_from_home_id: p.home_id,
      });
    }
    // Dangling-reference tombstone — renders from the snapshot alone.
    favRows.push({
      id: randomUUID(), user_id: uid, plant_id: null, source: "manual",
      common_name: "Sweet Pea (from an old garden)",
      scientific_name: ["Lathyrus odoratus"],
      image_url: null,
      snapshot: {
        common_name: "Sweet Pea (from an old garden)",
        scientific_name: ["Lathyrus odoratus"],
        watering: "Frequent", care_level: "Low", cycle: "Annual",
        sunlight: ["Full sun"],
        description: "Fragrant climber saved from a garden this account has since left.",
      },
      favourited_from_home_id: null,
    });
    await insert("user_favourite_plants", favRows);

    // ── Cross-home favourite ailments (Phase 2) ──────────────────────────────
    // ~6 favourite ailments spread across the account's homes. Reference the
    // GLOBAL ailment_library row by name_key where one exists (→ "always live"),
    // else a library-less tombstone. Because favourites carry perenual/ai-source
    // rows, a Sprout account exercises "sees the ailment favourite but every
    // action is tier-locked (view-only)". favourited_from_home_id varies so
    // switching homes demonstrably keeps the list stable.
    const idKey = (s) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
    const { data: homeAilments } = await sb.from("ailments")
      .select("id, home_id, name, scientific_name, type, source, thumbnail_url, description, symptoms, affected_plants, prevention_steps, remedy_steps, perenual_id")
      .in("home_id", homeIds)
      .eq("is_archived", false)
      .order("created_at");
    // De-dupe by identity_key (the same ailment may live in several homes).
    const ailmentPicks = [];
    const seenA = new Set();
    for (const a of homeAilments ?? []) {
      const key = idKey(a.name);
      if (seenA.has(key)) continue;
      seenA.add(key);
      ailmentPicks.push(a);
      if (ailmentPicks.length >= 5) break;
    }
    // Resolve library ids by name_key (best-effort — matches the client service).
    const { data: libRows } = await sb.from("ailment_library").select("id, name").limit(1000);
    const libByKey = new Map((libRows ?? []).map((r) => [idKey(r.name), r.id]));
    const ailFavRows = ailmentPicks.map((a) => ({
      id: randomUUID(), user_id: uid,
      ailment_library_id: libByKey.get(idKey(a.name)) ?? null,
      identity_key: idKey(a.name),
      source: a.source, name: a.name, ailment_type: a.type,
      thumbnail_url: a.thumbnail_url ?? null,
      snapshot: {
        scientific_name: a.scientific_name ?? null,
        description: a.description ?? "",
        symptoms: a.symptoms ?? [],
        affected_plants: a.affected_plants ?? [],
        prevention_steps: a.prevention_steps ?? [],
        remedy_steps: a.remedy_steps ?? [],
        perenual_id: a.perenual_id ?? null,
      },
      favourited_from_home_id: a.home_id,
    }));
    // A dangling-reference tombstone — renders from the snapshot alone.
    ailFavRows.push({
      id: randomUUID(), user_id: uid, ailment_library_id: null,
      identity_key: "vine weevil (from an old garden)",
      source: "manual", name: "Vine Weevil (from an old garden)", ailment_type: "pest",
      thumbnail_url: null,
      snapshot: {
        scientific_name: "Otiorhynchus sulcatus",
        description: "Grubs that eat roots of pot plants — remembered from a garden this account has since left.",
        symptoms: [], affected_plants: ["Heuchera", "Primula"],
        prevention_steps: [], remedy_steps: [], perenual_id: null,
      },
      favourited_from_home_id: null,
    });
    await insert("user_favourite_ailments", ailFavRows);

    // ── Cross-home favourite seed packets (Phase 3) ──────────────────────────
    // ~5 packet favourites across the account's homes + a dangling tombstone.
    // SNAPSHOT-ONLY (no canonical library) — dedupe on (user_id, identity_key).
    // No tier gating (packets have no source). favourited_from_home_id varies so
    // switching homes demonstrably keeps the list stable.
    const idKeyPacket = (variety, plantName) => {
      const norm = (s) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
      return `${norm(variety)}|${norm(plantName)}`;
    };
    const { data: homePackets } = await sb.from("seed_packets")
      .select("id, home_id, plant_id, variety, vendor, sow_by, notes, quantity_remaining, purchased_on, opened_on")
      .in("home_id", homeIds)
      .eq("is_archived", false)
      .order("created_at");
    // Hydrate plant names for the identity key.
    const packetPlantIds = Array.from(new Set((homePackets ?? []).map((p) => p.plant_id).filter(Boolean)));
    let packetPlantNameById = new Map();
    if (packetPlantIds.length) {
      const { data: pp } = await sb.from("plants").select("id, common_name").in("id", packetPlantIds);
      packetPlantNameById = new Map((pp ?? []).map((r) => [r.id, r.common_name]));
    }
    const packetPicks = [];
    const seenP = new Set();
    for (const p of homePackets ?? []) {
      const plantName = p.plant_id != null ? packetPlantNameById.get(p.plant_id) ?? null : null;
      const key = idKeyPacket(p.variety, plantName);
      if (seenP.has(key)) continue;
      seenP.add(key);
      packetPicks.push({ ...p, _plantName: plantName, _key: key });
      if (packetPicks.length >= 5) break;
    }
    const packetFavRows = packetPicks.map((p) => ({
      id: randomUUID(), user_id: uid,
      seed_packet_id: p.id, plant_id: p.plant_id ?? null,
      plant_common_name: p._plantName, variety: p.variety, vendor: p.vendor,
      identity_key: p._key, copied_image_url: null,
      snapshot: {
        sow_by: p.sow_by ?? null, notes: p.notes ?? null,
        quantity_remaining: p.quantity_remaining ?? null,
        purchased_on: p.purchased_on ?? null, opened_on: p.opened_on ?? null,
      },
      favourited_from_home_id: p.home_id,
    }));
    // A dangling-reference tombstone — renders from the snapshot alone.
    packetFavRows.push({
      id: randomUUID(), user_id: uid, seed_packet_id: null, plant_id: null,
      plant_common_name: "Sweet Pea", variety: "Cupani (from an old garden)", vendor: "Higgledy Garden",
      identity_key: idKeyPacket("Cupani (from an old garden)", "Sweet Pea"),
      copied_image_url: null,
      snapshot: {
        sow_by: null, notes: "Heritage fragrant sweet pea remembered from a garden this account has since left.",
        quantity_remaining: null, purchased_on: null, opened_on: null,
      },
      favourited_from_home_id: null,
    });
    await insert("user_favourite_seed_packets", packetFavRows);
  }
}

// ───────────────────────── main ─────────────────────────
(async () => {
  const uid = await findOrCreateUser();

  const homeCount = 3;
  const homeIds = [];
  for (let i = 0; i < homeCount; i++) homeIds.push(await ensureHome(uid, HOME_DEFS[i]));

  // Profile: tier + flags + active home.
  const flags = TIER_FLAGS[TIER];
  const profilePatch = {
    subscription_tier: TIER, ai_enabled: flags.ai_enabled, enable_perenual: flags.enable_perenual,
    home_id: homeIds[0], display_name: "Sprout Tester",
  };
  let { error: pErr } = await sb.from("user_profiles").update(profilePatch).eq("uid", uid);
  if (pErr) {
    // older schema without display_name etc — retry minimal.
    ({ error: pErr } = await sb.from("user_profiles")
      .update({ subscription_tier: TIER, ai_enabled: flags.ai_enabled, enable_perenual: flags.enable_perenual, home_id: homeIds[0] })
      .eq("uid", uid));
    if (pErr) die(`profile update failed: ${pErr.message}`);
  }
  console.log(`👤  Profile set: tier=${TIER}, ai=${flags.ai_enabled}, perenual=${flags.enable_perenual}, active home=${homeIds[0]}`);

  const base = await nextPlantIdBase();
  let counter = base;
  const allocId = () => counter++;

  for (let i = 0; i < homeIds.length; i++) {
    await resetHome(homeIds[i]);
    await seedHome(homeIds[i], uid, i, allocId);
  }
  await seedUserScoped(uid, homeIds);

  console.log(`\n✅  Done. Seeded ${homeIds.length} homes for ${EMAIL} (${TIER}).`);
  console.log(`    Plant id range: ${base}–${counter - 1}`);
  if (PASSWORD) console.log(`    Login: ${EMAIL} / ${PASSWORD}`);
  console.log("");
})();
