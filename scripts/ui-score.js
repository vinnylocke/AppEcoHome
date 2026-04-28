#!/usr/bin/env node

/**
 * Rhozly — UI Score Orchestrator
 * ────────────────────────────────
 * Phase 1 (Scorer)  : Walks src/ and scores each UI file individually against
 *                     11 criteria, writing .claude/ui-score-report.json
 * Phase 2 (Fixer)   : For every file with normalised score < threshold,
 *                     runs the fixer agent and updates the report.
 *
 * Usage:
 *   node scripts/ui-score.js                   # full run (score + fix)
 *   node scripts/ui-score.js --score-only      # generate report, no edits
 *   node scripts/ui-score.js --fix-only        # fix from existing report
 *   node scripts/ui-score.js --threshold 8.5   # override pass threshold (default 9.0)
 */

import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ─── Config ──────────────────────────────────────────────────────────────────

const PROJECT_ROOT    = path.resolve(__dirname, '..');
const CLAUDE_DIR      = path.join(PROJECT_ROOT, '.claude');
const REPORT_FILE     = path.join(CLAUDE_DIR, 'ui-score-report.json');
const LOG_FILE        = path.join(CLAUDE_DIR, 'ui-score.log');

const SCORER_TIMEOUT  = 3 * 60 * 1000;  // 3 min per file
const FIXER_TIMEOUT   = 10 * 60 * 1000; // 10 min per file

const DEFAULT_THRESHOLD = 9.0;

