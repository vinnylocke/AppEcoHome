import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { resolve } from "path";

const URL = "https://yiuuzlfhtsxbspdyibam.supabase.co";
const KEY = "sb_publishable_HDBdrlKd8HMPHto0E6i5QA_nbIPe-3K";
const REF = "yiuuzlfhtsxbspdyibam";
const OUT = resolve("marketing/_src/captures");

async function settle(page, ms = 3500) {
  try { await page.waitForLoadState("domcontentloaded"); } catch {}
  try { await page.locator(".animate-spin").first().waitFor({ state: "hidden", timeout: 8000 }); } catch {}
  await page.waitForTimeout(ms);
  try { const x = page.locator(".shepherd-cancel-icon").first(); if (await x.isVisible({ timeout: 500 })) await x.click({ timeout: 800 }); } catch {}
  await page.addStyleTag({ content: ".shepherd-element,.shepherd-modal-overlay-container{display:none !important;}" }).catch(() => {});
  await page.waitForTimeout(1200);
}

async function run() {
  const sb = createClient(URL, KEY);
  const { data, error } = await sb.auth.signInWithPassword({ email: "test.rhozly+demo@rhozly.com", password: (process.env.RHOZLY_DEMO_PASS || "<set RHOZLY_DEMO_PASS>") });
  if (error || !data.session) { console.error("SIGN-IN FAILED:", error?.message); process.exit(1); }
  const inject = [`sb-${REF}-auth-token`, JSON.stringify(data.session)];
  const browser = await chromium.launch();

  // Landscape: open the layout EDITOR (draw board) + Head Gardener AI
  const lctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await lctx.addInitScript(([k, s]) => { localStorage.setItem(k, s); }, inject);
  const lp = await lctx.newPage();

  await lp.goto("https://rhozly.com/garden-layout", { waitUntil: "commit", timeout: 45000 });
  await settle(lp);
  try {
    await lp.getByText("Maple Cottage Garden Plan", { exact: false }).first().click({ timeout: 5000 });
    await settle(lp, 5000);
    await lp.screenshot({ path: `${OUT}/land-layout-editor.png` });
    console.log("land layout-editor ✓");
  } catch (e) { console.error("layout-editor ✗", e.message); }

  for (const [name, path] of [["head-gardener", "/head-gardener"], ["planner", "/planner"]]) {
    try {
      await lp.goto("https://rhozly.com" + path, { waitUntil: "commit", timeout: 45000 });
      await settle(lp);
      await lp.screenshot({ path: `${OUT}/land-${name}.png` });
      console.log("land", name, "✓");
    } catch (e) { console.error("land", name, "✗", e.message); }
  }
  await lctx.close();

  // Phone: Head Gardener + a plant detail (Shed already captured)
  const pctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await pctx.addInitScript(([k, s]) => { localStorage.setItem(k, s); }, inject);
  const pp = await pctx.newPage();
  for (const [name, path] of [["head-gardener", "/head-gardener"]]) {
    try {
      await pp.goto("https://rhozly.com" + path, { waitUntil: "commit", timeout: 45000 });
      await settle(pp);
      await pp.screenshot({ path: `${OUT}/phone-${name}.png` });
      console.log("phone", name, "✓");
    } catch (e) { console.error("phone", name, "✗", e.message); }
  }
  await pctx.close();

  await browser.close();
  console.log("DONE"); process.exit(0);
}
run();
