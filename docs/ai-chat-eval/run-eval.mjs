/**
 * Garden AI chat — evaluation runner (versioned).
 *
 * Runs every conversation in question-bank.mjs against the DEPLOYED agent-chat
 * function as the demo account, and writes a timestamped, app-version-stamped
 * run file to ./runs/. Read tools run live; mutations are captured as proposed
 * confirm cards (never executed) so the demo garden is unchanged.
 *
 * Usage (from project root):
 *   RHOZLY_DEMO_PASS=... [RHOZLY_EVAL_LABEL="post-fix"] node docs/ai-chat-eval/run-eval.mjs
 *
 * Then rate the run (agents) + merge ratings into the run file, and rebuild the
 * report with:  node docs/ai-chat-eval/build-report.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync, readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { CONVERSATIONS } from "./question-bank.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const RUNS = resolve(HERE, "runs");
mkdirSync(RUNS, { recursive: true });

const URL = "https://yiuuzlfhtsxbspdyibam.supabase.co";
const KEY = "sb_publishable_HDBdrlKd8HMPHto0E6i5QA_nbIPe-3K";

function appVersion() {
  // public/build-version.json is written by the deploy; reflects the live build.
  try { return JSON.parse(readFileSync(resolve(HERE, "../../public/build-version.json"), "utf8")).version ?? "unknown"; }
  catch { return "unknown"; }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const runAt = new Date().toISOString();
  const version = appVersion();
  const label = process.env.RHOZLY_EVAL_LABEL ?? "";

  const sb = createClient(URL, KEY);
  const { data: auth, error: authErr } = await sb.auth.signInWithPassword({
    email: "test.rhozly+demo@rhozly.com", password: process.env.RHOZLY_DEMO_PASS,
  });
  if (authErr) { console.error("sign-in failed:", authErr.message); process.exit(1); }
  const { data: profile } = await sb.from("user_profiles").select("home_id").eq("uid", auth.user.id).single();
  const homeId = profile.home_id;
  console.log(`run ${runAt} · v${version} · ${CONVERSATIONS.length} conversations`);

  const results = [];
  let n = 0;
  for (const conv of CONVERSATIONS) {
    const turns = [];
    const history = [];
    for (const q of conv.turns) {
      let reply = "", tools = [], pending = [], plants = [], err = null;
      try {
        const { data, error } = await sb.functions.invoke("agent-chat", {
          body: { action: "send_message", homeId, message: q, history },
        });
        if (error) throw error;
        reply = String(data?.reply ?? "");
        tools = (data?.toolResults ?? []).map((t) => ({ tool: t.tool, summary: t.summary }));
        pending = (data?.pendingToolCalls ?? []).map((p) => ({ tool: p.tool, preview: p.preview }));
        plants = (data?.suggested_plants ?? []).map((p) => p.name);
      } catch (e) { err = e.message ?? String(e); }
      turns.push({ q, reply, tools, pending, plants, err });
      history.push({ role: "user", parts: [{ text: q }] });
      history.push({ role: "model", parts: [{ text: reply }] });
      n++; process.stdout.write(`\r  ${n} turns…`);
      await sleep(700);
    }
    results.push({ id: conv.id, persona: conv.persona, cat: conv.cat, expect: conv.expect, turns });
  }

  const safeStamp = runAt.replace(/[:.]/g, "-");
  const out = resolve(RUNS, `run-${version}_${safeStamp}.json`);
  writeFileSync(out, JSON.stringify({
    meta: { runAt, appVersion: version, label, conversations: results.length, turns: n },
    results,
  }, null, 2));
  console.log(`\nDONE → ${out}`);
  process.exit(0);
}
main();
