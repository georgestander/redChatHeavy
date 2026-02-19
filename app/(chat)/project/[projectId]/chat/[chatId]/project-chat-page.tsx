"use client";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { ChatSystem } from "@/components/chat-system";
import {
  useGetChatBranchesQueryOptions,
  useGetChatByIdQueryOptions,
  useGetChatMessagesQueryOptions,
} from "@/hooks/chat-sync-hooks";
import { useChatSystemInitialState } from "@/hooks/use-chat-system-initial-state";
import { useSearchParams } from "@/hooks/use-navigation";
import type { UiToolName } from "@/lib/ai/types";
import { resolveActiveBranchId } from "@/lib/branching/client-tree";
import { useChatId } from "@/providers/chat-id-provider";

export function ProjectChatPage({ projectId }: { projectId: string }) {
  const { id } = useChatId();
  const searchParams = useSearchParams();
  const getChatByIdQueryOptions = useGetChatByIdQueryOptions(id);
  const { data: chat } = useSuspenseQuery(getChatByIdQueryOptions);
  const getMessagesByChatIdQueryOptions = useGetChatMessagesQueryOptions();
  const { data: messages } = useSuspenseQuery(getMessagesByChatIdQueryOptions);
  const getChatBranchesQueryOptions = useGetChatBranchesQueryOptions();
  const { data: branches } = useSuspenseQuery(getChatBranchesQueryOptions);

  const activeBranchId = useMemo(
    () => resolveActiveBranchId(branches, searchParams.get("branch")),
    [branches, searchParams]
  );

  const { initialMessages: initialThreadMessages } = useChatSystemInitialState(
    messages,
    {
      activeBranchId,
      branches,
    }
  );

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

  if (!id) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <div className="text-muted-foreground">Chat not found.</div>
      </div>
    );
  }

  if (!chat) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <div className="text-muted-foreground">Chat not found.</div>
      </div>
    );
  }

  return (
    <ChatSystem
      id={chat.id}
      activeBranchId={activeBranchId}
      branches={branches}
      initialMessages={initialThreadMessages}
      initialTool={initialTool}
      isReadonly={false}
      key={`${chat.id}:${activeBranchId ?? "root"}`}
      projectId={projectId}
    />
  );
}
