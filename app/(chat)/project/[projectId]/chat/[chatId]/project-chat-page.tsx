"use client";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { ChatSystem } from "@/components/chat-system";
import {
  useGetChatByIdQueryOptions,
  useGetChatMessagesQueryOptions,
} from "@/hooks/chat-sync-hooks";
import type { UiToolName } from "@/lib/ai/types";
import { getDefaultThread } from "@/lib/thread-utils";
import { useChatId } from "@/providers/chat-id-provider";

export function ProjectChatPage({ projectId }: { projectId: string }) {
  const { id } = useChatId();
  const getChatByIdQueryOptions = useGetChatByIdQueryOptions(id);
  const { data: chat } = useSuspenseQuery(getChatByIdQueryOptions);
  const getMessagesByChatIdQueryOptions = useGetChatMessagesQueryOptions();
  const { data: messages } = useSuspenseQuery(getMessagesByChatIdQueryOptions);

  const initialThreadMessages = useMemo(() => {
    if (!messages) {
      return [];
    }
    return getDefaultThread(
      messages.map((msg) => ({ ...msg, id: msg.id.toString() }))
    );
  }, [messages]);

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
      initialMessages={initialThreadMessages}
      initialTool={initialTool}
      isReadonly={false}
      projectId={projectId}
    />
  );
}
