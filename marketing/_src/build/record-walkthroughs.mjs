/**
 * Records the four walkthrough videos against the live app on the demo
 * account (docs/plans/marketing-walkthrough-and-ad-videos.md).
 *
 *   RHOZLY_DEMO_PASS=... node marketing/_src/build/record-walkthroughs.mjs [flow]
 *
 * [flow] optionally limits to one of: core, ai, doctor, planner.
 *
 * Auth + clean-frame tricks mirror capture-screens.mjs. Each flow runs in its
 * own context with recordVideo; raw .webm files land in marketing/videos/_raw
 * named after the flow. Transcode to mp4 with transcode-walkthroughs.mjs.
 *
 * Read-mostly: the ONLY mutation is the Garden AI reminder confirmed in flow
 * "ai", and every task created after the run started is deleted again at the
 * end of that flow.
 */
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, renameSync, writeFileSync } from "fs";
import { resolve, join } from "path";

const URL = "https://yiuuzlfhtsxbspdyibam.supabase.co";
const KEY = "sb_publishable_HDBdrlKd8HMPHto0E6i5QA_nbIPe-3K";
const REF = "yiuuzlfhtsxbspdyibam";
const EMAIL = "test.rhozly+demo@rhozly.com";
const PASS = process.env.RHOZLY_DEMO_PASS || "";
const APP = "https://rhozly.com";
const RAW = resolve("marketing/videos/_raw");
mkdirSync(RAW, { recursive: true });

const PHONE = { width: 390, height: 844 };
const DESK = { width: 1280, height: 800 };

// A real tomato-plant photo for the Doctor flow (Unsplash, hotlink-friendly).
const PLANT_PHOTO_URL =
  "https://images.unsplash.com/photo-1592841200221-a6898f307baa?w=900&q=80&fm=jpg";

// ── In-page cursor overlay so viewers can follow the taps ───────────────────
function cursorInit() {
  if (window.__rzCursor) return;
  window.__rzCursor = true;
  const setup = () => {
    if (!document.body) return;
    if (!document.getElementById("__rz-clean")) {
      const st = document.createElement("style");
      st.id = "__rz-clean";
      st.textContent =
        ".shepherd-element,.shepherd-modal-overlay-container{display:none !important;}" +
        "#rhozly-blur-top,#rhozly-blur-bottom,#rhozly-blur-left,#rhozly-blur-right{display:none !important;backdrop-filter:none !important;-webkit-backdrop-filter:none !important;}";
      document.head.appendChild(st);
    }
    if (document.getElementById("__rz-cursor")) return;
    const d = document.createElement("div");
    d.id = "__rz-cursor";
    d.style.cssText =
      "position:fixed;z-index:2147483647;width:22px;height:22px;border-radius:50%;" +
      "background:rgba(7,87,55,.30);border:2px solid rgba(7,87,55,.85);pointer-events:none;" +
      "transform:translate(-50%,-50%);transition:width .12s,height .12s;left:-60px;top:-60px";
    document.body.appendChild(d);
    addEventListener("mousemove", (e) => { d.style.left = e.clientX + "px"; d.style.top = e.clientY + "px"; }, true);
    addEventListener("mousedown", () => { d.style.width = "34px"; d.style.height = "34px"; }, true);
    addEventListener("mouseup", () => { d.style.width = "22px"; d.style.height = "22px"; }, true);
  };
  document.readyState === "loading"
    ? addEventListener("DOMContentLoaded", setup)
    : setup();
  // SPA route changes keep the body — but re-check occasionally anyway.
  setInterval(setup, 1500);
}

// ── Human pacing helpers ─────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function settle(page, extra = 2000) {
  try { await page.waitForLoadState("domcontentloaded"); } catch {}
  try { await page.locator(".animate-spin").first().waitFor({ state: "hidden", timeout: 10000 }); } catch {}
  try {
    const x = page.locator(".shepherd-cancel-icon").first();
    if (await x.isVisible({ timeout: 600 })) await x.click({ timeout: 800 });
  } catch {}
  await page.addStyleTag({ content:
    ".shepherd-element,.shepherd-modal-overlay-container,.shepherd-modal-is-visible{display:none !important;opacity:0 !important;}" +
    // The app's own tour spotlight blurs everything except its target via
    // fixed panels — kill them or whole recordings render blurred.
    "#rhozly-blur-top,#rhozly-blur-bottom,#rhozly-blur-left,#rhozly-blur-right{display:none !important;backdrop-filter:none !important;-webkit-backdrop-filter:none !important;}" }).catch(() => {});
  await sleep(extra);
}

async function humanClick(page, locator, after = 900) {
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  const box = await locator.boundingBox();
  if (!box) throw new Error("no bounding box for click target");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 28 });
  await sleep(420);
  // Playwright's click, not raw mouse.down/up — it re-checks position and
  // stability, so a reflowing chat can't make the tap land on stale coords.
  await locator.click({ timeout: 8000 });
  await sleep(after);
}

