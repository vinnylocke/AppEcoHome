/**
 * Renders the ad's title cards + caption overlays as PNGs (1080×1920) using
 * the same brand language as render-social.mjs (green radial, Plus Jakarta
 * Sans, glow blobs, logo).
 *
 *   node marketing/_src/build/render-ad-cards.mjs
 *
 * Outputs to marketing/videos/_cards/:
 *   card-open.png, card-end.png           — full-frame title cards
 *   cap-<key>.png                          — transparent caption overlays
 *                                            (bottom chip, sits over clips)
 */
import { chromium } from "@playwright/test";
import { pathToFileURL } from "url";
import { resolve } from "path";
import { writeFileSync, mkdirSync } from "fs";

const OUT = resolve("marketing/videos/_cards");
mkdirSync(OUT, { recursive: true });
const TMP = resolve("marketing/_src/_adcard.html");
const LOGO = pathToFileURL(resolve("public/logo_small_rhozly.png")).href;

const HEAD = `<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&family=Inter:wght@500;600;700&display=swap" rel="stylesheet"><style>
  *{margin:0;padding:0;box-sizing:border-box;}
  html,body{width:100vw;height:100vh;overflow:hidden;font-family:"Inter",sans-serif;}
  .g1{position:absolute;background:rgba(255,255,255,.10);border-radius:50%;filter:blur(90px);}
  .g2{position:absolute;background:rgba(52,211,153,.18);border-radius:50%;filter:blur(90px);}
  .eyebrow{font-weight:700;letter-spacing:.24em;text-transform:uppercase;color:#bfe6d1;display:inline-flex;align-items:center;gap:.6em;}
  .dot{width:.5em;height:.5em;border-radius:50%;background:#34d399;box-shadow:0 0 0 .28em rgba(52,211,153,.25);}
  h1{font-family:"Plus Jakarta Sans",sans-serif;font-weight:800;letter-spacing:-.03em;line-height:1.04;color:#fff;text-wrap:balance;}
  .tag{color:#cfe6da;font-weight:600;}
  .mark{background:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 18px 40px rgba(0,0,0,.3);flex:none;}
  .wm{font-family:"Plus Jakarta Sans",sans-serif;font-weight:800;color:#fff;letter-spacing:-.02em;}
  .cta{background:#fff;color:#075737;font-weight:800;border-radius:999px;display:inline-flex;align-items:center;font-family:"Plus Jakarta Sans",sans-serif;}
</style>`;

const fullCard = (inner) => `<!doctype html><html><head><meta charset="utf-8">${HEAD}<style>
  .c{width:100vw;height:100vh;position:relative;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 9vw;
     background:radial-gradient(120% 90% at 80% -8%,#0e6a45,#075737 46%,#063d28);}
  .c .g1{top:-6%;right:2%;width:52%;aspect-ratio:1;}.c .g2{bottom:-8%;left:-10%;width:60%;aspect-ratio:1;}
  .brand{display:flex;align-items:center;gap:2.6vw;z-index:2;margin-bottom:6vh;}
  .brand .mark{width:11vw;height:11vw;border-radius:2.8vw;}.brand .mark img{width:7.6vw;}
  .brand .wm{font-size:7.4vw;}
  .eyebrow{font-size:2.3vw;margin-bottom:3.4vh;z-index:2;}
  h1{font-size:9.6vw;z-index:2;}
  .tag{font-size:3.2vw;margin-top:3.4vh;max-width:24ch;z-index:2;}
  .cta{font-size:3vw;padding:1.6vh 4.4vw;margin-top:5.2vh;z-index:2;}
</style></head><body><div class="c"><div class="g1"></div><div class="g2"></div>${inner}</div></body></html>`;

const CARDS = {
  "card-open": fullCard(`
    <div class="brand"><span class="mark"><img src="${LOGO}"></span><span class="wm">Rhozly</span></div>
    <span class="eyebrow"><span class="dot"></span>Now in beta</span>
    <h1>Your garden's brain</h1>
    <p class="tag">Plan, identify and care for every plant — in one calm app.</p>`),
  "card-end": fullCard(`
    <div class="brand"><span class="mark"><img src="${LOGO}"></span><span class="wm">Rhozly</span></div>
    <h1>Grow smarter</h1>
    <p class="tag">Every plant. Every task. One calm app.</p>
    <span class="cta">Join the beta — rhozly.com</span>`),
};

// Transparent caption overlays — a chip in the bottom padding zone of clips.
const capCard = (text) => `<!doctype html><html><head><meta charset="utf-8">${HEAD}<style>
  html,body{background:transparent;}
  .c{width:100vw;height:100vh;position:relative;display:flex;align-items:flex-end;justify-content:center;padding-bottom:5.5vh;}
  .chip{background:rgba(6,40,26,.82);border:1px solid rgba(191,230,209,.28);backdrop-filter:blur(6px);
        border-radius:3.2vw;padding:2.6vh 5vw;max-width:86vw;text-align:center;
        box-shadow:0 24px 60px rgba(3,20,12,.45);}
  .chip p{font-family:"Plus Jakarta Sans",sans-serif;font-weight:800;letter-spacing:-.02em;line-height:1.16;color:#fff;font-size:4.6vw;text-wrap:balance;}
</style></head><body><div class="c"><div class="chip"><p>${text}</p></div></div></body></html>`;

const CAPTIONS = {
  "cap-dashboard": "Every plant. One calm dashboard.",
  "cap-shed": "Your whole collection, in The Shed.",
  "cap-ai": "An AI that reads your real garden — then acts, with your say-so.",
  "cap-doctor": "Point. Shoot. Diagnose.",
  "cap-planner": "Season plans and smart schedules.",
  "cap-weekly": "Weather-aware routines — frost and heat alerts built in.",
};

async function shoot(page, html, file, transparent) {
  writeFileSync(TMP, html);
  await page.goto(pathToFileURL(TMP).href);
  await page.waitForTimeout(900); // webfonts
  await page.screenshot({ path: `${OUT}/${file}.png`, omitBackground: transparent });
  console.log("✓", file);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
for (const [name, html] of Object.entries(CARDS)) await shoot(page, html, name, false);
for (const [name, text] of Object.entries(CAPTIONS)) await shoot(page, capCard(text), name, true);
await browser.close();
console.log("DONE →", OUT);
