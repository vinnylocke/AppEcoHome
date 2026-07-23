import { readFileSync, existsSync, writeFileSync } from "fs";
const ICONDIR = "node_modules/lucide-react/dist/esm/icons";

// ── Lucide SVG extractor (same technique as the brand guidelines) ────────────
function toKebab(name) {
  return name.replace(/([A-Z])([A-Z][a-z])/g, "$1-$2").replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/([A-Za-z])([0-9])/g, "$1-$2").toLowerCase();
}
function icon(name, size = 22) {
  let k = toKebab(name), file = `${ICONDIR}/${k}.js`;
  if (!existsSync(file)) return "";
  let text = readFileSync(file, "utf8"), hops = 0, m;
  while ((m = text.match(/export \{ default \} from '\.\/([^']+)\.js'/)) && hops < 4) {
    const af = `${ICONDIR}/${m[1]}.js`; if (!existsSync(af)) break; text = readFileSync(af, "utf8"); hops++;
  }
  const mm = text.match(/const __iconNode = (\[[\s\S]*?\]);\n/); if (!mm) return "";
  let arr; try { arr = eval(mm[1]); } catch { return ""; }
  const inner = arr.map(([t, a]) => `<${t} ${Object.entries(a).filter(([kk]) => kk !== "key").map(([kk, v]) => `${kk}="${v}"`).join(" ")}/>`).join("");
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}

const FEATURES = [
  ["LayoutDashboard", "Daily dashboard", "Today's tasks, your weather and every area of the garden — at a glance."],
  ["Bot", "Garden AI assistant", "Gemini-Pro-powered chat that knows your garden — it checks your data, answers anything, and stages changes for one-tap confirmation."],
  ["Stethoscope", "AI Plant Lens", "Snap a photo to identify a plant and diagnose pests, disease or deficiencies."],
  ["Sprout", "Plant collection", "Catalogue every plant you grow with photos, notes and journals."],
  ["CalendarClock", "Smart reminders", "Weather-aware watering, feeding and pruning tasks so nothing's forgotten."],
  ["Footprints", "Garden Walk", "A guided round of the garden — care for everything, plant by plant, in minutes."],
  ["Bug", "Ailment Watchlist", "Track the pests, diseases and invasives to watch for before they spread."],
  ["Ruler", "2D & 3D layouts", "Draw your plot to scale, with sun and microclimate insight for every bed."],
  ["CloudSun", "Weather & alerts", "Local forecasts with frost and heatwave warnings, tuned to your plants."],
  ["Sun", "Light & sun tools", "Measure real light levels in lux and follow the sun's path in AR."],
  ["BookOpen", "Expert guides", "Step-by-step, skill-graded know-how — plus a community guide library."],
  ["Plug", "Smart integrations", "Live soil-moisture sensors and automated watering valves."],
  ["Wheat", "Harvest & yield", "Harvest windows, yield logging and season totals for every crop you grow."],
  ["Users", "Shared gardens", "Invite family or housemates, each with their own permissions."],
];

const CSS = `
  :root{--green:#075737;--green-deep:#063d28;--rose:#e80d2a;--bg:#faf9f7;--surface:#efeeec;--ink:#1a1c1b;--muted:#5c655f;--muted2:#8a938c;--outline:rgba(26,28,27,.14);
    --display:"Plus Jakarta Sans",sans-serif;--body:"Inter",sans-serif;}
  *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;margin:0;}
  body{font-family:var(--body);color:var(--ink);font-size:12px;line-height:1.55;}
  @page{size:A4;margin:0;}
  .sheet{padding:14mm 14mm;position:relative;min-height:297mm;break-after:page;}
  .sheet:last-child{break-after:auto;}
  h1,h2,h3{font-family:var(--display);font-weight:800;letter-spacing:-.02em;margin:0;line-height:1.06;}
  .eyebrow{font-size:10px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:var(--green);}
  .rule{height:3px;width:44px;background:var(--rose);border-radius:2px;margin:10px 0 16px;}
  .muted{color:var(--muted);}
  .foot{position:absolute;bottom:8mm;left:14mm;right:14mm;display:flex;justify-content:space-between;font-size:8.5px;color:var(--muted2);border-top:1px solid var(--outline);padding-top:6px;letter-spacing:.02em;}
  .brandbar{display:flex;align-items:center;gap:13px;}
  .brandbar .ic{width:46px;height:46px;border-radius:13px;background:#fff;border:1px solid var(--outline);display:flex;align-items:center;justify-content:center;}
  .brandbar .ic img{width:34px;height:34px;}
  .brandbar .wm{font-family:var(--display);font-weight:800;font-size:26px;color:var(--green);letter-spacing:-.02em;}
  .brandbar .tag{font-size:11px;color:var(--muted);font-weight:600;}
  .feat{display:grid;grid-template-columns:1fr 1fr;gap:11px;}
  .feat.three{grid-template-columns:1fr 1fr 1fr;}
  .fcard{border:1px solid var(--outline);border-radius:14px;background:#fff;padding:14px;break-inside:avoid;display:flex;gap:12px;align-items:flex-start;}
  .fcard .g{width:38px;height:38px;border-radius:11px;background:#e6efe9;color:var(--green);display:flex;align-items:center;justify-content:center;flex:none;}
  .fcard h3{font-size:13px;margin-bottom:3px;}
  .fcard p{font-size:10.5px;color:var(--muted);line-height:1.45;}
`;

