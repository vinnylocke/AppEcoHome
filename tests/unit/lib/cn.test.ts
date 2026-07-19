import { describe, it, expect } from "vitest";
import { cn } from "../../../src/lib/cn";

describe("cn", () => {
  it("joins and de-duplicates like clsx", () => {
    expect(cn("a", false && "b", "c")).toBe("a c");
  });

  it("later stock utilities override earlier ones in the same group", () => {
    expect(cn("text-sm", "text-xs")).toBe("text-xs");
  });

  it("consumer radius overrides beat the primitive's custom radius token", () => {
    // The reason extendTailwindMerge is configured: without it both classes
    // survive and the stylesheet emit order decides the winner.
    expect(cn("rounded-card", "rounded-2xl")).toBe("rounded-2xl");
    expect(cn("rounded-full", "rounded-card")).toBe("rounded-card");
    expect(cn("rounded-control", "rounded-chip")).toBe("rounded-chip");
  });

  it("corner-specific custom radius tokens participate in corner groups", () => {
    // ModalShell sheet mode: base rounded-card + rounded-t-card must coexist
    // (different groups), while a later rounded-t-none beats rounded-t-card.
    expect(cn("rounded-t-card", "rounded-t-none")).toBe("rounded-t-none");
    expect(cn("rounded-card", "rounded-t-card")).toBe("rounded-card rounded-t-card");
  });

  it("custom shadow tokens already merge as a shadow group", () => {
    expect(cn("shadow-card", "shadow-raised")).toBe("shadow-raised");
  });
});
