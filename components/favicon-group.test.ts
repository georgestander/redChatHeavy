import { describe, expect, it } from "vitest";
import { getSafeHostname } from "./favicon-group";

describe("getSafeHostname", () => {
  it("returns hostname for valid urls", () => {
    expect(getSafeHostname("https://example.com/path")).toBe("example.com");
  });

  it("returns unknown for invalid urls", () => {
    expect(getSafeHostname("not a valid url")).toBe("unknown");
  });
});
