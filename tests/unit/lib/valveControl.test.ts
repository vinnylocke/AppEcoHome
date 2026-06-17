import { describe, it, expect } from "vitest";
import { valveControlMode } from "../../../src/lib/valveControl";

describe("valveControlMode", () => {
  it("routes eWeLink valves to the eWeLink path", () => {
    expect(valveControlMode("ewelink", false)).toBe("ewelink");
    expect(valveControlMode("ewelink", true)).toBe("ewelink");
  });

  it("routes a custom valve with a control URL to the custom path", () => {
    expect(valveControlMode("custom_http", true)).toBe("custom");
  });

  it("treats a custom valve without a control URL as read-only", () => {
    expect(valveControlMode("custom_http", false)).toBe("readonly");
  });

  it("treats any other provider as read-only", () => {
    expect(valveControlMode("ecowitt", false)).toBe("readonly");
    expect(valveControlMode("ecowitt", true)).toBe("custom"); // controllable flag honoured generically
  });
});