async function drift(page, px, stepPx = 60, stepMs = 90) {
  const steps = Math.max(1, Math.round(Math.abs(px) / stepPx));
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, Math.sign(px) * stepPx);
    await sleep(stepMs);
  }
  await sleep(600);
}

async function typeSlow(page, locator, text) {
  await humanClick(page, locator, 300);
  await page.keyboard.type(text, { delay: 42 });
  await sleep(500);
}

// ── Context factory ──────────────────────────────────────────────────────────
async function makeContext(browser, inject, size, mobile) {
  const ctx = await browser.newContext({
    viewport: size,
    deviceScaleFactor: 2,
    isMobile: mobile,
    hasTouch: mobile,
    recordVideo: { dir: RAW, size },
    // A fresh profile installs the PWA service worker on first visit and the
    // app auto-reloads when it activates — which closed the chat mid-flow.
    // Recordings never want that reload.
    serviceWorkers: "block",
  });
  await ctx.addInitScript(([k, s]) => localStorage.setItem(k, s), inject);
  await ctx.addInitScript(cursorInit);
  return ctx;
}

async function finishFlow(ctx, page, name) {
  await sleep(1800); // hold the final frame
  const video = page.video();
  await ctx.close();
  const path = await video.path();
  const dest = join(RAW, `${name}.webm`);
  renameSync(path, dest);
  console.log(`✓ ${name} → ${dest}`);
}

// ── Flows ────────────────────────────────────────────────────────────────────

async function flowCoreTour(browser, inject) {
  const ctx = await makeContext(browser, inject, PHONE, true);
  const page = await ctx.newPage();
  await page.goto(APP + "/dashboard", { waitUntil: "commit", timeout: 45000 });
  await settle(page, 3000);
  await drift(page, 700); await drift(page, -700);

  await page.goto(APP + "/shed", { waitUntil: "commit", timeout: 45000 });
  await settle(page, 2500);
  await drift(page, 500);
  // The pure card testid is plant-card-<digits>; sub-elements add suffixes.
  let target = page.getByTestId(/^plant-card-\d+$/).first();
  if (!(await target.count())) target = page.locator('[data-testid^="plant-card-"]').first();
  await humanClick(page, target, 1200);
  await settle(page, 2500);
  await drift(page, 800); await drift(page, -400);

  await page.goto(APP + "/schedule", { waitUntil: "commit", timeout: 45000 });
  await settle(page, 2500);
  await drift(page, 600);

  await finishFlow(ctx, page, "01-core-tour");
}

async function flowGardenAi(browser, inject, sb) {
  const runStart = new Date().toISOString();
  const ctx = await makeContext(browser, inject, PHONE, true);
  const page = await ctx.newPage();
  await page.goto(APP + "/dashboard", { waitUntil: "commit", timeout: 45000 });
  await settle(page, 2500);

  await humanClick(page, page.getByTestId("plant-doctor-chat-fab"), 1200);
  const input = page.getByTestId("chat-input");
  await input.waitFor({ state: "visible", timeout: 10000 });
  // The input mounts disabled while the chat initialises — wait until it's
  // actually typable before interacting.
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="chat-input"]');
    return el && !el.disabled;
  }, { timeout: 60000 });
  await sleep(800);
  // While a reply streams the composer is disabled (send stays visible, so
  // visibility is NOT a done-signal). The input re-enabling is: the component
  // sets disabled={isLoading || isLoadingHistory}.
  const send = page.getByTestId("chat-send");
  const awaitIdle = async () => {
    await sleep(1500); // let isLoading flip on first
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-testid="chat-input"]');
      return el && !el.disabled;
    }, { timeout: 180000 });
    await sleep(1500);
  };

  await typeSlow(page, input, "What needs attention in my garden this week?");
  await humanClick(page, send, 500);
  await awaitIdle();
  await sleep(2000); // let the viewer read the grounded reply
  await drift(page, 300);

  await typeSlow(page, input, "Remind me to feed the tomatoes this Saturday");
  await humanClick(page, send, 500);
  const confirmBtn = page.locator('[data-testid^="tool-confirm-btn-"]').first();
  await confirmBtn.waitFor({ state: "visible", timeout: 90000 });
  await sleep(1500);
  await humanClick(page, confirmBtn, 800);
  // Fail loudly if the confirm didn't execute — a walkthrough that taps a
  // button with no visible result is worse than a failed recording.
  await page.locator('[data-testid^="tool-done-"]').first()
    .waitFor({ state: "visible", timeout: 30000 });
  await sleep(2000);

  await finishFlow(ctx, page, "02-garden-ai");

  // Clean up: remove the task(s) this flow created so the demo stays pristine.
  const { data, error } = await sb.from("tasks").delete()
    .gte("created_at", runStart).select("id,title");
  if (error) console.warn("cleanup warning:", error.message);
  else console.log(`cleanup: removed ${data?.length ?? 0} task(s) created during the flow`);
}

