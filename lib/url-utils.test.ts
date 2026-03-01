import { describe, expect, it } from "vitest";
import { getDomainFromUrl, getFaviconUrl } from "./url-utils";

describe("url-utils", () => {
  it("returns unknown domain for invalid URLs", () => {
    expect(getDomainFromUrl("not a valid url")).toBe("unknown");
  });

  it("returns fallback favicon URL for invalid source URL", () => {
    expect(
      getFaviconUrl({
        content: "",
        source: "web",
        title: "Example",
        url: "not a valid url",
      })
    ).toBe("https://www.google.com/s2/favicons?sz=128");
  });
});
