import { describe, test, expect } from "vitest";
import {
  reduceAutoRead,
  initialAutoReadState,
  type AutoReadState,
  type AutoReadInput,
} from "../../../src/lib/chatAutoRead";

const WELCOME = "Hi! I'm your Garden AI.";

/** Defaults for a settled, open chat with auto-read on. */
function input(over: Partial<AutoReadInput> = {}): AutoReadInput {
  return {
    tailKey: "k1",
    tailRole: "assistant",
    tailContent: "Hello there",
    autoRead: true,
    isOpen: true,
    isLoadingHistory: false,
    isLoading: false,
    welcomeContent: WELCOME,
    ...over,
  };
}

/** Thread the reducer across a sequence of renders, collecting `speak` flags. */
function run(steps: AutoReadInput[], start: AutoReadState = initialAutoReadState) {
  let state = start;
  const spoke: boolean[] = [];
  for (const step of steps) {
    const out = reduceAutoRead(state, step);
    state = out.state;
    spoke.push(out.speak);
  }
  return { state, spoke };
}

describe("reduceAutoRead", () => {
  test("does NOT speak the existing reply that's already at the bottom on open", () => {
    // Chat opens with a prior assistant reply (k1) already loaded.
    const { spoke } = run([input({ tailKey: "k1" })]);
    expect(spoke).toEqual([false]);
  });

  test("speaks a genuinely new reply that arrives while open", () => {
    const { spoke } = run([
      input({ tailKey: "k1" }), // open + prime existing tail
      input({ tailKey: "k2" }), // new reply arrives
    ]);
    expect(spoke).toEqual([false, true]);
  });

  test("does not re-speak the same tail on re-render", () => {
    const { spoke } = run([
      input({ tailKey: "k1" }),
      input({ tailKey: "k2" }), // spoken
      input({ tailKey: "k2" }), // same tail, re-render
    ]);
    expect(spoke).toEqual([false, true, false]);
  });

  test("re-primes on close + reopen, so the last reply isn't re-read", () => {
    const { spoke } = run([
      input({ tailKey: "k1" }),                  // open, prime
      input({ tailKey: "k2" }),                  // new reply, spoken
      input({ tailKey: "k2", isOpen: false }),   // close → re-prime
      input({ tailKey: "k2" }),                  // reopen, tail unchanged → silent
    ]);
    expect(spoke).toEqual([false, true, false, false]);
  });

  test("never speaks the welcome stub", () => {
    const { spoke } = run([
      input({ tailKey: "k1" }),                            // prime
      input({ tailKey: "w1", tailContent: WELCOME }),      // welcome arrives
    ]);
    expect(spoke).toEqual([false, false]);
  });

  test("stays silent while auto-read is off", () => {
    const { spoke } = run([
      input({ tailKey: "k1", autoRead: false }),
      input({ tailKey: "k2", autoRead: false }),
    ]);
    expect(spoke).toEqual([false, false]);
  });

  test("does not speak while a reply is still generating", () => {
    const { spoke } = run([
      input({ tailKey: "k1" }),
      input({ tailKey: "k2", isLoading: true }),
    ]);
    expect(spoke).toEqual([false, false]);
  });

  test("does not speak (and re-primes) while history is loading", () => {
    // History reload mid-session, then settles on a different tail.
    const { spoke } = run([
      input({ tailKey: "k1" }),                       // open, prime k1
      input({ tailKey: "k2" }),                       // spoken
      input({ tailKey: "k9", isLoadingHistory: true }), // reload in flight → silent + re-prime
      input({ tailKey: "k9" }),                        // settles → adopt k9 as existing
    ]);
    expect(spoke).toEqual([false, true, false, false]);
  });

  test("speaks the first reply when the thread started empty (no prior tail)", () => {
    const { spoke } = run([
      input({ tailKey: null, tailRole: null, tailContent: null }), // open, empty → prime null
      input({ tailKey: "k1" }),                                    // first real reply
    ]);
    expect(spoke).toEqual([false, true]);
  });
});