function featureCards(list) {
  return list.map(([ic, t, d]) => `<div class="fcard"><span class="g">${icon(ic, 20)}</span><div><h3>${t}</h3><p>${d}</p></div></div>`).join("");
}

// ── Feature highlight sheet (1 page) ─────────────────────────────────────────
const featureSheet = `<!doctype html><html><head><meta charset="utf-8"><title>Rhozly — Feature Highlights</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${CSS}</style></head><body>
<section class="sheet">
  <div class="brandbar"><span class="ic"><img src="logo.png"></span><div><div class="wm">Rhozly</div><div class="tag">Your garden's brain — plan, grow, thrive.</div></div></div>
  <div style="margin-top:20px" class="eyebrow">Feature highlights</div>
  <h1 style="font-size:27px;margin-top:4px">Everything your garden needs, in one app</h1>
  <div class="rule"></div>
  <p class="muted" style="max-width:80ch;margin-bottom:16px;font-size:12.5px;line-height:1.6">From a daily to-do list to an AI plant doctor, a scale garden designer to smart-sensor automation — Rhozly brings the whole craft of growing into one calm, beautiful place.</p>
  <div class="feat">${featureCards(FEATURES)}</div>
  <div class="foot"><span>Rhozly — Feature Highlights</span><span>rhozly.com</span></div>
</section></body></html>`;

// ── Product one-pager (1 page) ───────────────────────────────────────────────
const SHOT = "../app-store/screenshots/apple/iphone-6.7";
const onePager = `<!doctype html><html><head><meta charset="utf-8"><title>Rhozly — Product One-Pager</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${CSS}
  .hero{background:radial-gradient(120% 100% at 85% -20%,#0e6a45,#075737 48%,#063d28);color:#fff;border-radius:18px;padding:22px 24px;position:relative;overflow:hidden;}
  .hero .wmrow{display:flex;align-items:center;gap:12px;}
  .hero .ic{width:44px;height:44px;border-radius:12px;background:#fff;display:flex;align-items:center;justify-content:center;}
  .hero .ic img{width:32px;height:32px;}
  .hero .wm{font-family:var(--display);font-weight:800;font-size:24px;letter-spacing:-.02em;}
  .hero h1{font-size:27px;margin-top:14px;max-width:16ch;}
  .hero p{color:#cfe6da;font-size:12px;margin-top:8px;max-width:52ch;line-height:1.6;}
  .shots3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:9px;margin:14px 0;}
  .shots3 img{width:100%;border-radius:10px;border:1px solid var(--outline);}
  .tiers{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;}
  .tier{border:1px solid var(--outline);border-radius:12px;padding:11px;background:#fff;break-inside:avoid;}
  .tier .n{font-family:var(--display);font-weight:800;font-size:13px;color:var(--green);}
  .tier .pr{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted2);margin:2px 0 6px;}
  .tier p{font-size:10px;color:var(--muted);line-height:1.4;}
</style></head><body>
<section class="sheet">
  <div class="hero">
    <div class="wmrow"><span class="ic"><img src="logo.png"></span><span class="wm">Rhozly</span></div>
    <h1>The calm, all-in-one home for your garden</h1>
    <p>Part plant encyclopaedia, part task planner, part AI plant doctor. Rhozly tells you exactly what to do today and helps every plant thrive — on phone, tablet or desktop.</p>
  </div>
  <div class="shots3">
    <img src="${SHOT}/01-dashboard.png"><img src="${SHOT}/02-plant-lens.png"><img src="${SHOT}/03-shed.png">
  </div>
  <div class="eyebrow">What you get</div><div class="rule" style="margin:8px 0 12px"></div>
  <div class="feat three">${featureCards(FEATURES.slice(0, 6))}</div>
  <div style="margin-top:16px" class="eyebrow">Four tiers — free to start</div><div class="rule" style="margin:8px 0 12px"></div>
  <div class="tiers">
    <div class="tier"><div class="n">Sprout</div><div class="pr">Free</div><p>The essentials — plants, tasks, weather and the daily dashboard.</p></div>
    <div class="tier"><div class="n">Botanist</div><div class="pr">Paid</div><p>More plants, the planner, layouts and the full guide library.</p></div>
    <div class="tier"><div class="n">Sage</div><div class="pr">Paid</div><p>AI Plant Lens plus the Gemini-Pro-powered Garden AI assistant.</p></div>
    <div class="tier"><div class="n">Evergreen</div><div class="pr">Paid</div><p>Everything — unlimited Garden AI on our most advanced model, highest limits, smart-sensor integrations.</p></div>
  </div>
  <p class="muted" style="font-size:9.5px;margin-top:9px">AI features and limits vary by tier — see the app for current pricing.</p>
  <div class="foot"><span>Rhozly — Product One-Pager</span><span>hello@rhozly.com · rhozly.com</span></div>
</section></body></html>`;

writeFileSync("marketing/_src/feature-sheet.html", featureSheet);
writeFileSync("marketing/_src/one-pager.html", onePager);
console.log("wrote feature-sheet.html + one-pager.html");
