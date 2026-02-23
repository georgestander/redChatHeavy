import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@/lib/ai/types";
import { getBranchThread } from "@/lib/branching/compare-thread";
import type { ChatBranch } from "@/lib/db/schema";

function makeBranch(input: {
  id: string;
  parentBranchId?: string | null;
  headMessageId?: string | null;
  createdFromMessageId?: string | null;
  createdAt: string;
}): ChatBranch {
  return {
    id: input.id,
    chatId: "chat-1",
    parentBranchId: input.parentBranchId ?? null,
    title: input.id,
    createdFromMessageId: input.createdFromMessageId ?? null,
    createdFromStart: null,
    createdFromEnd: null,
    createdFromExcerpt: null,
    headMessageId: input.headMessageId ?? null,
    createdAt: new Date(input.createdAt),
    archivedAt: null,
  };
}

function makeMessage(input: {
  id: string;
  parentMessageId?: string | null;
  branchId: string;
  createdAt: string;
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

describe("getBranchThread", () => {
  it("uses branch head message when available", () => {
    const branches = [
      makeBranch({ id: "root", headMessageId: "m2", createdAt: "2026-01-01T00:00:00.000Z" }),
    ];
    const messages = [
      makeMessage({ id: "m1", branchId: "root", createdAt: "2026-01-01T00:00:00.000Z", role: "user" }),
      makeMessage({
        id: "m2",
        parentMessageId: "m1",
        branchId: "root",
        createdAt: "2026-01-01T00:01:00.000Z",
      }),
    ];

    const thread = getBranchThread(messages, branches, "root");

    expect(thread.map((message) => message.id)).toEqual(["m1", "m2"]);
  });

  it("falls back to latest branch message when head is missing", () => {
    const branches = [
      makeBranch({ id: "root", headMessageId: null, createdAt: "2026-01-01T00:00:00.000Z" }),
    ];
    const messages = [
      makeMessage({ id: "m1", branchId: "root", createdAt: "2026-01-01T00:00:00.000Z", role: "user" }),
      makeMessage({
        id: "m2",
        parentMessageId: "m1",
        branchId: "root",
        createdAt: "2026-01-01T00:01:00.000Z",
      }),
    ];

    const thread = getBranchThread(messages, branches, "root");

    expect(thread.at(-1)?.id).toBe("m2");
  });

  it("falls back to created-from message when branch has no own messages", () => {
    const branches = [
      makeBranch({
        id: "root",
        headMessageId: "m2",
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
      makeBranch({
        id: "child",
        parentBranchId: "root",
        createdFromMessageId: "m2",
        createdAt: "2026-01-01T00:02:00.000Z",
      }),
    ];
    const messages = [
      makeMessage({ id: "m1", branchId: "root", createdAt: "2026-01-01T00:00:00.000Z", role: "user" }),
      makeMessage({
        id: "m2",
        parentMessageId: "m1",
        branchId: "root",
        createdAt: "2026-01-01T00:01:00.000Z",
      }),
    ];

    const thread = getBranchThread(messages, branches, "child");

    expect(thread.map((message) => message.id)).toEqual(["m1", "m2"]);
  });
});
