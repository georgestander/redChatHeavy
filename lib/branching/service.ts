import "server-only";

import type { ChatMessage } from "@/lib/ai/types";
import { applyExcerptContextToPreviousMessages } from "@/lib/branching/context-policy";
import {
  assignMessagesWithoutBranchToRoot,
  createChatBranch,
  getChatBranchById,
  getChatBranchesByChatId,
  getLatestChatBranchByChatId,
  getRootChatBranchByChatId,
  renameChatBranchById,
  updateChatBranchHeadMessage,
} from "@/lib/db/branch-queries";
import { getAllMessagesByChatId, getMessageById } from "@/lib/db/queries";
import type { ChatBranch } from "@/lib/db/schema";
import { buildThreadFromLeaf } from "@/lib/thread-utils";
import { generateUUID } from "@/lib/utils";

export const DEFAULT_ROOT_BRANCH_TITLE = "Main";
export const DEFAULT_BRANCH_TITLE = "New Branch";
export const MAX_BRANCH_TITLE_LENGTH = 60;
const EXCERPT_BRANCH_TITLE_LENGTH = 26;

export type BranchTreeNode = {
  branch: ChatBranch;
  children: BranchTreeNode[];
  depth: number;
};

function sanitizeBranchTitle(title: string | null | undefined): string {
  if (!title) {
    return DEFAULT_BRANCH_TITLE;
  }
  const normalized = title.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return DEFAULT_BRANCH_TITLE;
  }
  if (normalized.length <= MAX_BRANCH_TITLE_LENGTH) {
    return normalized;
  }
  return normalized.slice(0, MAX_BRANCH_TITLE_LENGTH).trimEnd();
}

function deriveBranchTitle(options: {
  title?: string | null;
  excerpt?: string | null;
}): string {
  const title = sanitizeBranchTitle(options.title ?? null);
  if (title !== DEFAULT_BRANCH_TITLE) {
    return title;
  }

  const excerpt = options.excerpt?.replace(/\s+/g, " ").trim();
  if (excerpt) {
    if (excerpt.length <= EXCERPT_BRANCH_TITLE_LENGTH) {
      return excerpt;
    }
    return `${excerpt.slice(0, EXCERPT_BRANCH_TITLE_LENGTH).trimEnd()}...`;
  }

  return DEFAULT_BRANCH_TITLE;
}

export async function ensureRootBranchForChat({
  chatId,
  title = DEFAULT_ROOT_BRANCH_TITLE,
}: {
  chatId: string;
  title?: string;
}): Promise<ChatBranch> {
  const existing = await getRootChatBranchByChatId({ chatId });
  if (existing) {
    return existing;
  }

  return createChatBranch({
    id: generateUUID(),
    chatId,
    title: sanitizeBranchTitle(title),
    parentBranchId: null,
    createdFromMessageId: null,
    createdFromStart: null,
    createdFromEnd: null,
    createdFromExcerpt: null,
    headMessageId: null,
    createdAt: new Date(),
  });
}

export async function ensureBranchingInitializedForChat({
  chatId,
}: {
  chatId: string;
}): Promise<{
  rootBranch: ChatBranch;
  branches: ChatBranch[];
}> {
  const rootBranch = await ensureRootBranchForChat({ chatId });
  await assignMessagesWithoutBranchToRoot({
    chatId,
    rootBranchId: rootBranch.id,
  });
  const branches = await getChatBranchesByChatId({ chatId });
  return { rootBranch, branches };
}

export async function resolveBranchIdForIncomingMessage(options: {
  chatId: string;
  requestedBranchId?: string | null;
  parentMessageId?: string | null;
}): Promise<string> {
  const { chatId, requestedBranchId, parentMessageId } = options;
  const { rootBranch, branches } = await ensureBranchingInitializedForChat({
    chatId,
  });

  if (requestedBranchId) {
    const requested = branches.find((branch) => branch.id === requestedBranchId);
    if (requested) {
      return requested.id;
    }
  }

  if (parentMessageId) {
    const [parent] = await getMessageById({ id: parentMessageId });
    if (parent && parent.chatId === chatId) {
      return parent.branchId ?? rootBranch.id;
    }
  }

  const latest = await getLatestChatBranchByChatId({ chatId });
  return latest?.id ?? rootBranch.id;
}

