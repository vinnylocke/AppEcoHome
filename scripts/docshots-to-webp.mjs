#!/usr/bin/env node
/**
 * docshots-to-webp — convert captured documentation screenshots (PNG) to WebP.
 *
 * Playwright can only emit PNG/JPEG, and the repo has no native WebP encoder
 * (sharp/cwebp). This script re-encodes PNGs to WebP using the project's already
 * installed Playwright Chromium (canvas → toDataURL('image/webp')), so no extra
 * dependency is required.
 *
 * Usage:
 *   node scripts/docshots-to-webp.mjs [stagingDir] [outDir]
 *     stagingDir  dir of source PNGs    (default: public/doc-images/_staging)
 *     outDir      dir for output WebP    (default: public/doc-images)
 *
 * Optional per-image top-crop (for tall element screenshots): place a
 * `crop.json` in the staging dir mapping "<file-stem>": <maxHeightPx>, e.g.
 *   { "03-tasks-05-task-list": 620 }
 *
 * Source PNGs are deleted after a successful conversion. Quality: 0.92.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const STAGING = process.argv[2] || "public/doc-images/_staging";
const OUT = process.argv[3] || "public/doc-images";
const QUALITY = 0.92;

if (!fs.existsSync(STAGING)) {
  console.error(`Staging dir not found: ${STAGING}`);
  process.exit(1);
}
fs.mkdirSync(OUT, { recursive: true });

let cropMap = {};
const cropPath = path.join(STAGING, "crop.json");
if (fs.existsSync(cropPath)) {
  try { cropMap = JSON.parse(fs.readFileSync(cropPath, "utf-8")); }
  catch (e) { console.warn(`Ignoring invalid crop.json: ${e.message}`); }
}

const files = fs.readdirSync(STAGING).filter((f) => f.toLowerCase().endsWith(".png"));
if (files.length === 0) {
  console.log(`No PNGs to convert in ${STAGING}.`);
  process.exit(0);
}

const browser = await chromium.launch();
const page = await browser.newPage();

let total = 0;
for (const file of files) {
  const stem = file.replace(/\.png$/i, "");
  const b64 = fs.readFileSync(path.join(STAGING, file)).toString("base64");
  const cropTop = cropMap[stem] ?? null;
  const webpB64 = await page.evaluate(async ({ data, cropTop, quality }) => {
    const img = new Image();
    img.src = "data:image/png;base64," + data;
    await img.decode();
    const w = img.naturalWidth;
    const h = cropTop ? Math.min(cropTop, img.naturalHeight) : img.naturalHeight;
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    c.getContext("2d").drawImage(img, 0, 0, w, h, 0, 0, w, h);
    return c.toDataURL("image/webp", quality).split(",")[1];
  }, { data: b64, cropTop, quality: QUALITY });

  const outPath = path.join(OUT, stem + ".webp");
  fs.writeFileSync(outPath, Buffer.from(webpB64, "base64"));
  fs.unlinkSync(path.join(STAGING, file));
  const kb = Math.round(fs.statSync(outPath).size / 1024);
  total += fs.statSync(outPath).size;
  console.log(`  ${stem}.webp  ${kb}KB${cropTop ? `  (cropped to ${cropTop}px)` : ""}`);
}

await browser.close();
console.log(`\nDone: ${files.length} images → WebP (${Math.round(total / 1024)}KB total) in ${OUT}.`);
