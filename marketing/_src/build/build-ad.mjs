/**
 * Assembles the advertising videos (60s master + 30s cut) from:
 *   - walkthrough clips   marketing/videos/walkthroughs/*.mp4
 *   - brand cards/captions marketing/videos/_cards/*.png
 *   - phone screenshots    marketing/_src/captures/*.png (Ken Burns)
 *
 *   node marketing/_src/build/build-ad.mjs
 *
 * Output: marketing/videos/rhozly-ad-60s.mp4 and rhozly-ad-30s.mp4
 * (1080×1920 portrait, 30 fps, silent — drop a licensed music track on the
 * timeline in any editor; see marketing/videos/README.md).
 */
import ffmpeg from "ffmpeg-static";
import { execFileSync } from "child_process";
import { mkdirSync, rmSync, existsSync } from "fs";
import { resolve, join } from "path";

const VID = resolve("marketing/videos");
const WT = join(VID, "walkthroughs");
const CARDS = join(VID, "_cards");
const SHOTS = resolve("marketing/_src/captures");
const TMP = join(VID, "_seg");
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });

const BG = "0x063d28";
const FPS = 30;
const XF = 0.4; // crossfade seconds

function ff(args) {
  execFileSync(ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", ...args], { stdio: "inherit" });
}

function probeDuration(file) {
  try { execFileSync(ffmpeg, ["-i", file], { stdio: "pipe" }); return 0; }
  catch (e) {
    const m = e.stderr?.toString().match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
    if (!m) throw new Error("cannot probe " + file);
    return (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]);
  }
}

// Normalise any source into a 1080×1920@30 segment.
// kind: card | clip | still  ·  cap: caption overlay png or null
function buildSegment(out, spec) {
  const capIn = spec.cap ? [join(CARDS, `${spec.cap}.png`)] : [];
  if (spec.kind === "card") {
    ff(["-loop", "1", "-t", `${spec.dur}`, "-i", join(CARDS, `${spec.src}.png`),
      "-vf", `scale=1080:1920,fps=${FPS},setsar=1,format=yuv420p`,
      "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-an", out]);
    return spec.dur;
  }
  if (spec.kind === "still") {
    const frames = Math.round(spec.dur * FPS);
    const filters = [
      `scale=-2:1560:flags=lanczos`,
      `pad=1080:1920:(ow-iw)/2:140:color=${BG}`,
      `zoompan=z='min(1.0+0.10*on/${frames},1.10)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1080x1920:fps=${FPS}`,
    ];
    const args = ["-loop", "1", "-t", `${spec.dur}`, "-i", join(SHOTS, `${spec.src}.png`), ...capIn.flatMap((c) => ["-i", c])];
    const graph = spec.cap
      ? `[0:v]${filters.join(",")}[bg];[bg][1:v]overlay=0:0,setsar=1,format=yuv420p[v]`
      : `[0:v]${filters.join(",")},setsar=1,format=yuv420p[v]`;
    ff([...args, "-filter_complex", graph, "-map", "[v]", "-t", `${spec.dur}`,
      "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-an", out]);
    return spec.dur;
  }
  // clip — cut [from .. from+dur] out of a walkthrough recording
  const srcFile = join(WT, `${spec.src}.mp4`);
  const total = probeDuration(srcFile);
  const from = Math.max(0, Math.min(spec.frac * total, total - spec.dur - 0.2));
  const scalePad = `scale=-2:1560:flags=lanczos,pad=1080:1920:(ow-iw)/2:140:color=${BG}`;
  const args = ["-ss", `${from.toFixed(2)}`, "-t", `${spec.dur}`, "-i", srcFile, ...capIn.flatMap((c) => ["-i", c])];
  const graph = spec.cap
    ? `[0:v]${scalePad},fps=${FPS}[bg];[bg][1:v]overlay=0:0,setsar=1,format=yuv420p[v]`
    : `[0:v]${scalePad},fps=${FPS},setsar=1,format=yuv420p[v]`;
  ff([...args, "-filter_complex", graph, "-map", "[v]",
    "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-an", out]);
  return spec.dur;
}

// Crossfade-concat normalized segments into the final cut.
function assemble(out, segs) {
  const files = [], durs = [];
  segs.forEach((s, i) => {
    const f = join(TMP, `${out}-${String(i).padStart(2, "0")}.mp4`);
    console.log(`  seg ${i}: ${s.kind} ${s.src}${s.cap ? ` + ${s.cap}` : ""} (${s.dur}s)`);
    durs.push(buildSegment(f, s));
    files.push(f);
  });
  const inputs = files.flatMap((f) => ["-i", f]);
  let graph = "", prev = "[0:v]", elapsed = durs[0];
  for (let i = 1; i < files.length; i++) {
    const label = i === files.length - 1 ? "[v]" : `[x${i}]`;
    graph += `${prev}[${i}:v]xfade=transition=fade:duration=${XF}:offset=${(elapsed - XF).toFixed(2)}${label};`;
    prev = `[x${i}]`;
    elapsed += durs[i] - XF;
  }
  ff([...inputs, "-filter_complex", graph.slice(0, -1), "-map", "[v]",
    "-c:v", "libx264", "-preset", "slow", "-crf", "19", "-pix_fmt", "yuv420p",
    "-movflags", "+faststart", "-an", join(VID, `${out}.mp4`)]);
  console.log(`✓ ${out}.mp4 (~${elapsed.toFixed(1)}s)`);
}

// fracs tuned to the final recordings: 01 = 29.8s (dashboard 0–8, shed/plant
// 13–20), 02 = 64.8s (card appears ~52, confirm ~58), 03 = 97s (photo ~9,
// result reveal ~72+).
const AD60 = [
  { kind: "card", src: "card-open", dur: 3 },
  { kind: "clip", src: "01-core-tour", frac: 0.02, dur: 9, cap: "cap-dashboard" },
  { kind: "clip", src: "01-core-tour", frac: 0.45, dur: 7, cap: "cap-shed" },
  { kind: "clip", src: "02-garden-ai", frac: 0.72, dur: 12, cap: "cap-ai" },
  { kind: "clip", src: "03-plant-doctor-watchlist", frac: 0.76, dur: 9, cap: "cap-doctor" },
  { kind: "still", src: "phone-planner", dur: 6, cap: "cap-planner" },
  { kind: "still", src: "phone-schedule", dur: 5, cap: "cap-weekly" },
  { kind: "card", src: "card-end", dur: 5 },
];

const AD30 = [
  { kind: "card", src: "card-open", dur: 2 },
  { kind: "clip", src: "01-core-tour", frac: 0.02, dur: 6, cap: "cap-dashboard" },
  { kind: "clip", src: "02-garden-ai", frac: 0.75, dur: 9, cap: "cap-ai" },
  { kind: "clip", src: "03-plant-doctor-watchlist", frac: 0.78, dur: 5, cap: "cap-doctor" },
  { kind: "still", src: "phone-schedule", dur: 4, cap: "cap-weekly" },
  { kind: "card", src: "card-end", dur: 4 },
];

console.log("— 60s master —");
assemble("rhozly-ad-60s", AD60);
console.log("— 30s cut —");
assemble("rhozly-ad-30s", AD30);
console.log("DONE →", VID);
