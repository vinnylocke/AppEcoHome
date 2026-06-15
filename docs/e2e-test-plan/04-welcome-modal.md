# 4. Welcome Modal

**Spec file:** `tests/e2e/specs/welcome-modal.spec.ts`
**Page Object:** `tests/e2e/pages/WelcomeModalPage.ts`
**Fixture:** `tests/e2e/fixtures/welcome-modal-ready.ts` — mocks profile with `home_id` set but no welcome_modal status, and empty locations.
**Seed dependencies:** `00_bootstrap.sql` (auth user only)
**App-reference:** [01-onboarding/03-welcome-modal.md](../app-reference/01-onboarding/03-welcome-modal.md)

## Tests

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| R3-001 | ✅ | Modal mounts when trigger conditions hold — 5 dots visible | profile + locations | ✅ Passing |
| R3-002 | ✅ | Step through slides 0 → 4 — Next cycles all 5 titles; final shows CTA | profile + locations | ✅ Passing |
| R3-003 | ✅ | Back disabled on first slide | profile + locations | ✅ Passing |
| R3-004 | ✅ | Dot indicators jump to slide — click dot(2) → "Tasks that run themselves" | profile + locations | ✅ Passing |
| R3-005 | ✅ | Persona slide tracks selection — aria-pressed flips between cards | profile + locations | ✅ Passing |
| R3-006 | ✅ | Skip issues `dismissed` PATCH and closes | PATCH capture | ✅ Passing |
| R3-007 | ✅ | Start Quiz issues `completed` PATCH + navigates to `/profile` | PATCH capture | ✅ Passing |
| R3-008 | ✅ | Persona is included in PATCH body (`experienced` + `welcomed_at`) | PATCH capture | ✅ Passing |
| R3-009 | ✅ | Focus trap loops within dialog (10× Tab stays inside `[role=dialog]`) | profile + locations | ✅ Passing |