export async function updateBranchHeadForMessage({
  branchId,
  messageId,
}: {
  branchId: string;
  messageId: string;
}): Promise<void> {
  await updateChatBranchHeadMessage({
    branchId,
    headMessageId: messageId,
  });
}

export async function buildContextForBranchSend(options: {
  chatId: string;
  requestedBranchId?: string | null;
  parentMessageId?: string | null;
}): Promise<{
  branchId: string;
  previousMessages: ChatMessage[];
}> {
  const { chatId, requestedBranchId, parentMessageId } = options;
  const branchId = await resolveBranchIdForIncomingMessage({
    chatId,
    requestedBranchId,
    parentMessageId,
  });
  const allMessages = await getAllMessagesByChatId({ chatId });

  let previousMessages: ChatMessage[] = [];
  if (parentMessageId) {
    previousMessages = buildThreadFromLeaf(allMessages, parentMessageId);
  } else {
    const activeBranch = await getChatBranchById({ branchId });
    if (activeBranch?.headMessageId) {
      previousMessages = buildThreadFromLeaf(allMessages, activeBranch.headMessageId);
    }
  }

  const branches = await getChatBranchesByChatId({ chatId });
  const activeBranch = branches.find((branch) => branch.id === branchId) ?? null;
  const excerpt = activeBranch?.createdFromExcerpt?.trim() ?? "";
  previousMessages = applyExcerptContextToPreviousMessages({
    previousMessages,
    branchId,
    excerpt,
  });

  return {
    branchId,
    previousMessages,
  };
}

export async function createBranchFromSelection(options: {
  chatId: string;
  parentBranchId?: string | null;
  messageId: string;
  title?: string | null;
  excerpt?: string | null;
  span?: { start: number; end: number } | null;
}): Promise<ChatBranch> {
  const { chatId, messageId, title, excerpt, span } = options;
  const { rootBranch, branches } = await ensureBranchingInitializedForChat({
    chatId,
  });
  const resolvedParentBranchId = options.parentBranchId ?? rootBranch.id;
  const parentBranch = branches.find((branch) => branch.id === resolvedParentBranchId);
  if (!parentBranch) {
    throw new Error("Parent branch not found");
  }

  return createChatBranch({
    id: generateUUID(),
    chatId,
    parentBranchId: parentBranch.id,
    title: deriveBranchTitle({
      title,
      excerpt,
    }),
    createdFromMessageId: messageId,
    createdFromStart: span?.start ?? null,
    createdFromEnd: span?.end ?? null,
    createdFromExcerpt: excerpt ?? null,
    headMessageId: messageId,
    createdAt: new Date(),
  });
}

export async function renameBranch(options: {
  branchId: string;
  title: string;
}): Promise<ChatBranch | null> {
  const normalized = sanitizeBranchTitle(options.title);
  return renameChatBranchById({
    branchId: options.branchId,
    title: normalized,
  });
}

export function buildBranchTree(branches: ChatBranch[]): BranchTreeNode[] {
  const children = new Map<string, ChatBranch[]>();
  const roots: ChatBranch[] = [];

  for (const branch of branches) {
    if (!branch.parentBranchId) {
      roots.push(branch);
      continue;
    }
    const siblings = children.get(branch.parentBranchId) ?? [];
    siblings.push(branch);
    children.set(branch.parentBranchId, siblings);
  }

  const buildNode = (branch: ChatBranch, depth: number): BranchTreeNode => ({
    branch,
    depth,
    children: (children.get(branch.id) ?? [])
      .slice()
      .sort(
        (left, right) =>
          left.createdAt.getTime() - right.createdAt.getTime() ||
          left.id.localeCompare(right.id)
      )
      .map((child) => buildNode(child, depth + 1)),
  });

  return roots
    .slice()
    .sort(
      (left, right) =>
        left.createdAt.getTime() - right.createdAt.getTime() ||
        left.id.localeCompare(right.id)
    )
    .map((root) => buildNode(root, 0));
}
