import { chromium } from "@playwright/test";
import { pathToFileURL } from "url";
import { resolve } from "path";
import { writeFileSync } from "fs";

const TMP = resolve("marketing/_src/_social.html");
const LOGO = pathToFileURL(resolve("public/logo_small_rhozly.png")).href;
const SHOT = pathToFileURL(resolve("marketing/_src/captures/phone-dashboard.png")).href;

const BASE = `
  *{margin:0;padding:0;box-sizing:border-box;-webkit-print-color-adjust:exact;}
  html,body{width:100vw;height:100vh;overflow:hidden;font-family:"Inter",sans-serif;}
  .g1{position:absolute;background:rgba(255,255,255,.10);border-radius:50%;filter:blur(90px);}
  .g2{position:absolute;background:rgba(52,211,153,.18);border-radius:50%;filter:blur(90px);}
  .eyebrow{font-weight:700;letter-spacing:.24em;text-transform:uppercase;color:#bfe6d1;display:inline-flex;align-items:center;gap:.6em;}
  .dot{width:.5em;height:.5em;border-radius:50%;background:#34d399;box-shadow:0 0 0 .28em rgba(52,211,153,.25);}
  h1{font-family:"Plus Jakarta Sans",sans-serif;font-weight:800;letter-spacing:-.03em;line-height:1.02;color:#fff;text-wrap:balance;}
  .tag{color:#cfe6da;font-weight:600;letter-spacing:-.01em;}
  .device{background:linear-gradient(160deg,#12241b,#0a1811);box-shadow:0 40px 90px rgba(3,20,12,.5);overflow:hidden;}
  .device img{display:block;width:100%;object-fit:cover;object-position:top;}
  .mark{background:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 18px 40px rgba(0,0,0,.3);flex:none;}
  .wm{font-family:"Plus Jakarta Sans",sans-serif;font-weight:800;color:#fff;letter-spacing:-.02em;}
  .pills{display:flex;gap:.6em;flex-wrap:wrap;}
  .pill{background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.2);color:#eafff3;font-weight:600;border-radius:999px;}
  .cta{background:#fff;color:#075737;font-weight:800;border-radius:999px;display:inline-flex;align-items:center;gap:.5em;font-family:"Plus Jakarta Sans",sans-serif;letter-spacing:-.01em;}
`;

function head() {
  return `<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&family=Inter:wght@500;600;700&display=swap" rel="stylesheet"><style>${BASE}</style>`;
}

const SQUARE = `<!doctype html><html><head><meta charset="utf-8">${head()}<style>
  .c{width:100vw;height:100vh;position:relative;overflow:hidden;display:flex;align-items:center;gap:3%;padding:0 6%;
     background:radial-gradient(130% 120% at 82% -12%,#0e6a45,#075737 46%,#063d28);}
  .c .g1{top:-10%;right:4%;width:44%;aspect-ratio:1;}.c .g2{bottom:-14%;left:-8%;width:52%;aspect-ratio:1;}
  .left{z-index:2;flex:1;}
  .brand{display:flex;align-items:center;gap:2.2vw;margin-bottom:5vw;}
  .brand .mark{width:8vw;height:8vw;border-radius:2vw;}.brand .mark img{width:5.6vw;}
  .brand .wm{font-size:5.4vw;}
  .eyebrow{font-size:2vw;margin-bottom:2.4vw;}
  h1{font-size:7.4vw;}
  .tag{font-size:2.7vw;margin-top:3vw;max-width:22ch;}
  .stage{z-index:2;width:34%;display:flex;justify-content:center;}
  .device{width:100%;border-radius:6vw;padding:1.1vw;}.device img{border-radius:5vw;height:64vh;}
</style></head><body><div class="c"><div class="g1"></div><div class="g2"></div>
  <div class="left">
    <div class="brand"><span class="mark"><img src="${LOGO}"></span><span class="wm">Rhozly</span></div>
    <span class="eyebrow"><span class="dot"></span>Now in beta</span>
    <h1>Your garden's brain</h1>
    <p class="tag">Plan, identify and care for every plant — in one calm app.</p>
  </div>
  <div class="stage"><div class="device"><img src="${SHOT}"></div></div>
</div></body></html>`;

