"use client";
import { useMemo } from "react";
import { ChatSystem } from "@/components/chat-system";
import { WithSkeleton } from "@/components/with-skeleton";
import { usePublicChat, usePublicChatMessages } from "@/hooks/use-shared-chat";
import { getDefaultThread } from "@/lib/thread-utils";

export function SharedChatPage({ id }: { id: string }) {
  const {
    data: chat,
    isLoading: isChatLoading,
    error: chatError,
  } = usePublicChat(id);
  const {
    data: messages,
    isLoading: isMessagesLoading,
    error: messagesError,
  } = usePublicChatMessages(id);

  const initialThreadMessages = useMemo(() => {
    if (!messages) {
      return [];
    }
    return getDefaultThread(
      messages.map((msg) => ({ ...msg, id: msg.id.toString() }))
    );
  }, [messages]);

  if (!id) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <div className="text-muted-foreground">Chat not found.</div>
      </div>
    );
  }

  if (chatError || messagesError) {
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

  if (isMessagesLoading || isChatLoading) {
    return (
      <WithSkeleton
        className="h-full w-full"
        isLoading={isChatLoading || isMessagesLoading}
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
      isLoading={isChatLoading || isMessagesLoading}
    >
      <ChatSystem
        id={chat.id}
        initialMessages={initialThreadMessages}
        isReadonly={true}
      />
    </WithSkeleton>
  );
}
