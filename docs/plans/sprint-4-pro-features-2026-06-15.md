# Sprint 4 — tooltips + pro features

Source: [docs/plans/ux-review-action-analysis-2026-06-15.md](./ux-review-action-analysis-2026-06-15.md), items 2.2 + 4.1 + 5.1.

## Items

| # | Item | Difficulty | Schema work |
|---|---|---|---|
| 2.2 | **InfoTooltip placements** — Phase 1: 5 high-value targets | S (component exists) | None |
| 4.1 | **CSV / bulk-paste plant import** — Nursery pattern → Shed | M | None (reuses plants + add-to-shed flow) |
| 5.1 | **Tokenised email invite for co-gardeners** | L | `home_invite_tokens` table + new edge function + new route + email template |

---

## Discovery findings

- **`<InfoTooltip>` already exists** ([`src/components/InfoTooltip.tsx`](src/components/InfoTooltip.tsx)) — persona-aware (dims for "experienced" users), full keyboard a11y, portal-based positioning. Already used in 10 surfaces (PlantDoctor, TheShed, OptimiseTab, BlueprintManager, PlantAssignmentModal, AuditPage, SenescenceTab, AreaRotationCard, LocationManager, OptimisationProposalCard). **Item 2.2 is purely placements** — no component build.
- **Nursery already has a bulk-paste flow** — [`BulkPasteSeedPacketsModal.tsx`](src/components/nursery/BulkPasteSeedPacketsModal.tsx) + [`lib/parseSeedPackets.ts`](src/lib/parseSeedPackets.ts) — clean two-step (paste → review → save) pattern with regex fallback for free tier and Gemini for Sage+. The Shed plant import will mirror this exactly.
- **Current join-home flow uses raw UUID paste** ([HomeManagement.tsx:1140–1183](src/components/HomeManagement.tsx#L1140-L1183)) — confirms the gap. Owner has to copy-paste the home ID via WhatsApp/SMS; invitee pastes it back. No email, no token expiry.

---

## Item 2.2 — InfoTooltip placements (Phase 1)

Pick five highest-leverage spots, each <2 lines of copy. Total file changes: 4-5 components, ~15-20 lines per insertion.

| # | Where | Copy |
|---|---|---|
| 1 | OptimiseTab — proposal scenario badge "Fragmentation" | "You have several small recurring tasks that could be merged into one schedule." |
| 2 | OptimiseTab — proposal scenario badge "Pile-up" | "Too many tasks land on the same day. The AI suggests spacing them out." |
| 3 | OptimiseTab — proposal scenario badge "Frequency Change" | "AI suggests doing this task less often or more often than your current routine." |
| 4 | Plant Doctor — Identify quota badge "free this week" | "5 free identifications per rolling 7-day window. Each ID drops off 7 days later. Upgrade to Sage for unlimited + AI diagnosis." |
| 5 | Plant Assignment Modal — "Smart Schedules" toggle | "Rhozly will suggest reminders (water, prune, harvest) based on this plant's care needs." |

(2.2 deliberately leaves the remaining 25 placements for later phases — copywriting each tooltip well takes more time than installing them.)

---

## Item 4.1 — CSV / bulk-paste plant import

**Touched files:**

| Layer | File | Change |
|---|---|---|
| Lib | `src/lib/parsePlantList.ts` *(new)* | Regex parser mirroring `parseSeedPackets`. Inputs free text; outputs `ParsedPlant[]` with `common_name + variety + quantity + notes`. |
| Edge fn | `supabase/functions/parse-plant-list/index.ts` *(new)* | Gemini-backed fuzzy parser for Sage+. Returns the same shape as the regex parser. |
| Modal | `src/components/BulkPastePlantsModal.tsx` *(new)* | Two-step paste → review modal. Mirrors `BulkPasteSeedPacketsModal` shape. |
| Shed | `src/components/TheShed.tsx` | Add "Bulk paste" entry to the Add Plant menu. Opens the new modal. |
| Event | `src/events/registry.ts` | New `EVENT.BULK_PLANT_IMPORT_COMPLETED` |
| Tests | `tests/unit/lib/parsePlantList.test.ts` *(new)* | Vitest unit tests on the regex parser |

**Parse contract:**

```ts
interface ParsedPlant {
  common_name: string;       // "Tomato", "Lavender"
  variety: string | null;    // "Sungold", "Hidcote"
  quantity: number | null;   // 3, 12
  notes: string | null;      // free-form remainder
}
```

Accepts:

```
Tomato Sungold x3
Lavender 'Hidcote' (12 plants, from RHS Wisley)
Rose Munstead - hedging, 4 plants
```

**Review step UX:** each parsed row is editable inline (common_name + variety + quantity). User taps × on rows they don't want. "Add all to Shed" runs the existing `saveToShed` flow per row, library-first then AI catalogue fork. Sage+ users see a small "✦ AI-parsed" chip; free tier sees "regex parsed" if useful.

**Tier gating:** the regex parser works for all tiers. The Gemini parser uses one of the free identify quota slots? **No** — that would be confusing. Decision: the AI bulk-paste parser is **Sage+ only** (like the AI seed-packet parser); free users get the regex path with a note that says "Upgrade for fuzzy AI parsing — easier on messy lists".

---

## Item 5.1 — Tokenised email invite

**Touched files:**

| Layer | File | Change |
|---|---|---|
| Migration | `supabase/migrations/20260718000000_home_invite_tokens.sql` *(new)* | New table with RLS + grants |
| Edge fn | `supabase/functions/create-home-invite/index.ts` *(new)* | Owner generates token + email via Resend |
| Edge fn | `supabase/functions/redeem-home-invite/index.ts` *(new)* | Signed-in user redeems token (writes home_members + marks used_at) |
| Route | `src/App.tsx` | New `/join/:token` route → `JoinHomeViaToken` component |
| Component | `src/components/JoinHomeViaToken.tsx` *(new)* | Signed-in: one-click accept. Signed-out: prompt sign-up first, then auto-redeem. |
| Component | `src/components/HomeManagement.tsx` | New "Invite by email" form on the home settings card. Disabled UUID paste box; keep it as a small "Have an invite ID instead?" expandable for legacy invites. |
| Email | `supabase/functions/_shared/inviteEmail.ts` *(new)* | Resend template HTML |
| Event | `src/events/registry.ts` | `INVITE_SENT`, `INVITE_REDEEMED`, `INVITE_EXPIRED` |

**Schema:**

```sql
CREATE TABLE public.home_invite_tokens (
  token uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  home_id uuid NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  invitee_email text NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX home_invite_tokens_email_idx ON public.home_invite_tokens (invitee_email);
CREATE INDEX home_invite_tokens_home_id_idx ON public.home_invite_tokens (home_id);
ALTER TABLE public.home_invite_tokens ENABLE ROW LEVEL SECURITY;

-- Owner can read invites for their home
CREATE POLICY "Owners read own home invites" ON public.home_invite_tokens
  FOR SELECT TO authenticated
  USING (home_id IN (
    SELECT home_id FROM home_members
    WHERE user_id = (SELECT auth.uid()) AND role = 'owner'
  ));

-- Owner can create invites for their home
CREATE POLICY "Owners create home invites" ON public.home_invite_tokens
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND home_id IN (
      SELECT home_id FROM home_members
      WHERE user_id = (SELECT auth.uid()) AND role = 'owner'
    )
  );

-- Invitee can read their own pending invite by token (allows token-based redemption page).
-- Implemented via the redeem edge function with service role, NOT a permissive RLS.

GRANT SELECT, INSERT ON TABLE public.home_invite_tokens TO authenticated;
```

**Security model:**

- Token is the UUID PK — single-use, time-limited (7 days), email-pinned.
- `redeem-home-invite` edge function runs with `service_role` and:
  1. Validates token exists + not expired + not used.
  2. Validates `auth.uid()` email matches `invitee_email` (case-insensitive).
  3. Inserts into `home_members`.
  4. Marks `used_at = now()`.
- The owner can revoke an invite by deleting its row before redemption.
- Rate limit: 10 invites per home per day.

**Out-of-scope for Phase 1 (5.1):**

- Bulk multi-invite (one email per submit only).
- Sub-permissions editor on the invite form (use role 'editor' as default; owner can promote later).
- "Resend invite" button (just create a new one).

---

## Suggested shapes

**Option A — Single PR for the whole sprint.** Risk: invite work is the biggest piece, and a bug there could roll back the safe tooltip / import work too. Recommended only if velocity is paramount.

**Option B — Split into 4a (tooltips + bulk import) and 4b (email invites). RECOMMENDED.** 4a is half-day work and ships fast. 4b gets its own attention + testing window because it introduces a new auth surface.

**Option C — Just 4a this sprint (defer 5.1).** Lowest-risk, ships the smaller wins now. Invite work waits until we have more multi-home demand.

## Risks

- **2.2 copywriting.** Tooltips age fast — write them in plain English; never reference internal terminology.
- **4.1 AI parse cost.** Sage+ uses Gemini Flash; budget impact is negligible (~£0.0005 per parse), but worth noting.
- **5.1 email deliverability.** Resend's reputation is good but invites land in cold inboxes. Make the FROM address recognisable (`invites@rhozly.com`) and include the inviter's name in the subject.
- **5.1 token bruteforce.** UUID PK is 128 bits — not bruteforceable in practice. But add a per-IP rate limit on `redeem-home-invite` as defence-in-depth.
- **5.1 stuck-redemption case.** Invitee opens the link without a Rhozly account. After sign-up, the token must survive the auth round-trip. Solution: store the token in `localStorage` before sending the user to sign-up, redeem after `onAuthStateChange` fires `SIGNED_IN`.

## Tests

- 2.2 — none needed (component is already tested).
- 4.1 — Vitest unit tests for `parsePlantList` covering: simple name, name + variety, quoted variety, quantity extraction, multi-line, empty input.
- 4.1 — Deno test for the `parse-plant-list` edge function happy path (mock Gemini).
- 5.1 — Deno tests for `create-home-invite` (token uniqueness, rate limit, owner-only).
- 5.1 — Deno tests for `redeem-home-invite` (valid, expired, used, wrong email, missing token).
- 5.1 — E2E test for the invite happy path (Playwright): owner creates invite → invitee accepts.
