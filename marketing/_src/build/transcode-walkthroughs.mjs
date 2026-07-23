/**
 * Transcodes the raw walkthrough recordings (marketing/videos/_raw/*.webm)
 * to H.264 MP4s in marketing/videos/walkthroughs/, 2× lanczos upscale for
 * crisp UI text (recordings are viewport-sized), trimming the first 0.4s
 * page-load flash. Prints each output's duration for the narration scripts.
 *
 *   node marketing/_src/build/transcode-walkthroughs.mjs
 */
import ffmpeg from "ffmpeg-static";
import { execFileSync } from "child_process";
import { mkdirSync, readdirSync } from "fs";
import { resolve, join, basename } from "path";

const RAW = resolve("marketing/videos/_raw");
const OUT = resolve("marketing/videos/walkthroughs");
mkdirSync(OUT, { recursive: true });

const files = readdirSync(RAW).filter((f) => f.endsWith(".webm"));
if (!files.length) { console.error("No .webm files in", RAW); process.exit(1); }

for (const f of files) {
  const name = basename(f, ".webm");
  const src = join(RAW, f);
  const dst = join(OUT, `${name}.mp4`);
  execFileSync(ffmpeg, [
    "-y", "-ss", "0.4", "-i", src,
    "-vf", "scale=iw*2:ih*2:flags=lanczos",
    "-c:v", "libx264", "-preset", "slow", "-crf", "20",
    "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an",
    dst,
  ], { stdio: ["ignore", "ignore", "inherit"] });
  console.log(`✓ ${name}.mp4`);
}
// ffmpeg -i (no output file) exits non-zero but prints Duration on stderr:
for (const f of readdirSync(OUT).filter((x) => x.endsWith(".mp4"))) {
  try {
    execFileSync(ffmpeg, ["-i", join(OUT, f)], { stdio: "pipe" });
  } catch (e) {
    const m = e.stderr?.toString().match(/Duration: (\d+:\d+:\d+\.\d+)/);
    console.log(`${f} — ${m ? m[1] : "?"}`);
  }
}
console.log("DONE →", OUT);