const STORY = `<!doctype html><html><head><meta charset="utf-8">${head()}<style>
  .c{width:100vw;height:100vh;position:relative;overflow:hidden;display:flex;flex-direction:column;align-items:center;text-align:center;padding:8vh 8vw 6vh;
     background:radial-gradient(120% 90% at 80% -8%,#0e6a45,#075737 46%,#063d28);}
  .c .g1{top:-6%;right:2%;width:52%;aspect-ratio:1;}.c .g2{bottom:-8%;left:-10%;width:60%;aspect-ratio:1;}
  .brand{display:flex;align-items:center;gap:2.4vw;z-index:2;}
  .brand .mark{width:9vw;height:9vw;border-radius:2.4vw;}.brand .mark img{width:6.2vw;}
  .brand .wm{font-size:6vw;}
  .eyebrow{font-size:2.7vw;margin:5vh 0 2.4vh;z-index:2;}
  h1{font-size:8.6vw;z-index:2;max-width:15ch;}
  .stage{flex:1;display:flex;align-items:center;z-index:2;margin:4vh 0;}
  .device{width:72vw;border-radius:9vw;padding:1.6vw;}.device img{border-radius:7.4vw;height:64vh;}
  .cta{font-size:3.6vw;padding:2.4vh 6vw;z-index:2;}
</style></head><body><div class="c"><div class="g1"></div><div class="g2"></div>
  <div class="brand"><span class="mark"><img src="${LOGO}"></span><span class="wm">Rhozly</span></div>
  <span class="eyebrow"><span class="dot"></span>Now in beta</span>
  <h1>Everything your garden needs</h1>
  <div class="stage"><div class="device"><img src="${SHOT}"></div></div>
  <span class="cta">Join the beta → rhozly.com</span>
</div></body></html>`;

const BANNER = `<!doctype html><html><head><meta charset="utf-8">${head()}<style>
  .c{width:100vw;height:100vh;position:relative;overflow:hidden;display:flex;align-items:center;gap:3.5%;padding:0 5%;
     background:radial-gradient(130% 200% at 88% -30%,#0e6a45,#075737 46%,#063d28);}
  .c .g2{top:-60%;right:6%;width:48%;aspect-ratio:1;}
  .mark{width:14vh;height:14vh;border-radius:3.4vh;}.mark img{width:9.4vh;}
  .txt{z-index:2;}
  .wm{font-size:12vh;line-height:1;}
  .tag{font-size:3.4vh;margin-top:1.2vh;}
  .pills{margin-top:2.6vh;}
  .pill{font-size:2.5vh;padding:1vh 2.4vh;}
</style></head><body><div class="c"><div class="g2"></div>
  <span class="mark"><img src="${LOGO}"></span>
  <div class="txt">
    <div class="wm">Rhozly</div>
    <div class="tag">Your garden's brain — plan, grow, thrive.</div>
    <div class="pills"><span class="pill">AI Plant Lens</span><span class="pill">Smart tasks</span><span class="pill">2D & 3D layouts</span><span class="pill">Weather alerts</span></div>
  </div>
</div></body></html>`;

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

const browser = await chromium.launch();
const D = "marketing/collateral/social";
await shoot(browser, SQUARE, 1080, 1080, `${D}/rhozly-square-1080.png`);
await shoot(browser, STORY, 1080, 1920, `${D}/rhozly-story-1080x1920.png`);
await shoot(browser, BANNER, 1500, 500, `${D}/rhozly-banner-1500x500.png`);
await browser.close();
console.log("DONE"); process.exit(0);
