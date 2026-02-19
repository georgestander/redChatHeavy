"use client";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
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
  const { data: chat } = useSuspenseQuery(getChatByIdQueryOptions);
  const getMessagesByChatIdQueryOptions = useGetChatMessagesQueryOptions();
  const { data: messages } = useSuspenseQuery(getMessagesByChatIdQueryOptions);
  const getChatBranchesQueryOptions = useGetChatBranchesQueryOptions();
  const { data: branches } = useSuspenseQuery(getChatBranchesQueryOptions);

  const activeBranchId = useMemo(
    () => resolveActiveBranchId(branches, searchParams.get("branch")),
    [branches, searchParams]
  );

  const { initialMessages, initialTool } = useChatSystemInitialState(messages, {
    activeBranchId,
    branches,
  });

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
      initialMessages={initialMessages}
      initialTool={initialTool}
      isReadonly={false}
      key={`${chat.id}:${activeBranchId ?? "root"}`}
    />
  );
}

export function ChatPage() {
  const { id, isPersisted } = useChatId();
  const { data: session, isPending } = useSession();
  const router = useRouter();

  // Anonymous users can't access persisted chat pages
  useEffect(() => {
    if (isPersisted && !isPending && !session?.user) {
      router.replace("/");
    }
  }, [isPersisted, isPending, router, session?.user]);

  if (!isPersisted) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <div className="text-muted-foreground">Chat not found.</div>
      </div>
    );
  }

  return <ChatPageContent chatId={id} />;
}
