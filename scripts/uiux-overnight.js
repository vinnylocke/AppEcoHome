#!/usr/bin/env node

/**
 * Rhozly — UI/UX Overnight Orchestrator
 * ───────────────────────────────────────
 * Phase 1 (Planner)  : Scans the codebase and writes .claude/uiux-plan.json
 * Phase 2 (Workers)  : Sub-agents take files from the plan one at a time and
 *                      implement the improvements, updating plan status as they go.
 *
 * Usage:
 *   node scripts/uiux-overnight.js              # full run (plan + implement)
 *   node scripts/uiux-overnight.js --plan-only  # only generate the plan
 *   node scripts/uiux-overnight.js --resume     # skip planning, continue from existing plan
 */

import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ─── Config ──────────────────────────────────────────────────────────────────

const PROJECT_ROOT = path.resolve(__dirname, '..');
const CLAUDE_DIR   = path.join(PROJECT_ROOT, '.claude');
const PLAN_FILE    = path.join(CLAUDE_DIR, 'uiux-plan.json');
const LOG_FILE     = path.join(CLAUDE_DIR, 'uiux-overnight.log');

// How long to wait (ms) before timing out each claude call
const PLANNER_TIMEOUT     = 5 * 60 * 1000;  // 5 min
const IMPLEMENTER_TIMEOUT = 10 * 60 * 1000; // 10 min

// ─── Helpers ─────────────────────────────────────────────────────────────────

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function divider(char = '─', len = 60) {
  log(char.repeat(len));
}

function runClaude(args, timeout) {
  const result = spawnSync('claude', args, {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    timeout,
    maxBuffer: 10 * 1024 * 1024, // 10 MB
  });

  if (result.error) {
    throw new Error(`Claude process error: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`Claude exited with code ${result.status}:\n${result.stderr}`);
  }

  return result.stdout;
}

// ─── Phase 1: Planner ────────────────────────────────────────────────────────

function generatePlan() {
  log('Phase 1 — Generating UI/UX plan...');

  const prompt = [
    'Use the uiux-planner agent to audit the entire codebase under src/ for UI/UX',
    'improvements. Scan every .tsx and .jsx file. Output ONLY the raw JSON array',
    '(no markdown fences, no explanation). The JSON must match the schema defined',
    'in the agent\'s instructions.',
  ].join(' ');

  let output;
  try {
    output = runClaude(
      ['-p', prompt, '--agent', 'uiux-planner', '--allowedTools', 'Read,Glob,Grep'],
      PLANNER_TIMEOUT
    );
  } catch (err) {
    // Fallback: run without --agent flag (direct -p call with agent context baked in)
    log('Agent flag failed, falling back to direct prompt...');
    const fallbackPrompt = fs.readFileSync(
      path.join(PROJECT_ROOT, '.claude', 'agents', 'uiux-planner.md'),
      'utf8'
    ).replace(/^---[\s\S]*?---\n/, '') + '\n\nNow scan the codebase and output the JSON plan.';

    output = runClaude(
      ['-p', fallbackPrompt, '--allowedTools', 'Read,Glob,Grep'],
      PLANNER_TIMEOUT
    );
  }

  // Extract the JSON array from the response
  const match = output.match(/\[[\s\S]*\]/);
  if (!match) {
    throw new Error('Planner did not return a JSON array. Raw output:\n' + output.slice(0, 500));
  }

  let plan;
  try {
    plan = JSON.parse(match[0]);
  } catch (e) {
    throw new Error('Failed to parse planner JSON: ' + e.message);
  }

  if (!Array.isArray(plan) || plan.length === 0) {
    throw new Error('Planner returned an empty plan.');
  }

  // Persist plan
  fs.mkdirSync(CLAUDE_DIR, { recursive: true });
  fs.writeFileSync(PLAN_FILE, JSON.stringify(plan, null, 2));

  log(`Plan saved → ${PLAN_FILE}`);
  log(`Files to improve: ${plan.length} (high: ${plan.filter(f => f.priority === 'high').length}, medium: ${plan.filter(f => f.priority === 'medium').length}, low: ${plan.filter(f => f.priority === 'low').length})`);

  return plan;
}

// ─── Phase 2: Implementers ───────────────────────────────────────────────────

function runImplementers(plan) {
  const pending = plan.filter(item => !item.status || item.status === 'error');
  log(`Phase 2 — Running implementers on ${pending.length} file(s)...`);

  for (let i = 0; i < pending.length; i++) {
    const item = pending[i];
    divider();
    log(`[${i + 1}/${pending.length}] ${item.file}  (priority: ${item.priority})`);
    log(`Steps: ${item.steps.join(' | ')}`);

    const stepList = item.steps
      .map((step, idx) => `${idx + 1}. ${step}`)
      .join('\n');

    const prompt = [
      `Use the uiux-implementer agent to improve the file: ${item.file}`,
      `\n\nSteps to implement:\n${stepList}`,
      `\n\nFollow the agent's rules exactly. Only touch ${item.file}.`,
    ].join('');

    try {
      const output = runClaude(
        ['-p', prompt, '--agent', 'uiux-implementer', '--allowedTools', 'Read,Write,Edit'],
        IMPLEMENTER_TIMEOUT
      );

      // Mark done and save progress
      item.status = 'done';
      item.completedAt = new Date().toISOString();
      item.agentSummary = output.trim().slice(-500); // keep last 500 chars of output
      savePlan(plan);

      log(`✓ Done: ${item.file}`);
    } catch (err) {
      item.status = 'error';
      item.error = err.message.slice(0, 300);
      savePlan(plan);
      log(`✗ Error on ${item.file}: ${err.message.slice(0, 200)}`);
      log('Continuing to next file...');
    }
  }
}

function savePlan(plan) {
  fs.writeFileSync(PLAN_FILE, JSON.stringify(plan, null, 2));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

(function main() {
  fs.mkdirSync(CLAUDE_DIR, { recursive: true });

  const args = process.argv.slice(2);
  const planOnly = args.includes('--plan-only');
  const resume   = args.includes('--resume');

  divider('═');
  log('Rhozly UI/UX Overnight Orchestrator');
  divider('═');

  try {
    let plan;

    if (resume && fs.existsSync(PLAN_FILE)) {
      plan = JSON.parse(fs.readFileSync(PLAN_FILE, 'utf8'));
      const remaining = plan.filter(f => !f.status || f.status === 'error');
      log(`Resuming existing plan — ${remaining.length} file(s) remaining`);
    } else {
      plan = generatePlan();
    }

    if (!planOnly) {
      runImplementers(plan);
    }

    divider('═');
    const done  = plan.filter(f => f.status === 'done').length;
    const error = plan.filter(f => f.status === 'error').length;
    log(`Run complete — ${done} succeeded, ${error} failed`);
    log(`Review the plan: ${PLAN_FILE}`);
    log(`Full log: ${LOG_FILE}`);
    divider('═');

  } catch (err) {
    log(`Fatal error: ${err.message}`);
    process.exit(1);
  }
})();
