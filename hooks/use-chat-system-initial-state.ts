"use client";

import { useMemo } from "react";
import type { ChatMessage, UiToolName } from "@/lib/ai/types";
import type { ChatBranch } from "@/lib/db/schema";
import { buildThreadFromLeaf, getDefaultThread } from "@/lib/thread-utils";

type MessageWithNonStringId = Omit<ChatMessage, "id"> & {
  id: string | number;
};

function byCreatedAtDesc(left: ChatMessage, right: ChatMessage): number {
  return (
    new Date(right.metadata?.createdAt ?? new Date()).getTime() -
    new Date(left.metadata?.createdAt ?? new Date()).getTime()
  );
}

export function resolveInitialMessagesForBranch(
  normalizedMessages: ChatMessage[],
  options?: {
    activeBranchId?: string | null;
    branches?: ChatBranch[] | null;
  }
): ChatMessage[] {
  const activeBranchId = options?.activeBranchId ?? null;

  if (activeBranchId) {
    const branchMessages = normalizedMessages
      .filter((message) => message.metadata?.branchId === activeBranchId)
      .sort(byCreatedAtDesc);
    const branchLeaf = branchMessages[0] ?? null;
    const activeBranch =
      options?.branches?.find((branch) => branch.id === activeBranchId) ?? null;
    const excerpt = activeBranch?.createdFromExcerpt?.trim() ?? "";

    if (excerpt.length > 0) {
      if (!branchLeaf) {
        return [];
      }

      const branchThread = buildThreadFromLeaf(normalizedMessages, branchLeaf.id);
      return branchThread.filter(
        (message) => message.metadata?.branchId === activeBranchId
      );
    }

    if (branchLeaf) {
      return buildThreadFromLeaf(normalizedMessages, branchLeaf.id);
    }

    const fallbackLeafId =
      activeBranch?.headMessageId ?? activeBranch?.createdFromMessageId ?? null;

    if (fallbackLeafId) {
      return buildThreadFromLeaf(normalizedMessages, fallbackLeafId);
    }
  }

  return getDefaultThread(normalizedMessages);
}

export function useChatSystemInitialState(
  messages: MessageWithNonStringId[] | null | undefined,
  options?: {
    activeBranchId?: string | null;
    branches?: ChatBranch[] | null;
  }
): {
  initialMessages: ChatMessage[];
  initialTool: UiToolName | null;
} {
  const activeBranchId = options?.activeBranchId ?? null;
  const branches = options?.branches ?? null;

  const initialMessages = useMemo<ChatMessage[]>(() => {
    if (!messages) {
      return [];
    }

    const normalizedMessages = messages.map((msg) => ({
      ...msg,
      id: msg.id.toString(),
    }));
    return resolveInitialMessagesForBranch(normalizedMessages, {
      activeBranchId,
      branches,
    });
  }, [activeBranchId, branches, messages]);

  const initialTool = useMemo<UiToolName | null>(() => {
    const lastAssistantMessage = messages?.findLast(
      (m) => m.role === "assistant"
    );

    if (!(lastAssistantMessage && Array.isArray(lastAssistantMessage.parts))) {
      return null;
    }

    for (const part of lastAssistantMessage.parts) {
      if (
        part?.type === "tool-deepResearch" &&
        part?.state === "output-available" &&
        part?.output?.format === "clarifying_questions"
      ) {
        return "deepResearch";
      }
    }

    return null;
  }, [messages]);

  return {
    initialMessages,
    initialTool,
  };
}
