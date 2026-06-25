# Jira Bug Workflow

**Read this file in full before doing anything with Jira tickets.** It defines the two
flows (Triage and Implementation), the status model, and the reproduction procedure.

## Connection facts

| Thing | Value |
|-------|-------|
| Site | `rhozly.atlassian.net` |
| Cloud ID | `abe9d299-5e71-490a-bc63-1d0e3d6f306e` |
| Project | `RHO` (Rhozly Development) |
| Prod app URL | `https://rhozly.com` |
| Sprout regression epic | `RHO-1` |
| Jira tooling | Atlassian MCP: `searchJiraIssuesUsingJql`, `getJiraIssue`, `getTransitionsForJiraIssue`, `transitionJiraIssue`, `addCommentToJiraIssue`, `editJiraIssue` |
| Reproduction tooling | Playwright MCP (`browser_resize`, `browser_navigate`, `browser_type`, `browser_click`, `browser_snapshot`, `browser_take_screenshot`) |

## Status model

The board uses a custom workflow. Transitions are **global** (usable from any status),
so the IDs below work regardless of current status. **If a transition fails, re-confirm
IDs with `getTransitionsForJiraIssue` — they can change if the workflow is edited.**

| Status | Transition ID | Meaning |
|--------|---------------|---------|
| To Do | `11` | New, untriaged |
| In Planning | `2` | Reproduced + plan attached, awaiting human approval |
| Plan Approved | `3` | Human approved the plan — ready to implement |
| In Progress | `21` | Being implemented |
| In Test | `31` | Fix landed, awaiting human verification |
| Done | `41` | Verified (human moves it here — **never** auto-set Done) |

---

## Flow A — Triage  *(trigger: "triage jiras", "look at the new bugs", "deal with new jiras")*

Operate on **Bug** issues in **To Do** (scoped to the named epic, default `RHO-1`),
**one at a time**. For each:

1. **Digest.** `getJiraIssue` (markdown). Read Description / Set Up / Steps / Expected /
   Actual. Extract the reproduction inputs from the Set Up block: **Username, Password,
   App Version, platform (APK/PWA/Browser), device + orientation.**
2. **Reproduce.** Drive Playwright:
   - `browser_resize` to the device viewport + orientation from Set Up (see table below).
   - `browser_navigate` to `https://rhozly.com`.
   - Log in with the ticket's **Username / Password** (never reset the account password —
     credentials live on the ticket).
   - Follow the Steps exactly; confirm whether the Actual result happens. Note any
     deviation (e.g. it's worse/different than reported, or doesn't reproduce).
3. **Evidence.** Capture a screenshot with `browser_take_screenshot`, save it under
   `docs/jira-evidence/<KEY>/` (kept out of git), then attach it to the ticket:
   `node scripts/jira-attach.mjs <KEY> docs/jira-evidence/<KEY>/<file>.png`. The Atlassian
   MCP has no upload tool, so the script hits the REST API directly (see *Attachments* below).
4. **Root-cause + plan.** Per [CLAUDE.md], read the relevant
   [docs/app-reference/](app-reference/) files **first**, then the source. Write a plan to
   `docs/plans/<KEY>-<slug>.md` covering: problem, app-reference files consulted, source
   files to change + why, the exact approach, risks/edge cases, app-reference + test docs
   to update, and the tests to add.
5. **Attach the plan.** Post a comment on the ticket (`addCommentToJiraIssue`, markdown)
   containing: reproduction result, root cause (with `file:line` refs), the **recommended
   fix** (+ any alternatives), and the path to the plan doc. This is the "plan attached"
   the human reviews.
6. **Transition → In Planning** (`transition` id `2`).
7. **Stop.** Do **not** implement. The human reviews and moves it to **Plan Approved**
   (or comments for changes).

## Flow B — Implementation  *(trigger: "fix the approved jiras", "implement approved", "work the approved bugs")*

1. **Find.** JQL: `project = RHO AND status = "Plan Approved" ORDER BY priority DESC, created ASC`.
2. **Pick one** — the one the human names, else highest-priority / oldest. **One at a time.**
3. **Read the plan first** — the plan doc `docs/plans/<KEY>-<slug>.md` **and every ticket
   comment** (the approver often answers open questions there before approving).
