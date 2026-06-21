/**
 * Pure decision logic for the chat "read AI replies aloud" feature.
 *
 * The chat overlay is mounted once and history is loaded into it, so the naive
 * "speak the latest assistant message" effect would read the *previous* reply
 * sitting at the bottom every time the chat opens. That's not wanted — auto-read
 * should only voice a reply that arrives WHILE the chat is open.
 *
 * `reduceAutoRead` captures that as a tiny state machine the component drives
 * from a ref:
 *   - While closed or (re)loading history → never speak, and re-prime.
 *   - First settled render after opening → adopt the current tail as
 *     already-heard (prime) without speaking it.
 *   - After that → speak only a genuinely new assistant reply (a tail whose
 *     `_key` differs from the last one we spoke), skipping the welcome stub.
 */

export interface AutoReadState {
  /** `_key` of the last message we actually spoke (or primed as already-heard). */
  lastSpokenKey: string | null;
  /** Whether we've adopted the existing tail for the current open session. */
  primed: boolean;
}

export interface AutoReadInput {
  /** `_key` of the current last message, or null if there is none. */
  tailKey: string | null;
  /** Role of the current last message. */
  tailRole: string | null;
  /** Content of the current last message. */
  tailContent: string | null;
  /** `voice_settings.auto_read_assistant_replies`. */
  autoRead: boolean;
  /** Chat overlay open. */
  isOpen: boolean;
  /** Initial / re-fetch of chat history in flight. */
  isLoadingHistory: boolean;
  /** A reply is currently being generated (per-turn loading). */
  isLoading: boolean;
  /** The welcome-message content, which must never be auto-read. */
  welcomeContent: string;
}

export const initialAutoReadState: AutoReadState = {
  lastSpokenKey: null,
  primed: false,
};

/**
 * Given the previous state and the current render's inputs, return the next
 * state and whether the current tail should be read aloud now.
 */
export function reduceAutoRead(
  state: AutoReadState,
  input: AutoReadInput,
): { state: AutoReadState; speak: boolean } {
  // Closed or (re)loading: never speak, and re-prime so the tail that's there
  // when we next settle is treated as existing (not a fresh arrival).
  if (!input.isOpen || input.isLoadingHistory) {
    return { state: { ...state, primed: false }, speak: false };
  }

  if (!input.autoRead) return { state, speak: false };

  // First settled render after opening / reloading: adopt the existing tail as
  // already-heard so the previous reply isn't read on open.
  if (!state.primed) {
    return { state: { lastSpokenKey: input.tailKey, primed: true }, speak: false };
  }

  // From here on, only genuinely new assistant replies get spoken.
  if (input.tailRole !== "assistant" || !input.tailContent || !input.tailKey) {
    return { state, speak: false };
  }
  if (input.tailKey === state.lastSpokenKey) return { state, speak: false };
  if (input.isLoading) return { state, speak: false };

  // The welcome stub never changes — mark it seen but don't speak it.
  if (input.tailContent === input.welcomeContent) {
    return { state: { ...state, lastSpokenKey: input.tailKey }, speak: false };
  }

  return { state: { lastSpokenKey: input.tailKey, primed: true }, speak: true };
}
