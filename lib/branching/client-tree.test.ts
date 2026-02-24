import { describe, expect, it } from "vitest";
import {
  buildChatBranchTree,
  flattenChatBranchTree,
  resolveActiveBranchId,
} from "@/lib/branching/client-tree";
import type { ChatBranch } from "@/lib/db/schema";

function makeBranch(input: {
  id: string;
  chatId?: string;
  parentBranchId?: string | null;
  title?: string;
  createdAt: string;
}): ChatBranch {
  return {
    id: input.id,
    chatId: input.chatId ?? "chat-1",
    parentBranchId: input.parentBranchId ?? null,
    title: input.title ?? input.id,
    createdFromMessageId: null,
    createdFromStart: null,
    createdFromEnd: null,
    createdFromExcerpt: null,
    headMessageId: null,
    createdAt: new Date(input.createdAt),
    archivedAt: null,
  };
}

describe("resolveActiveBranchId", () => {
  it("returns requested branch when it exists", () => {
    const branches = [
      makeBranch({ id: "root", createdAt: "2026-01-01T00:00:00.000Z" }),
      makeBranch({
        id: "child",
        parentBranchId: "root",
        createdAt: "2026-01-02T00:00:00.000Z",
      }),
    ];

    expect(resolveActiveBranchId(branches, "child")).toBe("child");
  });

  it("falls back to root for invalid branch", () => {
    const branches = [
      makeBranch({ id: "root", createdAt: "2026-01-01T00:00:00.000Z" }),
      makeBranch({
        id: "child",
        parentBranchId: "root",
        createdAt: "2026-01-02T00:00:00.000Z",
      }),
    ];

    expect(resolveActiveBranchId(branches, "missing")).toBe("root");
  });
});

describe("buildChatBranchTree", () => {
  it("builds deterministic depth-ordered tree", () => {
    const tree = buildChatBranchTree([
      makeBranch({
        id: "child-b",
        parentBranchId: "root",
        createdAt: "2026-01-03T00:00:00.000Z",
      }),
      makeBranch({ id: "root", createdAt: "2026-01-01T00:00:00.000Z" }),
      makeBranch({
        id: "child-a",
        parentBranchId: "root",
        createdAt: "2026-01-02T00:00:00.000Z",
      }),
      makeBranch({
        id: "grandchild",
        parentBranchId: "child-a",
        createdAt: "2026-01-04T00:00:00.000Z",
      }),
    ]);

    const flat = flattenChatBranchTree(tree);

    expect(flat.map((node) => `${node.depth}:${node.branch.id}`)).toEqual([
      "0:root",
      "1:child-a",
      "2:grandchild",
      "1:child-b",
    ]);
  });

  it("treats orphan branches as roots", () => {
    const tree = buildChatBranchTree([
      makeBranch({ id: "root", createdAt: "2026-01-01T00:00:00.000Z" }),
      makeBranch({
        id: "orphan",
        parentBranchId: "missing-parent",
        createdAt: "2026-01-02T00:00:00.000Z",
      }),
    ]);

    expect(tree.map((node) => node.branch.id)).toEqual(["root", "orphan"]);
  });
});
