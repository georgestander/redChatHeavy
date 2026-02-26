import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@/lib/ai/types";
import { getTextContentFromMessage } from "@/lib/branching/message-text";

function makeMessage(parts: ChatMessage["parts"]): ChatMessage {
  return {
    id: "m1",
    role: "assistant",
    parts,
    metadata: {
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      parentMessageId: null,
      branchId: "root",
      selectedModel: "openai/gpt-5-nano",
      activeStreamId: null,
    },
  };
}

describe("getTextContentFromMessage", () => {
  it("joins text parts and ignores non-text parts", () => {
    const message = makeMessage([
      { type: "text", text: "first" },
      {
        type: "reasoning",
        text: "internal",
      },
      { type: "text", text: "second" },
    ] as ChatMessage["parts"]);

    expect(getTextContentFromMessage(message)).toBe("first\nsecond");
  });

  it("preserves leading and trailing whitespace when trim is disabled", () => {
    const message = makeMessage([
      { type: "text", text: "  first" },
      { type: "text", text: "second  " },
    ] as ChatMessage["parts"]);

    expect(getTextContentFromMessage(message, { trim: false })).toBe(
      "  first\nsecond  "
    );
  });
});
