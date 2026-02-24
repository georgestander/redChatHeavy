import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@/lib/ai/types";
import { applyExcerptContextToPreviousMessages } from "@/lib/branching/context-policy";

function makeMessage(input: {
  id: string;
  branchId: string;
  createdAt: string;
  parentMessageId?: string | null;
  role?: "user" | "assistant";
}): ChatMessage {
  return {
    id: input.id,
    role: input.role ?? "assistant",
    parts: [{ type: "text", text: input.id }],
    metadata: {
      createdAt: new Date(input.createdAt),
      parentMessageId: input.parentMessageId ?? null,
      branchId: input.branchId,
      selectedModel: "openai/gpt-5-nano",
      activeStreamId: null,
    },
  };
}

describe("applyExcerptContextToPreviousMessages", () => {
  it("returns unchanged messages when excerpt is blank", () => {
    const previousMessages = [
      makeMessage({ id: "m1", branchId: "root", createdAt: "2026-01-01T00:00:00.000Z" }),
    ];

    const context = applyExcerptContextToPreviousMessages({
      previousMessages,
      branchId: "child",
      excerpt: "   ",
    });

    expect(context).toEqual(previousMessages);
  });

  it("keeps only target-branch messages and appends synthetic excerpt", () => {
    const previousMessages = [
      makeMessage({ id: "m1", branchId: "root", createdAt: "2026-01-01T00:00:00.000Z", role: "user" }),
      makeMessage({
        id: "m2",
        branchId: "root",
        parentMessageId: "m1",
        createdAt: "2026-01-01T00:01:00.000Z",
      }),
      makeMessage({
        id: "c1",
        branchId: "child",
        parentMessageId: "m2",
        createdAt: "2026-01-01T00:02:00.000Z",
        role: "user",
      }),
    ];

    const context = applyExcerptContextToPreviousMessages({
      previousMessages,
      branchId: "child",
      excerpt: "selected only",
    });

    expect(context.map((message) => message.id)).toEqual([
      "c1",
      "branch-excerpt-child",
    ]);
    expect(context[1]?.metadata.parentMessageId).toBe("c1");
  });

  it("uses only synthetic excerpt when branch has no own history", () => {
    const previousMessages = [
      makeMessage({ id: "m1", branchId: "root", createdAt: "2026-01-01T00:00:00.000Z" }),
    ];

    const context = applyExcerptContextToPreviousMessages({
      previousMessages,
      branchId: "child",
      excerpt: "selected only",
    });

    expect(context.map((message) => message.id)).toEqual(["branch-excerpt-child"]);
    expect(context[0]?.metadata.parentMessageId).toBeNull();
  });
});