// Directories under src/ to score. Skips hooks/, lib/, types/ etc.
const SCORE_DIRS = ['src/components', 'src/pages'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function divider(char = '─', len = 60) {
  log(char.repeat(len));
}

function saveReport(report) {
  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
}

function runClaude(args, timeout) {
  const result = spawnSync('claude', args, {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    timeout,
    maxBuffer: 10 * 1024 * 1024,
  });

  if (result.error) throw new Error(`Claude process error: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`Claude exited ${result.status}:\n${result.stderr}`);

  return result.stdout;
}

// Walk a directory and return relative paths to all .tsx/.jsx files
function findUIFiles() {
  const files = [];

  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && /\.(tsx|jsx)$/.test(entry.name)) {
        files.push(path.relative(PROJECT_ROOT, full).replace(/\\/g, '/'));
      }
    }
  }

  for (const dir of SCORE_DIRS) {
    walk(path.join(PROJECT_ROOT, dir));
  }

  return files.sort();
}

// ─── Phase 1: Scorer (per-file) ──────────────────────────────────────────────

function scoreFile(filePath) {
  const prompt = [
    `Score the file: ${filePath}`,
    `\n\nFollow the ui-scorer agent instructions exactly:`,
    `1. Read tailwind.config.ts for design token context.`,
    `2. Read ${filePath}.`,
    `3. Score it against all 11 criteria.`,
    `4. Output ONLY a single valid JSON object — no markdown, no explanation.`,
  ].join('');

  let output;
  try {
    output = runClaude(
      ['-p', prompt, '--agent', 'ui-scorer', '--allowedTools', 'Read'],
      SCORER_TIMEOUT
    );
  } catch (err) {
    // Fallback without --agent flag
    const agentBody = fs.readFileSync(
      path.join(CLAUDE_DIR, 'agents', 'ui-scorer.md'),
      'utf8'
    ).replace(/^---[\s\S]*?---\n/, '');

    const fallback = `${agentBody}\n\nNow score: ${filePath}\n\nOutput ONLY the JSON object.`;
    output = runClaude(
      ['-p', fallback, '--allowedTools', 'Read'],
      SCORER_TIMEOUT
    );
  }

  // Extract the JSON object from output
  const match = output.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON object in scorer output');

  const result = JSON.parse(match[0]);

  // Ensure the file field matches what we passed in
  result.file = filePath;
  result.status = null;

  return result;
}

function generateReport(existingReport = []) {
  const allFiles = findUIFiles();

  // Skip files already successfully scored in a previous partial run
  const alreadyScored = new Set(
    existingReport.filter(f => f.normalised != null).map(f => f.file)
  );
  const toScore = allFiles.filter(f => !alreadyScored.has(f));

  log(`Files found: ${allFiles.length} | Already scored: ${alreadyScored.size} | To score: ${toScore.length}`);

  const report = [...existingReport];

  for (let i = 0; i < toScore.length; i++) {
    const filePath = toScore[i];
    log(`[${i + 1}/${toScore.length}] Scoring ${filePath}...`);

    try {
      const result = scoreFile(filePath);
      report.push(result);
      saveReport(report);
      log(`  → ${result.normalised}/10  (total ${result.total}/110)`);
    } catch (err) {
      log(`  ✗ Failed to score ${filePath}: ${err.message.slice(0, 150)}`);
      // Push a placeholder so we can retry with --score-only later
      report.push({
        file: filePath,
        scores: null,
        feedback: null,
        total: null,
        normalised: null,
        status: 'score-error',
        error: err.message.slice(0, 200),
      });
      saveReport(report);
    }
  }

  return report;
}

// ─── Phase 2: Fixer ──────────────────────────────────────────────────────────

function runFixers(report, threshold) {
  const toFix = report.filter(
    f => f.normalised != null && f.normalised < threshold && (!f.status || f.status === 'error')
  );
  log(`Phase 2 — Fixing ${toFix.length} file(s) with score < ${threshold}...`);

  for (let i = 0; i < toFix.length; i++) {
    const item = toFix[i];
    divider();
    log(`[${i + 1}/${toFix.length}] ${item.file}  (score: ${item.normalised}/10)`);

    const failing = Object.entries(item.scores)
      .filter(([, v]) => v < 9)
      .map(([k, v]) => `${k}:${v}`)
      .join(', ');
    log(`  Failing: ${failing}`);

    const prompt = [
      `Use the ui-fixer agent to improve: ${item.file}`,
      `\n\nCurrent scores (out of 10 each):\n${JSON.stringify(item.scores, null, 2)}`,
      `\n\nFeedback for each criterion:\n${JSON.stringify(item.feedback, null, 2)}`,
      `\n\nFix every criterion that scores below 9. Only modify ${item.file}.`,
    ].join('');

    try {
      const output = runClaude(
        ['-p', prompt, '--agent', 'ui-fixer', '--allowedTools', 'Read,Edit,Write'],
        FIXER_TIMEOUT
      );

      item.status = 'fixed';
      item.fixedAt = new Date().toISOString();
      item.fixerSummary = output.trim().slice(-600);
      saveReport(report);
      log(`  ✓ Fixed: ${item.file}`);
    } catch (err) {
      item.status = 'error';
      item.error = err.message.slice(0, 300);
      saveReport(report);
      log(`  ✗ Error: ${err.message.slice(0, 150)}`);
    }
  }
}

// ─── Summary ─────────────────────────────────────────────────────────────────

function printSummary(report, threshold) {
  const scored = report.filter(f => f.normalised != null);
  if (scored.length === 0) { log('No files scored yet.'); return; }

  const avg = (scored.reduce((s, f) => s + f.normalised, 0) / scored.length).toFixed(1);
  const sorted = [...scored].sort((a, b) => a.normalised - b.normalised);

  divider();
  log('SCORE SUMMARY (lowest first):');
  for (const f of sorted) {
    const filled = Math.round(f.normalised);
    const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);
    const flag = f.normalised < threshold ? ' ← fix' : '';
    log(`  ${f.normalised.toFixed(1)}/10  ${bar}  ${f.file}${flag}`);
  }
  divider();
  log(`Average: ${avg}/10 | Below ${threshold}: ${scored.filter(f => f.normalised < threshold).length} | Passed: ${scored.filter(f => f.normalised >= threshold).length}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

(function main() {
  fs.mkdirSync(CLAUDE_DIR, { recursive: true });

  const args = process.argv.slice(2);
  const scoreOnly = args.includes('--score-only');
  const fixOnly   = args.includes('--fix-only');
  const threshIdx = args.indexOf('--threshold');
  const threshold = threshIdx !== -1 ? parseFloat(args[threshIdx + 1]) : DEFAULT_THRESHOLD;

  if (isNaN(threshold) || threshold < 0 || threshold > 10) {
    console.error('Invalid --threshold. Must be 0–10.');
    process.exit(1);
  }

  divider('═');
  log('Rhozly UI Score Orchestrator');
  log(`Pass threshold: ${threshold}/10`);
  divider('═');

  try {
    let report;

    if (fixOnly) {
      if (!fs.existsSync(REPORT_FILE)) throw new Error('No report found. Run without --fix-only first.');
      report = JSON.parse(fs.readFileSync(REPORT_FILE, 'utf8'));
      log(`Loaded existing report — ${report.length} entries`);
    } else {
      // Resume a partial scoring run if the report already exists
      const existing = fs.existsSync(REPORT_FILE)
        ? JSON.parse(fs.readFileSync(REPORT_FILE, 'utf8'))
        : [];
      report = generateReport(existing);
    }

    if (!scoreOnly) {
      runFixers(report, threshold);
    }

    printSummary(report, threshold);

    divider('═');
    const fixed  = report.filter(f => f.status === 'fixed').length;
    const errors = report.filter(f => f.status === 'error').length;
    log(`Done — fixed: ${fixed} | errors: ${errors}`);
    log(`Report: ${REPORT_FILE}`);
    log(`Log:    ${LOG_FILE}`);
    divider('═');

  } catch (err) {
    log(`Fatal: ${err.message}`);
    process.exit(1);
  }
})();
