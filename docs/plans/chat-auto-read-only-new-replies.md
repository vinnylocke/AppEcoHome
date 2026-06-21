# Chat auto-read should only speak NEW replies, not the last message on open

## Problem

With **Read AI replies aloud** enabled, opening the Garden AI chat immediately reads
the *previous* assistant reply that's sitting at the bottom of the thread. The user
only wants auto-read to fire for a reply that arrives **while the chat is open** (a
genuinely new turn), never the existing tail on open.

## Root cause

`src/components/PlantDoctorChat.tsx` (auto-read effect, ~lines 597–617):

```ts
const lastSpokenKeyRef = useRef<string | null>(null);
useEffect(() => {
  if (!autoReadReplies || !isOpen) return;
  const last = messages[messages.length - 1];
  if (last.role !== "assistant" || !last.content) return;
  if (lastSpokenKeyRef.current === last._key) return;  // only dedupes re-renders
  if (isLoading) return;
  lastSpokenKeyRef.current = last._key;
  if (last.content === WELCOME_CONTENT) return;
  tts.speak(...);
}, [messages, autoReadReplies, isOpen, isLoading]);
```

`lastSpokenKeyRef` starts `null`, so on the first run after the chat opens it does **not**
equal the existing tail's `_key` → the effect speaks it. The only exclusion is the
welcome stub. The comment claims it "only fires after `scrollToNewMsgRef` sets — i.e. a
genuinely new turn", but the code never checks `scrollToNewMsgRef`, so that guard is
fictional.

Confirmed timing: `loadHistory()` calls `setMessages(history)` (line 488) and
`setIsLoadingHistory(false)` (line 530, `finally`) in the same synchronous continuation,
so messages + `isLoadingHistory=false` land in **one commit** — meaning we can reliably
"prime" off `isLoadingHistory` settling.

## App-reference files consulted

- `docs/app-reference/05-tools/03-plant-doctor-chat.md` — read end-to-end. Documents the
  auto-read effect (line 85: "speaks each **newly-arrived** assistant reply") and the
  native read-aloud fallback chain. The documented intent ("newly-arrived") is what we're
  restoring; the code drifted from it.
- Related (no change needed): `docs/app-reference/99-cross-cutting/23-capacitor.md`
  (native TTS), `docs/app-reference/06-account/02-notifications-tab.md` (where the
  Voice toggle lives). This change is client-only effect timing — no edge function,
  data model, cron, RLS, or tier-gating touched.

## Approach

Extract the decision into a **pure reducer** and add a one-time "prime on open" step, so
the existing tail is adopted as already-heard and only later arrivals are spoken.

### 1. New `src/lib/chatAutoRead.ts` (pure, testable)

```ts
export interface AutoReadState { lastSpokenKey: string | null; primed: boolean; }
export interface AutoReadInput {
  tailKey: string | null; tailRole: string | null; tailContent: string | null;
  autoRead: boolean; isOpen: boolean; isLoadingHistory: boolean; isLoading: boolean;
  welcomeContent: string;
}
export const initialAutoReadState: AutoReadState = { lastSpokenKey: null, primed: false };

export function reduceAutoRead(state, input): { state: AutoReadState; speak: boolean } {
  // Closed or (re)loading → re-prime on next settle, never speak.
  if (!input.isOpen || input.isLoadingHistory) return { state: { ...state, primed: false }, speak: false };
  if (!input.autoRead) return { state, speak: false };
  // First settled render after open/(re)load: adopt the current tail as already-heard.
  if (!state.primed) return { state: { lastSpokenKey: input.tailKey, primed: true }, speak: false };
  // Only genuinely new assistant replies from here.
  if (input.tailRole !== "assistant" || !input.tailContent || !input.tailKey) return { state, speak: false };
  if (input.tailKey === state.lastSpokenKey) return { state, speak: false };
  if (input.isLoading) return { state, speak: false };
  if (input.tailContent === input.welcomeContent) return { state: { ...state, lastSpokenKey: input.tailKey }, speak: false };
  return { state: { lastSpokenKey: input.tailKey, primed: true }, speak: true };
}
```

Re-priming whenever closed/loading means reopening the chat (or a home-switch reload)
never re-reads the tail; sending a message produces a new `_key` that is spoken.

### 2. `src/components/PlantDoctorChat.tsx`

- Replace `lastSpokenKeyRef` with `autoReadStateRef = useRef(initialAutoReadState)`.
- Rewrite the auto-read effect to call `reduceAutoRead`, store the returned state, and
  `tts.speak(...)` only when `speak === true`. Add `isLoadingHistory` to the deps so it
  re-runs when history settles. Replace the misleading `scrollToNewMsgRef` comment.

### 3. Tests — `tests/unit/lib/chatAutoRead.test.ts` (Vitest)

Drive `reduceAutoRead` through sequences:
- Open with an existing assistant reply → **no speak** (the bug).
- Then a new reply arrives → **speak**.
- Re-render with same tail → no speak (dedup).
- Close + reopen → no speak (re-primed).
- Welcome tail → no speak. Auto-read off → no speak. `isLoading` → no speak.
- `isLoadingHistory` true → no speak (and re-primes).

## Docs to update

- `docs/app-reference/05-tools/03-plant-doctor-chat.md` — clarify (line ~85 + flow #8)
  that the reply already at the bottom is **not** re-read on open; only replies that
  arrive while open are auto-read. Note the logic now lives in `src/lib/chatAutoRead.ts`.
- `TESTING.md` — add `tests/unit/lib/chatAutoRead.test.ts` to the inventory + bump the
  unit-test count.
- `docs/e2e-test-plan/` — note the auto-read-only-new-replies behaviour on the chat
  surface row if present.

## Risks / edge cases

- **Effect re-run frequency:** the reducer is cheap + idempotent; running on every
  `messages`/flag change is fine.
- **Regenerate:** produces a fresh `_key` → correctly spoken (desired).
- **Clear conversation:** tail becomes welcome → not spoken.
- **Home-switch while open:** `isLoadingHistory` toggles → re-primes → new home's tail
  not read aloud.
- No change to on-demand `ReadAloudButton` (per-message 🔊 still works as before).