async function flowDoctorWatchlist(browser, inject) {
  // Fetch a real plant photo for the upload; skip gracefully if unavailable.
  let photoPath = null;
  try {
    const res = await fetch(PLANT_PHOTO_URL);
    if (res.ok) {
      photoPath = join(RAW, "_upload-tomato.jpg");
      writeFileSync(photoPath, Buffer.from(await res.arrayBuffer()));
    }
  } catch { /* offline or blocked — flow still shows the screens */ }

  const ctx = await makeContext(browser, inject, PHONE, true);
  const page = await ctx.newPage();
  await page.goto(APP + "/doctor", { waitUntil: "commit", timeout: 45000 });
  await settle(page, 3000);
  await drift(page, 300); await drift(page, -300);

  if (photoPath) {
    try {
      await page.locator('input[type="file"]').first().setInputFiles(photoPath);
      await sleep(2500);
      // Kick off identification with whichever CTA this tier shows.
      for (const id of ["doctor-btn-identify", "doctor-btn-analyse", "doctor-btn-identify-free"]) {
        const btn = page.getByTestId(id);
        if (await btn.isVisible().catch(() => false)) { await humanClick(page, btn, 800); break; }
      }
      // Gemini vision result — generous wait, capped so the video stays sane.
      await page.getByTestId("doctor-confirm-identification")
        .waitFor({ state: "visible", timeout: 75000 }).catch(() => {});
      await sleep(2500);
      await drift(page, 500);
    } catch (e) { console.warn("doctor upload skipped:", e.message); }
  }

  await page.goto(APP + "/watchlist", { waitUntil: "commit", timeout: 45000 });
  await settle(page, 2500);
  await drift(page, 600);

  await finishFlow(ctx, page, "03-plant-doctor-watchlist");
}

async function flowPlannerShopping(browser, inject) {
  const ctx = await makeContext(browser, inject, DESK, false);
  const page = await ctx.newPage();
  await page.goto(APP + "/planner", { waitUntil: "commit", timeout: 45000 });
  await settle(page, 3500);
  await drift(page, 400); await drift(page, -400);
  // Open the first plan card. The list renders async — wait for it properly,
  // and fall back to any card-looking child under the planner main area.
  let plan = page.locator('[data-testid="planner-plan-list"] > *').first();
  if (!(await plan.isVisible().catch(() => false))) {
    await page.locator('[data-testid="planner-plan-list"]')
      .waitFor({ state: "visible", timeout: 12000 }).catch(() => {});
    plan = page.locator('[data-testid="planner-plan-list"] > *').first();
  }
  if (await plan.isVisible().catch(() => false)) {
    await humanClick(page, plan, 1800);
    await settle(page, 3000);
    await drift(page, 700); await sleep(1200); await drift(page, -400);
  } else {
    console.warn("planner: no plan card found — recording overview only");
    await drift(page, 500); await sleep(1500);
  }

  await page.goto(APP + "/shopping", { waitUntil: "commit", timeout: 45000 });
  await settle(page, 3000);
  await drift(page, 300);
  // Expand the completed section so the screen shows more than one row.
  const completedToggle = page.getByTestId("shopping-completed-section-toggle");
  if (await completedToggle.isVisible().catch(() => false)) {
    await humanClick(page, completedToggle, 1500);
  }
  await drift(page, 400); await sleep(1500);

  await finishFlow(ctx, page, "04-planner-shopping");
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function run() {
  if (!PASS) { console.error("Set RHOZLY_DEMO_PASS"); process.exit(1); }
  const sb = createClient(URL, KEY);
  const { data, error } = await sb.auth.signInWithPassword({ email: EMAIL, password: PASS });
  if (error || !data.session) { console.error("SIGN-IN FAILED:", error?.message); process.exit(1); }
  console.log("Signed in as", data.user.email);
  const inject = [`sb-${REF}-auth-token`, JSON.stringify(data.session)];

  const only = process.argv[2];
  const browser = await chromium.launch();
  const flows = {
    core: () => flowCoreTour(browser, inject),
    ai: () => flowGardenAi(browser, inject, sb),
    doctor: () => flowDoctorWatchlist(browser, inject),
    planner: () => flowPlannerShopping(browser, inject),
  };
  for (const [name, fn] of Object.entries(flows)) {
    if (only && only !== name) continue;
    console.log(`— recording ${name} —`);
    try { await fn(); } catch (e) {
      console.error(`${name} FAILED:`, e.message);
      // Debug aid: snapshot whatever page is still open in any live context.
      for (const c of browser.contexts()) {
        const p = c.pages()[0];
        if (p) await p.screenshot({ path: join(RAW, `_fail-${name}.png`) }).catch(() => {});
        await c.close().catch(() => {});
      }
    }
  }
  await browser.close();
  console.log("DONE");
  process.exit(0);
}
run();
