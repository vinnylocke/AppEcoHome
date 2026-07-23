import { chromium } from "@playwright/test";
import { pathToFileURL } from "url";
import { resolve } from "path";
import { writeFileSync } from "fs";

const TMP = resolve("marketing/_src/_frame.html");

const CAP = (n) => pathToFileURL(resolve("marketing/_src/captures/" + n)).href;
const LOGO = pathToFileURL(resolve("public/logo_small_rhozly.png")).href;

// ── Design template ──────────────────────────────────────────────────────────
function page(spec) {
  const land = spec.orientation === "landscape";
  const v = spec.variant === "b"
    ? { bg: "background:#faf9f7;", ink: "#075737", eb: "#2a704d", sub: "#5c655f" }
    : { bg: "background:radial-gradient(130% 120% at 80% -15%, #0e6a45 0%, #075737 45%, #063d28 100%);", ink: "#ffffff", eb: "#bfe6d1", sub: "#cfe6da" };
  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&family=Inter:wght@500;600;700&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box;-webkit-print-color-adjust:exact;}
  html,body{width:100vw;height:100vh;overflow:hidden;font-family:"Inter",sans-serif;}
  .canvas{width:100vw;height:100vh;position:relative;overflow:hidden;${v.bg}display:flex;flex-direction:column;align-items:center;}
  .glow1{position:absolute;top:-8%;right:6%;width:46%;aspect-ratio:1;background:rgba(255,255,255,.10);border-radius:50%;filter:blur(90px);}
  .glow2{position:absolute;bottom:-12%;left:-6%;width:52%;aspect-ratio:1;background:rgba(52,211,153,.16);border-radius:50%;filter:blur(100px);}
  .cap{text-align:center;z-index:2;width:88%;}
  .eyebrow{font-weight:700;letter-spacing:.22em;text-transform:uppercase;color:${v.eb};}
  h1{font-family:"Plus Jakarta Sans",sans-serif;font-weight:800;letter-spacing:-.02em;line-height:1.04;color:${v.ink};text-wrap:balance;}
  .stage{flex:1;display:flex;align-items:${land ? "center" : "flex-start"};justify-content:center;width:100%;z-index:2;position:relative;}
  .device{background:linear-gradient(160deg,#12241b,#0a1811);box-shadow:0 40px 90px rgba(3,20,12,.45), 0 0 0 1px rgba(255,255,255,.04) inset;overflow:hidden;}
  .device img{display:block;width:100%;height:100%;object-fit:cover;object-position:top;}
  /* portrait phone */
  .p .cap{padding-top:6.5%;}
  .p .eyebrow{font-size:2.4vw;margin-bottom:2.2vw;}
  .p h1{font-size:6.6vw;}
  .p .device{width:74%;margin-top:6%;border-radius:8.5vw;padding:2vw;border-radius:9vw;}
  .p .device img{border-radius:7vw;}
  /* landscape tablet */
  .l .cap{padding-top:4.5%;width:82%;}
  .l .eyebrow{font-size:1.5vw;margin-bottom:1.4vw;}
  .l h1{font-size:4.3vw;}
  .l .device{width:80%;margin-top:2.5%;border-radius:2.4vw;padding:1vw;}
  .l .device img{border-radius:1.6vw;}
</style></head>
<body>
  <div class="canvas ${land ? "l" : "p"}">
    <div class="glow1"></div><div class="glow2"></div>
    <div class="cap"><div class="eyebrow">${spec.eyebrow}</div><h1>${spec.headline}</h1></div>
    <div class="stage"><div class="device"><img src="${spec.img}"></div></div>
  </div>
</body></html>`;
}

function featureGraphic() {
  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@700;800&family=Inter:wght@500;600&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box;-webkit-print-color-adjust:exact;}
  html,body{width:100vw;height:100vh;overflow:hidden;}
  .fg{width:100vw;height:100vh;position:relative;overflow:hidden;display:flex;align-items:center;gap:3.5%;padding:0 6%;
    background:radial-gradient(130% 160% at 85% -20%, #0e6a45 0%, #075737 46%, #063d28 100%);font-family:"Inter",sans-serif;}
  .glow{position:absolute;top:-40%;right:8%;width:60%;aspect-ratio:1;background:rgba(52,211,153,.18);border-radius:50%;filter:blur(70px);}
  .mark{width:19%;aspect-ratio:1;border-radius:22%;background:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 20px 44px rgba(0,0,0,.3);flex:none;z-index:2;}
  .mark img{width:70%;}
  .txt{z-index:2;color:#fff;}
  .txt .wm{font-family:"Plus Jakarta Sans",sans-serif;font-weight:800;font-size:11vh;letter-spacing:-.03em;line-height:1;}
  .txt .tag{font-weight:600;font-size:3.4vh;color:#cfe6da;margin-top:1.8vh;letter-spacing:-.01em;}
</style></head>
<body><div class="fg"><div class="glow"></div>
  <div class="mark"><img src="${LOGO}"></div>
  <div class="txt"><div class="wm">Rhozly</div><div class="tag">Your garden's brain — plan, grow, thrive.</div></div>
</div></body></html>`;
}

function appIcon() {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box;}html,body{width:100vw;height:100vh;overflow:hidden;}
  .i{width:100vw;height:100vh;background:#fff;display:flex;align-items:center;justify-content:center;}
  .i img{width:66%;}
</style></head><body><div class="i"><img src="${LOGO}"></div></body></html>`;
}

const PHONE = [
  { name: "01-dashboard", img: CAP("phone-dashboard.png"), eyebrow: "Your garden, organised", headline: "Everything to do today, in one place", variant: "a" },
  { name: "02-plant-lens", img: CAP("phone-doctor.png"), eyebrow: "AI Plant Lens", headline: "Snap a photo. Know what's wrong.", variant: "b" },
  { name: "03-shed", img: CAP("phone-shed.png"), eyebrow: "Your plant collection", headline: "Every plant you grow, catalogued", variant: "a" },
  { name: "04-watchlist", img: CAP("phone-watchlist.png"), eyebrow: "Pests & disease", headline: "Catch problems before they spread", variant: "b" },
  { name: "05-guides", img: CAP("phone-guides.png"), eyebrow: "Expert know-how", headline: "Guides that grow with you", variant: "a" },
];
const TABLET = [
  { name: "01-garden-layout", img: CAP("land-layout-editor.png"), eyebrow: "Design your plot", headline: "Draw your garden to scale — in 2D & 3D", variant: "a", orientation: "landscape" },
  { name: "02-dashboard", img: CAP("land-dashboard.png"), eyebrow: "Works on every screen", headline: "Your garden HQ on tablet & desktop", variant: "b", orientation: "landscape" },
];

async function shoot(browser, html, w, h, out) {
  writeFileSync(TMP, html);
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.goto(pathToFileURL(TMP).href, { waitUntil: "networkidle" });
  await p.waitForTimeout(500);
  await p.screenshot({ path: out });
  await ctx.close();
  console.log("→", out);
}

async function run() {
  const browser = await chromium.launch();
  const R = "marketing/app-store/screenshots";

  for (const s of PHONE) {
    await shoot(browser, page(s), 1290, 2796, `${R}/apple/iphone-6.7/${s.name}.png`);
    await shoot(browser, page(s), 1080, 1920, `${R}/google-play/phone/${s.name}.png`);
  }
  for (const s of TABLET) {
    await shoot(browser, page(s), 2732, 2048, `${R}/apple/ipad-12.9/${s.name}.png`);
    await shoot(browser, page(s), 1920, 1200, `${R}/google-play/tablet/${s.name}.png`);
  }
  await shoot(browser, featureGraphic(), 1024, 500, `${R}/google-play/feature-graphic-1024x500.png`);
  await shoot(browser, appIcon(), 1024, 1024, "marketing/app-store/icon/rhozly-icon-1024.png");

  await browser.close();
  console.log("DONE"); process.exit(0);
}
run();
