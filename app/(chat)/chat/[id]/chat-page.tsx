"use client";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { ChatSystem } from "@/components/chat-system";
import {
  useGetChatByIdQueryOptions,
  useGetChatMessagesQueryOptions,
} from "@/hooks/chat-sync-hooks";
import { useChatSystemInitialState } from "@/hooks/use-chat-system-initial-state";
import { useRouter } from "@/hooks/use-navigation";
import { useChatId } from "@/providers/chat-id-provider";
import { useSession } from "@/providers/session-provider";

function ChatPageContent({ chatId }: { chatId: string }) {
  const getChatByIdQueryOptions = useGetChatByIdQueryOptions(chatId);
  const { data: chat } = useSuspenseQuery(getChatByIdQueryOptions);
  const getMessagesByChatIdQueryOptions = useGetChatMessagesQueryOptions();
  const { data: messages } = useSuspenseQuery(getMessagesByChatIdQueryOptions);

  const { initialMessages, initialTool } = useChatSystemInitialState(messages);

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
      initialMessages={initialMessages}
      initialTool={initialTool}
      isReadonly={false}
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
