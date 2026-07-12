# Plan — Per-task model routing policy for this repo

**Goal:** decide which Claude model family + effort level handles which category of development work, and wire that policy in via Claude Code's native mechanisms (per-agent `model:` / `effort:` frontmatter in `.claude/agents/`, plus routing rules in `CLAUDE.md`), so both interactive work and the overnight orchestration read from one source of truth.

**Scope guard:** this task changes **only** config + docs (`.claude/agents/*.md`, `CLAUDE.md`, the two `scripts/*.js` orchestrators, `.claude/uiux-plan.json` schema). **No application code** (`src/`, `supabase/`) changes.

**Model aliases** (resolve to the newest in each family): `opus` → Opus 4.8 · `sonnet` → Sonnet 5 · `haiku` → Haiku 4.5 · `fable` → Fable 5 (top-tier, above Opus). Capability order for routing: **fable > opus > sonnet > haiku**.

---

## Step 1 — Audit of current model routing (before any change)

There are **two** overnight orchestrators driving **four** UI/UX agents. There is **no** general-purpose dev routing and **no** routing policy in `CLAUDE.md` today.

### Agents (`.claude/agents/`)

| Agent | Current `model:` | `effort:` | Tools | Role |
|---|---|---|---|---|
| `uiux-planner` | `claude-opus-4-5` | (none) | Read, Glob, Grep | Read-only UI audit → `uiux-plan.json` |
| `uiux-implementer` | `claude-sonnet-4-5` | (none) | Read, Write, Edit | Applies plan steps to one file at a time |
| `ui-scorer` | `claude-opus-4-5` | (none) | Read | Scores one file vs 11 criteria → `ui-score-report.json` |
| `ui-fixer` | `claude-sonnet-4-6` | (none) | Read, Edit, Write | Fixes criteria scoring < 9 in one file |

### Orchestrators (`scripts/`)

- **`uiux-overnight.js`** — Phase 1 spawns `claude -p … --agent uiux-planner`; Phase 2 loops pending files sequentially, spawning `claude -p … --agent uiux-implementer` per file, writing `status: done|error` + `completedAt` after each (this is the resume mechanism, driven by `--resume`).
- **`ui-score.js`** — Phase 1 scores each file under `src/components` + `src/pages` via `--agent ui-scorer`; Phase 2 fixes files below a threshold (default 9.0) via `--agent ui-fixer`, writing `status: fixed|error` per file.

### Findings

1. **Model is already frontmatter-driven on the happy path.** Neither script passes `--model` on the CLI; they pass `--agent <name>` and let the agent's `model:` frontmatter decide. So "single source of truth = frontmatter" is *already mostly true* for the two pipelines. Good foundation.
2. **Stale / likely-invalid pinned model IDs.** All four agents pin specific old versions (`claude-opus-4-5`, `claude-sonnet-4-5`, `claude-sonnet-4-6`). Current families are Opus **4.8**, Sonnet **5**, Haiku **4.5**, Fable **5** — so these IDs are outdated (and `claude-sonnet-4-6` never existed). Pinned stale IDs risk CLI errors or silent fallback. **Switching to aliases fixes this permanently** and is exactly what the task asks for.
3. **No `effort:` set anywhere.** Every agent runs at default effort.
4. **No routing policy in `CLAUDE.md`.** The interactive orchestrator has no documented rule for which model handles planning vs routine vs review vs deploy, so all interactive dev currently runs on whatever the session model is.
5. **Fallback paths bypass the policy.** Both scripts have a `catch` fallback that strips the frontmatter and runs `claude -p` with **no `--agent` and no `--model`** → that path silently loses the assigned model and runs on the CLI default. This is the one place the policy leaks.
6. **No complexity signal in `uiux-plan.json`.** The implementer treats every file identically (always Sonnet); there is no per-item hint to escalate net-new/structural work vs routine polish.
7. **Overnight flow is already deploy-safe.** Neither script runs `npm run deploy`, `git push`, or `supabase db push` — they only spawn edit-only agents. Deploys happen only via human-invoked `npm run deploy` (`scripts/deploy.mjs`), which self-gates on typecheck + schema + maintenance mode.

---

## Step 2 — Proposed routing policy (for approval)

