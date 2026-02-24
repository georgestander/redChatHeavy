import { describe, expect, it } from "vitest";
import {
  buildChildBranchHighlightsByMessage,
  projectBranchHighlightsToTextRange,
} from "@/lib/branching/branch-origin-highlights";
import type { ChatBranch } from "@/lib/db/schema";

function makeBranch(
  id: string,
  options: {
    parentBranchId: string | null;
    createdFromMessageId?: string | null;
    createdFromStart?: number | null;
    createdFromEnd?: number | null;
  }
): ChatBranch {
  return {
    id,
    chatId: "chat-1",
    parentBranchId: options.parentBranchId,
    title: id,
    createdFromMessageId: options.createdFromMessageId ?? null,
    createdFromStart: options.createdFromStart ?? null,
    createdFromEnd: options.createdFromEnd ?? null,
    createdFromExcerpt: null,
    headMessageId: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    archivedAt: null,
  };
}

describe("buildChildBranchHighlightsByMessage", () => {
  it("groups child branch origins per parent message and marks active child", () => {
    const branches: ChatBranch[] = [
      makeBranch("root", { parentBranchId: null }),
      makeBranch("child-a", {
        parentBranchId: "root",
        createdFromMessageId: "m1",
        createdFromStart: 2,
        createdFromEnd: 7,
      }),
      makeBranch("child-b", {
        parentBranchId: "root",
        createdFromMessageId: "m1",
        createdFromStart: 10,
        createdFromEnd: 16,
      }),
      makeBranch("grandchild", {
        parentBranchId: "child-a",
        createdFromMessageId: "m2",
        createdFromStart: 1,
        createdFromEnd: 4,
      }),
    ];

    const byMessage = buildChildBranchHighlightsByMessage({
      branches,
      parentBranchId: "root",
      activeBranchId: "child-b",
    });

    expect(byMessage.get("m1")).toEqual([
      {
        branchId: "child-a",
        start: 2,
        end: 7,
        messageId: "m1",
        isActive: false,
      },
      {
        branchId: "child-b",
        start: 10,
        end: 16,
        messageId: "m1",
        isActive: true,
      },
    ]);
    expect(byMessage.get("m2")).toBeUndefined();
  });
});

describe("projectBranchHighlightsToTextRange", () => {
  it("projects global message offsets into text-part local offsets", () => {
    const projected = projectBranchHighlightsToTextRange(
      [
        {
          branchId: "child-a",
          start: 2,
          end: 9,
          messageId: "m1",
        },
      ],
      { start: 5, end: 12 }
    );

    expect(projected).toEqual([
      {
        branchId: "child-a",
        start: 0,
        end: 4,
        messageId: "m1",
      },
    ]);
  });
});
