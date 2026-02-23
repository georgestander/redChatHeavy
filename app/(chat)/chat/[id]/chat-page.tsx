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
import { useRouter, useSearchParams } from "@/hooks/use-navigation";
import { resolveActiveBranchId } from "@/lib/branching/client-tree";
import { useChatId } from "@/providers/chat-id-provider";
import { useSession } from "@/providers/session-provider";

function ChatPageContent({ chatId }: { chatId: string }) {
  const searchParams = useSearchParams();
  const getChatByIdQueryOptions = useGetChatByIdQueryOptions(chatId);
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

  const { initialMessages, initialTool } = useChatSystemInitialState(messages, {
    activeBranchId,
    branches,
  });

  if (isBootstrapping) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <div className="text-muted-foreground">Loading chat...</div>
      </div>
    );
  }

  const resolvedChatId = chat?.id ?? chatId;

  return (
    <ChatSystem
      id={resolvedChatId}
      activeBranchId={activeBranchId}
      branches={branches}
      initialMessages={initialMessages}
      initialTool={initialTool}
      isReadonly={false}
      key={`${resolvedChatId}:${activeBranchId ?? "root"}`}
    />
  );
}

export function ChatPage() {
  const [isHydrated, setIsHydrated] = useState(false);
  const { id, isPersisted } = useChatId();
  const { data: session, isPending } = useSession();
  const router = useRouter();

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  // Anonymous users can't access persisted chat pages
  useEffect(() => {
    if (isHydrated && isPersisted && !isPending && !session?.user) {
      router.replace("/");
    }
  }, [isHydrated, isPersisted, isPending, router, session?.user]);

  if (!isHydrated) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <div className="text-muted-foreground">Loading chat...</div>
      </div>
    );
  }

  if (!isPersisted) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <div className="text-muted-foreground">Chat not found.</div>
      </div>
    );
  }

  if (isPending) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <div className="text-muted-foreground">Loading chat...</div>
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <div className="text-muted-foreground">Redirecting...</div>
      </div>
    );
  }

  return <ChatPageContent chatId={id} />;
}