| # | Task category | Model | Effort | One-line justification |
|---|---|---|---|---|
| 1 | Planning / architecture / feature breakdown | **opus** | **high** | Judgment-heavy, low-volume; worth the strongest reasoning. Escalate to **fable** for large cross-cutting designs. |
| 2 | Implementing new features (net-new, non-trivial logic) | **opus** | **medium** | Real integration judgment. **Complexity-dependent** — see escalation. |
| 3 | Routine development (small changes, wiring, pattern refactors) | **sonnet** | **medium** | Pattern-following, higher volume; strong-enough and faster/cheaper. |
| 4 | Writing tests | **sonnet** | **medium** | Follows the three-tier conventions (Vitest/Deno/Playwright); mostly mechanical. |
| 5 | Running tests + parsing failures | **haiku** | **low** | Running + first-pass triage is mechanical. Escalate diagnosis to sonnet/opus on a real (non-flake) failure. |
| 6 | Running deploys (supabase diff / push) | **haiku** | **low** | Mechanical command execution. Stays behind the human-confirm gate regardless of model. |
| 7 | Code review of freshly written code | **opus** | **high** | Adversarial judgment; **must be a fresh agent, not the writer**. Escalate to **fable** for auth/RLS/money/data-integrity diffs. |
| 8 | Summarization / classification / log parsing / extraction | **haiku** | **low** | High-volume, low-judgment; cheapest/fastest. |

### Complexity-dependent categories + runtime escalation

- **#2 Implementing new features** — default **opus/medium**; drop to **sonnet/medium** when the change clearly follows an existing pattern; bump to **opus/high** (or **fable**) when logic is novel, cross-cutting, or touches data model / RLS / edge auth / migrations.
- **#5 Running tests** — run on **haiku**; if a failure isn't an obvious flake/typo, hand the *diagnosis* to **sonnet** (routine) or **opus** (subtle logic / race).
- **#7 Code review** — **sonnet** for small pattern-following diffs; **opus/high** default; **fable** for security-/auth-/RLS-/money-/data-sensitive diffs.

**Orchestrator decision rule (documented in CLAUDE.md):** default each task to its row; **escalate one tier** when (a) scope is unclear, (b) the diff touches money/auth/RLS/data-model/migrations, or (c) a cheaper model already failed once. **De-escalate** when the task repeats an established pattern. When in doubt on planning or review, prefer the stronger model — the cost delta is negligible on low-volume, high-value work.

---

## Step 3 — Implementation (only after the table is approved)

### 3a. Update the four existing agents (aliases + effort)

| Agent | New `model:` | New `effort:` | Maps to category |
|---|---|---|---|
| `uiux-planner` | `opus` | `high` | #1 Planning (UI audit) |
| `uiux-implementer` | `sonnet` | `medium` | #3 Routine dev |
| `ui-scorer` | `opus` | `high` | #7 Review (evaluative) — *flag: high-volume, the one premium-per-file spot; drop to `sonnet` if cost matters* |
| `ui-fixer` | `sonnet` | `medium` | #3 Routine dev |

### 3b. New specialist agents (lean set)

- **`code-reviewer.md`** — `model: opus`, `effort: high`, tools **Read, Grep, Glob, Bash** (no Edit/Write — review only). **Required** by the "fresh reviewer, not the writer" guardrail; a CLAUDE.md rule can't provide the fresh context an agent does.
- **`test-writer.md`** — `model: sonnet`, `effort: medium`, tools Read, Write, Edit, Bash. Encodes the mandatory three-tier testing + `data-testid` conventions so they don't have to be re-stated each time.
- **`test-runner.md`** — `model: haiku`, `effort: low`, tools Read, Bash. Runs suites, parses failures, escalates real diagnosis upward.
- **No `deploy-runner` agent** (deliberate). Deploys must stay behind an explicit human confirmation and already self-gate inside `scripts/deploy.mjs`. Wrapping deploy in an auto-delegable agent would risk weakening that gate. Deploy stays a **documented, human-invoked CLAUDE.md rule** on a cheap model — this is the "better served by a rule than an agent" call the task asks me to flag.

### 3c. Add a "Model Routing Policy" section to `CLAUDE.md`

The Step 2 table + escalation rules + two standing guardrails: (i) deploys/destructive actions stay behind human confirmation regardless of model; (ii) code review always uses a fresh `code-reviewer` agent, never the model instance that wrote the code.

---

## Step 4 — Wire the policy into the overnight orchestration

Design principle: **model lives only in agent frontmatter.** Escalation picks *which agent* to spawn, never a hardcoded `--model`, so editing the policy in one place (frontmatter / CLAUDE.md) updates interactive **and** overnight runs.

