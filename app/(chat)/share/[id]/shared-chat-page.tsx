"use client";
import { useMemo } from "react";
import { ChatSystem } from "@/components/chat-system";
import { WithSkeleton } from "@/components/with-skeleton";
import { useChatSystemInitialState } from "@/hooks/use-chat-system-initial-state";
import { useSearchParams } from "@/hooks/use-navigation";
import {
  usePublicChat,
  usePublicChatBranches,
  usePublicChatMessages,
} from "@/hooks/use-shared-chat";
import { resolveActiveBranchId } from "@/lib/branching/client-tree";

export function SharedChatPage({ id }: { id: string }) {
  const searchParams = useSearchParams();
  const {
    data: chat,
    isLoading: isChatLoading,
    error: chatError,
  } = usePublicChat(id);
  const {
    data: branches,
    isLoading: isBranchesLoading,
    error: branchesError,
  } = usePublicChatBranches(id);
  const {
    data: messages,
    isLoading: isMessagesLoading,
    error: messagesError,
  } = usePublicChatMessages(id);

  const activeBranchId = useMemo(
    () => resolveActiveBranchId(branches ?? [], searchParams.get("branch")),
    [branches, searchParams]
  );

  const { initialMessages } = useChatSystemInitialState(messages, {
    activeBranchId,
    branches: branches ?? [],
  });

  if (!id) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <div className="text-muted-foreground">Chat not found.</div>
      </div>
    );
  }

  if (chatError || branchesError || messagesError) {
    // TODO: Replace for error page
    return (
      <div className="flex h-dvh items-center justify-center">
        <div className="text-muted-foreground">
          This chat is not available or has been set to private
        </div>
      </div>
    );
  }

  if (!(isChatLoading || chat)) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <div className="text-muted-foreground">Chat not found.</div>
      </div>
    );
  }

  if (isMessagesLoading || isBranchesLoading || isChatLoading) {
    return (
      <WithSkeleton
        className="h-full w-full"
        isLoading={isChatLoading || isMessagesLoading || isBranchesLoading}
      >
        <div className="flex h-dvh w-full" />
      </WithSkeleton>
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
    <WithSkeleton
      className="w-full"
      isLoading={isChatLoading || isMessagesLoading || isBranchesLoading}
    >
      <ChatSystem
        activeBranchId={activeBranchId}
        branches={branches ?? []}
        id={chat.id}
        initialMessages={initialMessages}
        isReadonly={true}
        key={`${chat.id}:${activeBranchId ?? "root"}:readonly`}
      />
    </WithSkeleton>
  );
}
