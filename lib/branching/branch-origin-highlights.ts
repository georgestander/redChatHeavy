import {
  type BranchTextHighlight,
  normalizeBranchTextHighlights,
} from "@/lib/branching/text-highlights";
import type { ChatBranch } from "@/lib/db/schema";

export function buildChildBranchHighlightsByMessage(options: {
  branches: ChatBranch[];
  parentBranchId: string;
  activeBranchId?: string | null;
}): Map<string, BranchTextHighlight[]> {
  const byMessageId = new Map<string, BranchTextHighlight[]>();

  for (const branch of options.branches) {
    if (branch.parentBranchId !== options.parentBranchId) {
      continue;
    }

    const messageId = branch.createdFromMessageId;
    const start = branch.createdFromStart;
    const end = branch.createdFromEnd;

    if (!messageId || start === null || end === null || start >= end) {
      continue;
    }

    const messageHighlights = byMessageId.get(messageId) ?? [];
    messageHighlights.push({
      branchId: branch.id,
      start,
      end,
      messageId,
      isActive:
        options.activeBranchId !== null &&
        options.activeBranchId !== undefined &&
        branch.id === options.activeBranchId,
    });
    byMessageId.set(messageId, messageHighlights);
  }

  for (const [messageId, highlights] of byMessageId) {
    byMessageId.set(messageId, normalizeBranchTextHighlights(highlights));
  }

  return byMessageId;
}

export function getChildBranchHighlightsForMessage(options: {
  branches: ChatBranch[];
  parentBranchId: string;
  messageId: string;
  activeBranchId?: string | null;
}): BranchTextHighlight[] {
  return (
    buildChildBranchHighlightsByMessage({
      branches: options.branches,
      parentBranchId: options.parentBranchId,
      activeBranchId: options.activeBranchId,
    }).get(options.messageId) ?? []
  );
}

export function projectBranchHighlightsToTextRange(
  highlights: BranchTextHighlight[],
  range: { start: number; end: number }
): BranchTextHighlight[] {
  if (range.start >= range.end) {
    return [];
  }

  return normalizeBranchTextHighlights(
    highlights
      .map((highlight) => {
        const overlapStart = Math.max(highlight.start, range.start);
        const overlapEnd = Math.min(highlight.end, range.end);

        if (overlapStart >= overlapEnd) {
          return null;
        }

        return {
          ...highlight,
          start: overlapStart - range.start,
          end: overlapEnd - range.start,
        } satisfies BranchTextHighlight;
      })
      .filter((highlight): highlight is BranchTextHighlight => Boolean(highlight))
  );
}