1. **Planner tags complexity.** Add `"complexity": "routine" | "feature"` to each `uiux-plan.json` item; update `uiux-planner.md` to emit it (routine = styling/copy/a11y polish; feature = structural/logic/new-component work).
2. **Implementer honours the tag.** `runImplementers()` picks `--agent uiux-implementer` (sonnet, routine) vs a stronger feature agent (opus) per item, based on `complexity`. Model still comes from that agent's frontmatter.
3. **Fix the fallback leak.** In both scripts' `catch` fallbacks, parse `model:` out of the agent frontmatter and pass it as `--model` so the fallback still honours the policy instead of silently using the CLI default.
4. **Preserve resume/progress.** `complexity` is additive; the `status` machine is untouched. Model resolves per-spawn at call time, so changing the policy between resume runs only affects *remaining* items — it never corrupts or resets existing `status`/`completedAt`.
5. **Keep overnight unattended-safe.** Documented invariant: the overnight flow spawns only edit-only agents and must **never** trigger deploy/destructive categories (#6). No 3am human = no deploy. Confirmed true today; will stay enforced by not giving overnight agents deploy tooling.

---

## Files this task will touch

- `.claude/agents/uiux-planner.md`, `uiux-implementer.md`, `ui-scorer.md`, `ui-fixer.md` (frontmatter)
- `.claude/agents/code-reviewer.md`, `test-writer.md`, `test-runner.md` (new)
- `CLAUDE.md` (new "Model Routing Policy" section)
- `scripts/uiux-overnight.js` (complexity dispatch + fallback fix)
- `scripts/ui-score.js` (fallback fix)
- `.claude/uiux-plan.json` (schema gains `complexity`; regenerated by planner)

No `src/` or `supabase/` changes. No new npm deps.

## Open questions for approval

1. **Planning/review top tier** — keep **opus/high** as default and reserve **fable** for the hardest cases (my recommendation), or set **fable** as the default for planning + security review?
2. **`ui-scorer` cost** — keep it on **opus** (best scoring quality, but runs per-file across all of components + pages), or drop to **sonnet** to cut the high-volume cost?
3. **Agent set size** — create all three new agents (`code-reviewer` + `test-writer` + `test-runner`), or only the **`code-reviewer`** (required) and leave test-writing/running as CLAUDE.md rules to keep the set lean?
4. **Effort ceiling** — I've stayed within low/medium/high. Want me to use **xhigh** for planning/review of genuinely large or safety-critical work, or keep the ceiling at high?

---

## Delivered (2026-07-12)

Approved: (1) opus/high default with fable reserved for the hardest cases; (2) `ui-scorer` stays on opus; (3) all three new agents + the `uiux-feature-implementer` needed by Step 4; (4) xhigh as the escalation ceiling.

**Agents (`.claude/agents/`)** — switched all four existing agents off stale pinned IDs onto family aliases + added `effort:`:
- `uiux-planner` → `opus` / `high`; `ui-scorer` → `opus` / `high`; `uiux-implementer` → `sonnet` / `medium`; `ui-fixer` → `sonnet` / `medium`.
- New: `code-reviewer` (`opus`/`high`, read-only: Read/Grep/Glob/Bash), `test-writer` (`sonnet`/`medium`), `test-runner` (`haiku`/`low`, read-only: Read/Bash), `uiux-feature-implementer` (`opus`/`medium`).

**CLAUDE.md** — new **Model Routing Policy** section (routing table + one-tier escalation rule with effort-then-model ladder up to xhigh/fable + specialist-agent list + guardrails: deploy stays human-gated with no deploy agent, review always uses a fresh reviewer, overnight never deploys).

**Overnight wiring (Step 4)** — `uiux-planner` now emits a required `"complexity": "routine" | "feature"` per plan item; `uiux-overnight.js` `runImplementers()` dispatches `feature` → `uiux-feature-implementer` (Opus) and `routine`/absent → `uiux-implementer` (Sonnet), logging the tag. Model still resolves from each agent's frontmatter, so the policy stays single-source across interactive + overnight. Both scripts' `catch` fallbacks (which drop `--agent`) now parse `model:` from the agent frontmatter and pass `--model`, closing the leak where they silently ran on the CLI default. Resume/progress untouched — `complexity` is additive, absent tag defaults to routine, and per-spawn model resolution means a policy change between resume runs only affects remaining items.

**Verified:** `node --check` passes on both scripts; all 8 agents carry a valid `model:`+`effort:`; zero stale model IDs remain under `.claude/`. No `src/` or `supabase/` changes — this is dev-tooling config, so the app's test/app-reference mandates don't apply (there is no app surface or test tier for agent frontmatter).

**Not done (deliberate):** no `deploy-runner` agent — deploy stays a human-gated CLAUDE.md rule (an auto-delegable deploy agent would risk weakening the confirmation gate).