4. **Gate — unanswered questions.** If implementing the plan needs a decision or answer
   that isn't in the ticket (it got approved without resolving a question the plan raised),
   **do not guess**: transition the ticket **back to In Planning** (`transition` id `2`),
   add a comment listing exactly what you need answered, and **stop**. Resume only once it's
   answered and re-approved.
5. **Transition → In Progress** (`transition` id `21`).
6. **Implement** per the plan and all CLAUDE.md rules (tests mandatory, app-reference +
   e2e-test-plan docs in sync, `data-testid` on new interactive elements, never modify app
   code for tests).
7. **Add an automated test that captures the bug (mandatory).** The goal is *coverage*, not
   running a suite now: every Jira bug gets a permanent automated test that reproduces its
   scenario, so the **next full regression run** re-checks it and the bug can't silently come
   back. Reproduce the original failing condition (tier / route / state), assert the fixed
   behaviour, and assert the old broken behaviour is gone (e.g. DASH-042 asserts *no*
   full-size upsell panel renders on the Sprout dashboard). Reference the ticket ID in the
   test name/comment and add the row(s) to the matching `docs/e2e-test-plan/<NN>-<surface>.md`.
   Prefer Playwright for user-facing flows; Vitest / Deno for pure logic. **Adding the test is
   the requirement — you don't need to run the full suite now** (it runs in CI / the next
   regression pass; run the single new spec if the local stack is already up). If the scenario
   genuinely can't be automated, say so explicitly in the In-Test comment and explain why.
8. **Local test** — relevant tests (`npm run test:unit` / `test:functions` / `test:e2e` as
   applicable) + `npm run build` green.
9. **Push live** — deploy with `npm run deploy`, following [docs/deployment.md](deployment.md)
   (maintenance mode, migrations, Vercel, release notes + version bump, then `git push origin main`).
10. **Transition → In Test** (`transition` id `31`) — **only after the fix is live**. Add a
    comment noting the released version. **Never set Done** — the human verifies on-device
    and moves it to Done.
11. **Report** what changed, the released version, and how to verify.

---

## Device viewport reference

CSS viewport sizes for reproduction (extend as new devices appear in tickets):

| Device | Orientation | `browser_resize` |
|--------|-------------|------------------|
| Google Pixel Tablet | Landscape | `1280 × 800` (DPR 2) |
| Google Pixel Tablet | Portrait | `800 × 1280` |

## Bug ticket template (the format reporters fill in)

```
**Description**
<what's wrong, and why it matters>

**Set Up**
<device · orientation · tier>
**Username:** <test account email>
**Password:** <password>
**App Version:** <from the footer / Settings>
**APK or PWA or Browser:** <PWA | APK | Browser>

**Steps**
1. …
2. …

**Expected Results**
…

**Actual Results**
…
```

Notes for reporters:
- **Username/Password are required** — they're how reproduction logs in (saves changing
  passwords). Use a tier-appropriate test account.
- **App Version** lets us rule out stale-PWA-cache before digging into code.
- Screenshots are optional/welcome but not required — reproduction captures its own.

## Attachments

The Atlassian MCP can't upload files, so screenshots go up via `scripts/jira-attach.mjs`,
which POSTs to the REST attachments endpoint using `JIRA_EMAIL` + `JIRA_API_TOKEN` from
`.env` ([API tokens](https://id.atlassian.com/manage-profile/security/api-tokens)):

```
node scripts/jira-attach.mjs <ISSUE-KEY> <file> [file...]
```

To remove an attachment: `DELETE https://rhozly.atlassian.net/rest/api/3/attachment/<id>`
with the same basic auth (look up the id via `getJiraIssue ... fields=["attachment"]`).

## Related

- [CLAUDE.md](../CLAUDE.md) — planning discipline, tests, app-reference mandates
- [docs/app-reference/00-INDEX.md](app-reference/00-INDEX.md) — "what does this screen do + why"
- [docs/deployment.md](deployment.md) — deploy process (only when asked)
