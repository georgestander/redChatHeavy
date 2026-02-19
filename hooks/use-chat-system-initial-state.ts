"use client";

import { useMemo } from "react";
import type { ChatMessage, UiToolName } from "@/lib/ai/types";
import type { ChatBranch } from "@/lib/db/schema";
import { buildThreadFromLeaf, getDefaultThread } from "@/lib/thread-utils";

type MessageWithNonStringId = Omit<ChatMessage, "id"> & {
  id: string | number;
};

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
  const initialMessages = useMemo<ChatMessage[]>(() => {
    if (!messages) {
      return [];
    }

    const normalizedMessages = messages.map((msg) => ({
      ...msg,
      id: msg.id.toString(),
    }));
    const activeBranchId = options?.activeBranchId ?? null;

    if (activeBranchId) {
      const branchLeaf = [...normalizedMessages]
        .filter((message) => message.metadata?.branchId === activeBranchId)
        .sort(
          (left, right) =>
            new Date(right.metadata?.createdAt ?? new Date()).getTime() -
            new Date(left.metadata?.createdAt ?? new Date()).getTime()
        )
        .at(0);

      if (branchLeaf) {
        return buildThreadFromLeaf(normalizedMessages, branchLeaf.id);
      }

      const activeBranch = options?.branches?.find(
        (branch) => branch.id === activeBranchId
      );
      const fallbackLeafId =
        activeBranch?.headMessageId ?? activeBranch?.createdFromMessageId ?? null;

      if (fallbackLeafId) {
        return buildThreadFromLeaf(normalizedMessages, fallbackLeafId);
      }
    }

    return getDefaultThread(normalizedMessages);
  }, [messages, options?.activeBranchId, options?.branches]);

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
