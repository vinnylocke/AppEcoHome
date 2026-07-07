/**
 * Garden AI chat — evaluation report builder (multi-run, versioned).
 *
 * Reads every run in ./runs/*.json, shows a run-history table (date/time · app
 * version · avg usability/detail/consistency · tool-verdict mix) so you can see
 * the trend, then renders the LATEST run in full with a delta-vs-previous on the
 * headline metrics. Backwards compatible: older runs that predate a metric show
 * "–" and are skipped from that average.
 *
 * Ratings live on each run's results[].rating. If loose ratings-*.json files
 * sit next to this script they're merged into the LATEST run (by conversation
 * id) and the run file is rewritten, so the flow is: run-eval → rate → build.
 *
 * Usage:  node docs/ai-chat-eval/build-report.mjs
 * Output: docs/ai-chat-eval/report.html
 */
import { readFileSync, writeFileSync, readdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const HERE = dirname(fileURLToPath(import.meta.url));
const RUNS = resolve(HERE, "runs");

// ── Tool → area map (from supabase/functions/agent-chat/tools.ts) ─────────────
const CAT = {};
const put = (names, c) => names.forEach((n) => (CAT[n] = c));
put(["list_plants","list_tasks","list_blueprints","list_locations","list_areas","list_ailments","list_shopping_lists","list_seed_packets","list_plans","show_plant_images","search_plant_database","get_plant_details","get_weather_now","get_overdue_summary","optimise_area_schedule","list_devices","list_automations"], "Read");
put(["create_one_off_task","add_journal_entry","add_plant_to_shed","assign_plant_to_area","add_ailment","link_ailment_to_instance","create_shopping_list","add_to_shopping_list","add_seed_packet","log_sowing"], "Create");
put(["create_blueprint","update_blueprint","pause_blueprint","create_location","create_area","create_plan","add_plant_to_plan"], "Schedule/Structure");
put(["archive_plant","restore_plant","end_of_life_instance","restore_instance","delete_instance","archive_ailment","archive_blueprint","bulk_reschedule","bulk_complete_tasks"], "Destructive/Bulk");
put(["create_automation","update_automation","run_automation","delete_automation"], "Automation");
put(["complete_task","skip_task","snooze_task","remove_shopping_item","toggle_shopping_item_bought","complete_shopping_list","resolve_ailment","unlink_ailment_from_instance","update_plan","archive_plan","remove_plant_from_plan","rename_area","rename_location","delete_area","delete_location"], "Single-item");

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const nl2br = (s) => esc(s).replace(/\n/g, "<br>");
const avg = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const nums = (arr, f) => arr.map(f).filter((n) => typeof n === "number");

// ── Reply template (canonical: reply-template.md — the consistency rubric) ───
// Tiny markdown→HTML for that one known file (headings, bold, bullets, hr).
function templatePanel() {
  let md;
  try { md = readFileSync(resolve(HERE, "reply-template.md"), "utf8"); } catch { return ""; }
  const inline = (s) => esc(s).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/`([^`]+)`/g, "<code>$1</code>");
  const lines = md.split(/\r?\n/);
  let html = "", inList = false;
  for (const line of lines) {
    if (/^#\s/.test(line)) continue;                       // page h1 → panel has its own heading
    if (/^###\s/.test(line)) { if (inList) { html += "</ul>"; inList = false; } html += `<h3 style="font-size:13px;margin:14px 0 4px">${inline(line.replace(/^###\s/, ""))}</h3>`; continue; }
    if (/^---/.test(line)) { if (inList) { html += "</ul>"; inList = false; } html += `<div style="height:1px;background:var(--outline);margin:12px 0"></div>`; continue; }
    if (/^-\s/.test(line)) { if (!inList) { html += `<ul style="margin:4px 0 8px 18px;font-size:12px;line-height:1.65">`; inList = true; } html += `<li>${inline(line.replace(/^-\s/, ""))}</li>`; continue; }
    if (inList) { html += "</ul>"; inList = false; }
    if (line.trim()) html += `<p style="font-size:12px;line-height:1.6;margin:6px 0">${inline(line)}</p>`;
  }
  if (inList) html += "</ul>";
  return `<div class="panel">
    <div class="eyebrow">The Rhozly reply template — what "consistency" is judged against</div>
    <p class="meta" style="margin:6px 0 8px">Baked into the assistant's system prompt (<span class="mono">agent-chat/rules.ts</span>); canonical copy in <span class="mono">reply-template.md</span>.</p>
    ${html}
  </div>`;
}

// ── Load runs ────────────────────────────────────────────────────────────────
let runFiles = [];
try { runFiles = readdirSync(RUNS).filter((f) => f.endsWith(".json")); } catch { runFiles = []; }
let runs = runFiles.map((f) => ({ file: f, ...JSON.parse(readFileSync(resolve(RUNS, f), "utf8")) }))
  .sort((a, b) => String(a.meta.runAt).localeCompare(String(b.meta.runAt)));
if (!runs.length) { console.error("No runs in", RUNS); process.exit(1); }

// Merge any loose ratings-*.json into the LATEST run, then persist it.
const latest = runs[runs.length - 1];
const loose = {};
for (const f of readdirSync(HERE).filter((f) => /^ratings.*\.json$/.test(f))) {
  try { for (const r of JSON.parse(readFileSync(resolve(HERE, f), "utf8"))) loose[r.id] = r; } catch {}
}
if (Object.keys(loose).length) {
  let merged = 0;
  for (const c of latest.results) if (loose[c.id]) { c.rating = loose[c.id]; merged++; }
  if (merged) writeFileSync(resolve(RUNS, latest.file), JSON.stringify({ meta: latest.meta, results: latest.results }, null, 2));
  console.log("merged", merged, "ratings into", latest.file);
}

// ── Aggregate one run ────────────────────────────────────────────────────────
function agg(run) {
  const rr = run.results.map((c) => c.rating).filter(Boolean);
  const toolStat = {};
  for (const c of run.results) for (const t of c.turns) {
    for (const x of t.tools ?? []) (toolStat[x.tool] ??= { used: 0, proposed: 0 }).used++;
    for (const x of t.pending ?? []) (toolStat[x.tool] ??= { used: 0, proposed: 0 }).proposed++;
  }
  const verdicts = {};
  for (const r of rr) verdicts[r.toolVerdict ?? "na"] = (verdicts[r.toolVerdict ?? "na"] || 0) + 1;
  return {
    n: run.results.length, rated: rr.length,
    turns: run.results.reduce((a, c) => a + c.turns.length, 0),
    avgU: avg(nums(rr, (r) => r.usability)), avgD: avg(nums(rr, (r) => r.detail)), avgC: avg(nums(rr, (r) => r.consistency)),
    verdicts, toolStat,
  };
}
const A = runs.map((r) => ({ run: r, a: agg(r) }));
const cur = A[A.length - 1];
const prev = A.length > 1 ? A[A.length - 2] : null;

const VERDICT = { correct:["Correct","#047857","#ecfdf5"], partial:["Partial","#a86617","#fbf3e6"], missed:["Missed","#b91c1c","#fef2f2"], overused:["Over-used","#6d28d9","#ede9fe"], na:["N/A","#5c655f","#efeeec"] };
const fmt = (n) => n == null ? "–" : n.toFixed(2);
const delta = (a, b) => (a == null || b == null) ? "" : (() => { const d = a - b; const c = d >= 0 ? "#047857" : "#b91c1c"; return ` <span style="color:${c};font-size:11px;font-weight:700">${d >= 0 ? "▲" : "▼"}${Math.abs(d).toFixed(2)}</span>`; })();
const scoreDot = (n) => n == null ? "<span style='color:#8a938c'>–</span>" : `<b style="color:${n>=4?"#047857":n>=3?"#a86617":"#b91c1c"}">${n}</b><span style="color:#8a938c">/5</span>`;
function toolChip(name, kind) { const bg = kind==="used"?"#e6efe9":"#eef2ff", fg = kind==="used"?"#075737":"#3730a3"; return `<span class="chip" style="background:${bg};color:${fg}" title="${CAT[name]??"?"}">${esc(name)}${kind==="proposed"?" ⧗":""}</span>`; }

function dist(vals) { const d=[0,0,0,0,0]; vals.forEach((v)=>{ if(v>=1&&v<=5) d[v-1]++; }); return d; }
function bars(d, color) { const m=Math.max(1,...d); return `<div class="bars">${d.map((v,i)=>`<div class="bar"><div class="fill" style="height:${(v/m)*100}%;background:${color}"></div><span>${i+1}</span><em>${v}</em></div>`).join("")}</div>`; }

// ── Conversation card (latest run) ───────────────────────────────────────────
function convCard(c) {
  const r = c.rating;
  const turnsHtml = c.turns.map((t, i) => {
    const chips = [...(t.tools ?? []).map((x) => toolChip(x.tool, "used")), ...(t.pending ?? []).map((x) => toolChip(x.tool, "proposed"))].join("");
    const plants = (t.plants ?? []).length ? `<div class="meta">🖼 showed: ${t.plants.map(esc).join(", ")}</div>` : "";
    return `<div class="turn"><div class="q"><span class="qn">${i===0?"Q":"↳"}</span> ${esc(t.q)}</div><div class="a">${t.err?`<span style="color:#b91c1c">ERROR: ${esc(t.err)}</span>`:nl2br(t.reply)}</div>${chips?`<div class="chips">${chips}</div>`:`<div class="meta">no tools</div>`}${plants}</div>`;
  }).join("");
  const exp = (c.expect ?? []).length ? c.expect.map((e) => `<span class="chip exp">${esc(e)}</span>`).join("") : `<span class="meta">knowledge — no tool expected</span>`;
  const rv = r ? (() => { const [lbl, fg, bg] = VERDICT[r.toolVerdict] ?? VERDICT.na; return `<div class="rating">
      <div class="rrow"><span>Usability</span> ${scoreDot(r.usability)}</div>
      <div class="rrow"><span>Detail</span> ${scoreDot(r.detail)}</div>
      <div class="rrow"><span>Consistency</span> ${scoreDot(r.consistency)}</div>
      <div class="rrow"><span>Tool use</span> <span class="chip" style="background:${bg};color:${fg}">${lbl}</span></div>
      ${r.toolNote?`<p class="note">🔧 ${esc(r.toolNote)}</p>`:""}
      ${r.highlight?`<p class="note good">✔ ${esc(r.highlight)}</p>`:""}
      ${r.concern?`<p class="note bad">⚠ ${esc(r.concern)}</p>`:""}
    </div>`; })() : `<div class="rating"><p class="meta">unrated</p></div>`;
  return `<div class="card"><div class="chead"><span class="cid">${c.id}</span><span class="ccat">${esc(c.cat)}</span><span class="cexp">expected: ${exp}</span></div><div class="cbody"><div class="turns">${turnsHtml}</div>${rv}</div></div>`;
}
function personaSection(name, emoji) {
  const cs = latest.results.filter((c) => c.persona === name);
  return `<h2 class="h2">${emoji} ${esc(name)} <span class="count">${cs.length} conversations</span></h2><div class="rule"></div>${cs.map(convCard).join("")}`;
}

// tool table + missed list (latest)
const toolRows = Object.entries(cur.a.toolStat).sort((a,b)=>(b[1].used+b[1].proposed)-(a[1].used+a[1].proposed))
  .map(([n,s])=>`<tr><td class="mono">${esc(n)}</td><td>${CAT[n]??"?"}</td><td>${s.used||"–"}</td><td>${s.proposed||"–"}</td></tr>`).join("");
const missed = latest.results.filter((c)=>c.rating&&["missed","partial"].includes(c.rating.toolVerdict))
  .map((c)=>`<li><b>${c.id}</b> (${esc(c.cat)}) — ${esc(c.rating.toolNote||c.rating.concern||"tool opportunity missed")}</li>`).join("")||"<li>None flagged. 🎉</li>";

// run history rows
const historyRows = A.map(({run,a},i)=>{
  const isCur = i===A.length-1;
  const v = Object.entries(a.verdicts).map(([k,n])=>`${(VERDICT[k]||VERDICT.na)[0]} ${n}`).join(" · ");
  return `<tr${isCur?' style="background:#f0f7f3;font-weight:600"':""}>
    <td>${esc(run.meta.runAt).replace("T"," ").replace(/\..*/,"")}${isCur?' <span class="chip exp">latest</span>':""}</td>
    <td class="mono">${esc(run.meta.appVersion)}</td>
    <td>${esc(run.meta.label||"—")}</td>
    <td>${fmt(a.avgU)}</td><td>${fmt(a.avgD)}</td><td>${fmt(a.avgC)}</td>
    <td style="font-size:10px">${v}</td>
  </tr>`;
}).reverse().join("");

const m = latest.meta;
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Rhozly — Garden AI Chat Evaluation</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  :root{--green:#075737;--rose:#e80d2a;--bg:#faf9f7;--surface:#efeeec;--ink:#1a1c1b;--muted:#5c655f;--muted2:#8a938c;--outline:rgba(26,28,27,.14);--display:"Plus Jakarta Sans",sans-serif;--body:"Inter",sans-serif;}
  *{box-sizing:border-box;margin:0;} body{font-family:var(--body);color:var(--ink);background:var(--bg);font-size:13px;line-height:1.5;}
  .wrap{max-width:1040px;margin:0 auto;padding:24px 18px 80px;}
  h1,h2,h3{font-family:var(--display);font-weight:800;letter-spacing:-.02em;margin:0;line-height:1.1;}
  .hero{background:radial-gradient(120% 100% at 85% -20%,#0e6a45,#075737 48%,#063d28);color:#fff;border-radius:20px;padding:26px 28px;margin-bottom:18px;}
  .hero .eyebrow{font-size:10px;font-weight:700;letter-spacing:.22em;text-transform:uppercase;color:#bfe6d1;}
  .hero h1{font-size:30px;margin:8px 0 6px;} .hero p{color:#cfe6da;font-size:13px;max-width:74ch;}
  .runmeta{margin-top:10px;font-size:12px;color:#eafff3;display:flex;gap:16px;flex-wrap:wrap;}
  .runmeta b{color:#fff;}
  .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:18px;}
  .kpi{background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.16);border-radius:14px;padding:12px 14px;}
  .kpi .n{font-family:var(--display);font-weight:800;font-size:24px;} .kpi .l{font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#bfe6d1;}
  .panel{background:#fff;border:1px solid var(--outline);border-radius:16px;padding:18px 20px;margin-bottom:16px;}
  .h2{font-size:20px;margin:26px 0 0;display:flex;align-items:baseline;gap:10px;} .h2 .count{font-family:var(--body);font-size:12px;font-weight:600;color:var(--muted);}
  .rule{height:3px;width:42px;background:var(--rose);border-radius:2px;margin:10px 0 14px;}
  .eyebrow{font-size:10px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:var(--green);}
  .grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;}
  .bars{display:flex;gap:8px;align-items:flex-end;height:82px;margin-top:8px;} .bar{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;position:relative;}
  .bar .fill{width:70%;border-radius:5px 5px 0 0;min-height:2px;} .bar span{font-size:10px;color:var(--muted);margin-top:4px;} .bar em{position:absolute;top:-14px;font-style:normal;font-size:10px;font-weight:700;}
  table{width:100%;border-collapse:collapse;font-size:12px;} th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--outline);vertical-align:top;} th{font-family:var(--display);font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--green);}
  .mono{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11px;}
  .verdicts{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;} .vpill{border-radius:999px;padding:5px 12px;font-size:11px;font-weight:700;}
  .card{background:#fff;border:1px solid var(--outline);border-radius:14px;margin-bottom:12px;overflow:hidden;}
  .chead{display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--surface);border-bottom:1px solid var(--outline);flex-wrap:wrap;}
  .cid{font-family:var(--display);font-weight:800;color:var(--green);} .ccat{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);}
  .cexp{margin-left:auto;font-size:10px;color:var(--muted2);display:flex;gap:4px;align-items:center;flex-wrap:wrap;}
  .cbody{display:grid;grid-template-columns:1fr 240px;} .turns{padding:12px 14px;border-right:1px solid var(--outline);}
  .turn{padding:8px 0;border-bottom:1px dashed var(--outline);} .turn:last-child{border-bottom:none;}
  .q{font-weight:700;margin-bottom:4px;} .qn{display:inline-block;background:var(--green);color:#fff;font-size:10px;font-weight:800;border-radius:5px;padding:1px 6px;margin-right:6px;}
  .a{color:#33403a;font-size:12.5px;max-height:230px;overflow:auto;}
  .chips{display:flex;gap:5px;flex-wrap:wrap;margin-top:7px;} .chip{font-size:10px;font-weight:700;border-radius:6px;padding:2px 7px;font-family:ui-monospace,Menlo,monospace;} .chip.exp{background:#eef2ff;color:#3730a3;}
  .meta{font-size:10.5px;color:var(--muted2);margin-top:6px;} .rating{padding:12px 14px;background:#fcfcfb;}
  .rrow{display:flex;justify-content:space-between;align-items:center;font-size:12px;margin-bottom:6px;} .rrow span{color:var(--muted);font-weight:600;}
  .note{font-size:11px;margin-top:6px;line-height:1.45;color:#3a463f;} .note.good{color:#047857;} .note.bad{color:#b91c1c;}
  .foot{text-align:center;color:var(--muted2);font-size:11px;margin-top:30px;}
  @media(max-width:720px){.cbody{grid-template-columns:1fr}.turns{border-right:none;border-bottom:1px solid var(--outline)}.kpis,.grid3{grid-template-columns:1fr 1fr}}
</style></head><body><div class="wrap">

<div class="hero">
  <div class="eyebrow">Quality evaluation · latest run</div>
  <h1>Garden AI Chat — Response Evaluation</h1>
  <p>Live responses from the deployed <span class="mono">agent-chat</span> assistant to the shared question bank across two gardener personas — rated for usability, detail, answer-format consistency, and tool use. Read tools ran live; mutations were captured as proposed confirm cards (⧗), not executed.</p>
  <div class="runmeta"><span>🗓 <b>${esc(m.runAt).replace("T"," ").replace(/\..*/,"")}</b></span><span>🏷 app <b>v${esc(m.appVersion)}</b></span>${m.label?`<span>📋 <b>${esc(m.label)}</b></span>`:""}<span>💬 <b>${cur.a.n}</b> conversations · <b>${cur.a.turns}</b> turns</span></div>
  <div class="kpis">
    <div class="kpi"><div class="n">${fmt(cur.a.avgU)}${prev?delta(cur.a.avgU,prev.a.avgU):""}</div><div class="l">Usability</div></div>
    <div class="kpi"><div class="n">${fmt(cur.a.avgD)}${prev?delta(cur.a.avgD,prev.a.avgD):""}</div><div class="l">Detail</div></div>
    <div class="kpi"><div class="n">${fmt(cur.a.avgC)}${prev?delta(cur.a.avgC,prev.a.avgC):""}</div><div class="l">Consistency</div></div>
    <div class="kpi"><div class="n">${cur.a.verdicts.correct||0}/${cur.a.rated}</div><div class="l">Tool use correct</div></div>
  </div>
</div>

${templatePanel()}

<div class="panel">
  <div class="eyebrow">Run history</div>
  <p class="meta" style="margin:6px 0 10px">Every run of the shared bank, newest first. Compare versions over time; ▲/▼ on the headline KPIs above are vs the previous run.</p>
  <div style="overflow-x:auto"><table>
    <tr><th>Run (UTC)</th><th>Version</th><th>Label</th><th>Usability</th><th>Detail</th><th>Consistency</th><th>Tool verdicts</th></tr>
    ${historyRows}
  </table></div>
</div>

<div class="panel">
  <div class="eyebrow">Latest run — summary</div>
  <div class="grid3" style="margin-top:12px">
    <div><h3 style="font-size:13px">Usability (1–5)</h3>${bars(dist(nums(latest.results.map(c=>c.rating||{}),(r)=>r.usability)),"#075737")}</div>
    <div><h3 style="font-size:13px">Detail (1–5)</h3>${bars(dist(nums(latest.results.map(c=>c.rating||{}),(r)=>r.detail)),"#0e6a45")}</div>
    <div><h3 style="font-size:13px">Consistency (1–5)</h3>${bars(dist(nums(latest.results.map(c=>c.rating||{}),(r)=>r.consistency)),"#2a704d")}</div>
  </div>
  <div class="eyebrow" style="margin-top:18px">Tool-use verdicts</div>
  <div class="verdicts">${Object.entries(cur.a.verdicts).map(([k,v])=>{const x=VERDICT[k]||VERDICT.na;return `<span class="vpill" style="background:${x[2]};color:${x[1]}">${x[0]}: ${v}</span>`;}).join("")||"<span class='meta'>unrated</span>"}</div>
</div>

<div class="panel">
  <div class="eyebrow">Tool-usage review — latest run</div>
  <p class="meta" style="margin:6px 0 10px"><b>Ran</b> = read tools executed live; <b>Proposed ⧗</b> = a mutation offered via a confirm card. Missed/partial opportunities below.</p>
  <div style="overflow-x:auto"><table><tr><th>Tool</th><th>Area</th><th>Ran</th><th>Proposed ⧗</th></tr>${toolRows||"<tr><td colspan=4 class='meta'>no tool calls</td></tr>"}</table></div>
  <div class="eyebrow" style="margin-top:16px">Missed / partial tool opportunities</div>
  <ul style="margin:8px 0 0 18px;font-size:12px;line-height:1.7">${missed}</ul>
</div>

${personaSection("New / Beginner", "🌱")}
${personaSection("Experienced", "🌳")}

<div class="foot">Rhozly · Garden AI evaluation · ${runs.length} run(s) · shared question bank (question-bank.mjs) · demo garden "Maple Cottage Garden"</div>
</div></body></html>`;

writeFileSync(resolve(HERE, "report.html"), html);
console.log("report →", resolve(HERE, "report.html"), "| runs:", runs.length, "| latest rated:", cur.a.rated, "/", cur.a.n);
