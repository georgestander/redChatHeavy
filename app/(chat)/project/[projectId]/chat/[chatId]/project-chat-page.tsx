"use client";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
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
import { useSession } from "@/providers/session-provider";

export function ProjectChatPage({ projectId }: { projectId: string }) {
  const [isHydrated, setIsHydrated] = useState(false);
  const { id } = useChatId();
  const { data: session, isPending: isSessionPending } = useSession();
  const searchParams = useSearchParams();
  const getChatByIdQueryOptions = useGetChatByIdQueryOptions(id);
  const chatQuery = useQuery(getChatByIdQueryOptions);
  const getMessagesByChatIdQueryOptions = useGetChatMessagesQueryOptions();
  const messagesQuery = useQuery(getMessagesByChatIdQueryOptions);
  const getChatBranchesQueryOptions = useGetChatBranchesQueryOptions();
  const branchesQuery = useQuery(getChatBranchesQueryOptions);
  const chat = chatQuery.data;
  const messages = messagesQuery.data ?? [];
  const branches = branchesQuery.data ?? [];

  const isBootstrapping =
    (getChatByIdQueryOptions.enabled && !chatQuery.isFetched) ||
    (getMessagesByChatIdQueryOptions.enabled && !messagesQuery.isFetched) ||
    (getChatBranchesQueryOptions.enabled && !branchesQuery.isFetched);

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

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  if (!isHydrated) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <div className="text-muted-foreground">Loading chat...</div>
      </div>
    );
  }

  if (!id) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <div className="text-muted-foreground">Chat not found.</div>
      </div>
    );
  }

  if (isSessionPending || isBootstrapping) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <div className="text-muted-foreground">Loading chat...</div>
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <div className="text-muted-foreground">Chat not found.</div>
      </div>
    );
  }

  const resolvedChatId = chat?.id ?? id;

  return (
    <ChatSystem
      id={resolvedChatId}
      activeBranchId={activeBranchId}
      branches={branches}
      initialMessages={initialThreadMessages}
      initialTool={initialTool}
      isReadonly={false}
      key={`${resolvedChatId}:${activeBranchId ?? "root"}`}
      projectId={projectId}
    />
  );
}
