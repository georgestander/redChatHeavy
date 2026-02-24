import { describe, expect, it } from "vitest";
import {
  applyBranchTextHighlightsToHastTree,
  type BranchTextHighlight,
  normalizeBranchTextHighlights,
} from "@/lib/branching/text-highlights";

type TestNode = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: TestNode[];
};

function text(value: string): TestNode {
  return { type: "text", value };
}

function markValue(node: TestNode): string {
  return node.children?.map((child) => child.value ?? "").join("") ?? "";
}

describe("normalizeBranchTextHighlights", () => {
  it("filters invalid ranges and clips overlaps", () => {
    const highlights: BranchTextHighlight[] = [
      { branchId: "alpha", start: 0, end: 4 },
      { branchId: "beta", start: 2, end: 7 },
      { branchId: "", start: 7, end: 9 },
      { branchId: "gamma", start: 4, end: 4 },
    ];

    expect(normalizeBranchTextHighlights(highlights)).toEqual([
      { branchId: "alpha", start: 0, end: 4 },
      { branchId: "beta", start: 4, end: 7 },
    ]);
  });
});

describe("applyBranchTextHighlightsToHastTree", () => {
  it("wraps highlighted text with branch metadata across text nodes", () => {
    const tree: TestNode = {
      type: "root",
      children: [
        {
          type: "element",
          tagName: "p",
          children: [
            text("hello "),
            {
              type: "element",
              tagName: "strong",
              children: [text("world")],
            },
          ],
        },
      ],
    };

    applyBranchTextHighlightsToHastTree(tree as Parameters<typeof applyBranchTextHighlightsToHastTree>[0], [
      {
        branchId: "branch-1",
        start: 3,
        end: 8,
        messageId: "message-1",
        isActive: true,
      },
    ]);

    const paragraph = tree.children?.[0];
    expect(paragraph?.children?.[0]).toMatchObject(text("hel"));

    const firstMark = paragraph?.children?.[1];
    expect(firstMark).toMatchObject({
      type: "element",
      tagName: "mark",
      properties: {
        "data-branch-id": "branch-1",
        "data-message-id": "message-1",
        "data-branch-active": "true",
      },
    });
    expect(markValue(firstMark as TestNode)).toBe("lo ");

    const strong = paragraph?.children?.[2];
    const nestedMark = strong?.children?.[0];
    expect(nestedMark).toMatchObject({
      type: "element",
      tagName: "mark",
      properties: {
        "data-branch-id": "branch-1",
      },
    });
    expect(markValue(nestedMark as TestNode)).toBe("wo");

    expect(strong?.children?.[1]).toMatchObject(text("rld"));
  });
});
