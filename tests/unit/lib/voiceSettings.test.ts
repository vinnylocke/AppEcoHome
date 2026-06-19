import { describe, test, expect } from "vitest";
import { mergeVoiceSettings } from "../../../src/lib/voiceSettings";

describe("mergeVoiceSettings", () => {
  test("applies a patch without dropping the other field", () => {
    expect(
      mergeVoiceSettings(
        { auto_read_assistant_replies: true, preferred_voice: "en-GB-Neural2-A" },
        { preferred_voice: "en-GB-Standard-A" },
      ),
    ).toEqual({ auto_read_assistant_replies: true, preferred_voice: "en-GB-Standard-A" });

    expect(
      mergeVoiceSettings(
        { preferred_voice: "en-GB-Neural2-A" },
        { auto_read_assistant_replies: true },
      ),
    ).toEqual({ auto_read_assistant_replies: true, preferred_voice: "en-GB-Neural2-A" });
  });

  test("treats null/undefined prev as empty", () => {
    expect(mergeVoiceSettings(null, { auto_read_assistant_replies: true })).toEqual({
      auto_read_assistant_replies: true,
    });
    expect(mergeVoiceSettings(undefined, { preferred_voice: "en-GB-Standard-A" })).toEqual({
      preferred_voice: "en-GB-Standard-A",
    });
  });

  test("patch overrides the same field", () => {
    expect(
      mergeVoiceSettings({ auto_read_assistant_replies: false }, { auto_read_assistant_replies: true }),
    ).toEqual({ auto_read_assistant_replies: true });
  });
});
