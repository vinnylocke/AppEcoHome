import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { resolve } from "path";

const URL = "https://yiuuzlfhtsxbspdyibam.supabase.co";
const KEY = "sb_publishable_HDBdrlKd8HMPHto0E6i5QA_nbIPe-3K";
const REF = "yiuuzlfhtsxbspdyibam";
const EMAIL = "test.rhozly+demo@rhozly.com";
const PASS = (process.env.RHOZLY_DEMO_PASS || "<set RHOZLY_DEMO_PASS>");
const OUT = resolve("marketing/_src/captures");

const PHONE = [
  ["dashboard", "/dashboard"],
  ["doctor", "/doctor"],
  ["shed", "/shed"],
  ["planner", "/planner"],
  ["watchlist", "/watchlist"],
  ["guides", "/guides"],
  ["schedule", "/schedule"],
  ["weekly", "/weekly"],
];
const LAND = [
  ["garden-layout", "/garden-layout"],
  ["dashboard", "/dashboard"],
  ["weather", "/dashboard?view=weather"],
];

async function settle(page) {
  try { await page.waitForLoadState("domcontentloaded"); } catch {}
  try { await page.locator(".animate-spin").first().waitFor({ state: "hidden", timeout: 8000 }); } catch {}
  await page.waitForTimeout(3500);
  // Cleanly end any Shepherd onboarding tour (click its close icon).
  try {
    const x = page.locator(".shepherd-cancel-icon").first();
    if (await x.isVisible({ timeout: 500 })) await x.click({ timeout: 800 });
  } catch {}
  // Belt-and-braces: hide any leftover tour overlay/backdrop + transient toasts
  // so screenshots are clean. No content clicks (those mutate app state).
  await page.addStyleTag({ content:
    ".shepherd-element,.shepherd-modal-overlay-container,.shepherd-modal-is-visible{display:none !important;opacity:0 !important;}" }).catch(() => {});
  await page.waitForTimeout(1500);
}

async function run() {
  const sb = createClient(URL, KEY);
  const { data, error } = await sb.auth.signInWithPassword({ email: EMAIL, password: PASS });
  if (error || !data.session) { console.error("SIGN-IN FAILED:", error?.message); process.exit(1); }
  const session = data.session;
  console.log("Signed in as", data.user.email);

  const browser = await chromium.launch();
  const inject = [`sb-${REF}-auth-token`, JSON.stringify(session)];

  // ONE phone context reused across routes — so the onboarding tour, once
  // ended, doesn't re-trigger on every capture (its "seen" state persists).
  const pctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await pctx.addInitScript(([k, s]) => { localStorage.setItem(k, s); }, inject);
  const ppage = await pctx.newPage();
  for (const [name, path] of PHONE) {
    try {
      await ppage.goto("https://rhozly.com" + path, { waitUntil: "commit", timeout: 45000 });
      await settle(ppage);
      await ppage.screenshot({ path: `${OUT}/phone-${name}.png` });
      console.log("phone", name, "✓");
    } catch (e) { console.error("phone", name, "✗", e.message); }
  }
  await pctx.close();

  const lctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await lctx.addInitScript(([k, s]) => { localStorage.setItem(k, s); }, inject);
  const lpage = await lctx.newPage();
  for (const [name, path] of LAND) {
    try {
      await lpage.goto("https://rhozly.com" + path, { waitUntil: "commit", timeout: 45000 });
      await settle(lpage);
      await lpage.screenshot({ path: `${OUT}/land-${name}.png` });
      console.log("land", name, "✓");
    } catch (e) { console.error("land", name, "✗", e.message); }
  }
  await lctx.close();

  await browser.close();
  console.log("DONE");
  process.exit(0);
}
run();
