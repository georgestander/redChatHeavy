import type { ChatMessage } from "@/lib/ai/types";
import type { ChatBranch } from "@/lib/db/schema";
import { buildThreadFromLeaf } from "@/lib/thread-utils";

function toTimestamp(value: Date | string | null | undefined): number {
  if (!value) {
    return 0;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function findLatestBranchMessageId(
  messages: ChatMessage[],
  branchId: string
): string | null {
  const branchMessages = messages
    .filter((message) => message.metadata?.branchId === branchId)
    .sort(
      (left, right) =>
        toTimestamp(right.metadata?.createdAt) -
        toTimestamp(left.metadata?.createdAt)
    );

  return branchMessages[0]?.id ?? null;
}

export function getBranchThread(
  messages: ChatMessage[],
  branches: ChatBranch[],
  branchId: string | null | undefined
): ChatMessage[] {
  if (!branchId) {
    return [];
  }

  const branch = branches.find((candidate) => candidate.id === branchId);
  if (!branch) {
    return [];
  }

  const leafMessageId =
    branch.headMessageId ??
    findLatestBranchMessageId(messages, branch.id) ??
    branch.createdFromMessageId;

  if (!leafMessageId) {
    return [];
  }

  return buildThreadFromLeaf(messages, leafMessageId);
}
