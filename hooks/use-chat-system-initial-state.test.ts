import { describe, expect, it } from "vitest";
import { resolveInitialMessagesForBranch } from "@/hooks/use-chat-system-initial-state";
import type { ChatMessage } from "@/lib/ai/types";
import type { ChatBranch } from "@/lib/db/schema";

function makeBranch(input: {
  id: string;
  parentBranchId?: string | null;
  headMessageId?: string | null;
  createdFromMessageId?: string | null;
  createdFromExcerpt?: string | null;
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
    createdFromExcerpt: input.createdFromExcerpt ?? null,
    headMessageId: input.headMessageId ?? null,
    createdAt: new Date(input.createdAt),
    archivedAt: null,
  };
}

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

describe("resolveInitialMessagesForBranch", () => {
  it("returns an empty thread for excerpt branches with no branch messages", () => {
    const messages = [
      makeMessage({ id: "m1", branchId: "root", createdAt: "2026-01-01T00:00:00.000Z", role: "user" }),
      makeMessage({
        id: "m2",
        branchId: "root",
        parentMessageId: "m1",
        createdAt: "2026-01-01T00:01:00.000Z",
      }),
    ];

    const branches = [
      makeBranch({ id: "root", headMessageId: "m2", createdAt: "2026-01-01T00:00:00.000Z" }),
      makeBranch({
        id: "child",
        parentBranchId: "root",
        createdFromMessageId: "m2",
        createdFromExcerpt: "highlighted snippet",
        headMessageId: "m2",
        createdAt: "2026-01-01T00:02:00.000Z",
      }),
    ];

    const thread = resolveInitialMessagesForBranch(messages, {
      activeBranchId: "child",
      branches,
    });

    expect(thread).toEqual([]);
  });

  it("keeps excerpt-branch threads scoped to branch-owned messages", () => {
    const messages = [
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
      makeMessage({
        id: "c2",
        branchId: "child",
        parentMessageId: "c1",
        createdAt: "2026-01-01T00:03:00.000Z",
      }),
    ];

    const branches = [
      makeBranch({ id: "root", headMessageId: "m2", createdAt: "2026-01-01T00:00:00.000Z" }),
      makeBranch({
        id: "child",
        parentBranchId: "root",
        createdFromMessageId: "m2",
        createdFromExcerpt: "highlighted snippet",
        headMessageId: "c2",
        createdAt: "2026-01-01T00:02:00.000Z",
      }),
    ];

    const thread = resolveInitialMessagesForBranch(messages, {
      activeBranchId: "child",
      branches,
    });

    expect(thread.map((message) => message.id)).toEqual(["c1", "c2"]);
  });

  it("falls back to created-from context for non-excerpt branches", () => {
    const messages = [
      makeMessage({ id: "m1", branchId: "root", createdAt: "2026-01-01T00:00:00.000Z", role: "user" }),
      makeMessage({
        id: "m2",
        branchId: "root",
        parentMessageId: "m1",
        createdAt: "2026-01-01T00:01:00.000Z",
      }),
    ];

    const branches = [
      makeBranch({ id: "root", headMessageId: "m2", createdAt: "2026-01-01T00:00:00.000Z" }),
      makeBranch({
        id: "child",
        parentBranchId: "root",
        createdFromMessageId: "m2",
        createdFromExcerpt: null,
        headMessageId: null,
        createdAt: "2026-01-01T00:02:00.000Z",
      }),
    ];

    const thread = resolveInitialMessagesForBranch(messages, {
      activeBranchId: "child",
      branches,
    });

    expect(thread.map((message) => message.id)).toEqual(["m1", "m2"]);
  });
});
