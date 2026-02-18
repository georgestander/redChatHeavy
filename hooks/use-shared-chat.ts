import { useQuery } from "@tanstack/react-query";
import type { ChatMessage } from "@/lib/ai/types";
import { chatKeys } from "@/lib/query-keys";
import type { UIChat } from "@/lib/types/ui-chat";
import { getPublicChat, getPublicChatMessages } from "@/server/actions/chat";

type SerializedChat = Omit<UIChat, "createdAt" | "updatedAt"> & {
  createdAt: string | Date;
  updatedAt: string | Date;
};

type SerializedChatMessage = Omit<ChatMessage, "metadata"> & {
  metadata: Omit<ChatMessage["metadata"], "createdAt"> & {
    createdAt: string | Date;
  };
};

function hydrateChatDates(chat: SerializedChat): UIChat {
  return {
    ...chat,
    createdAt:
      chat.createdAt instanceof Date
        ? chat.createdAt
        : new Date(chat.createdAt),
    updatedAt:
      chat.updatedAt instanceof Date
        ? chat.updatedAt
        : new Date(chat.updatedAt),
  };
}

function hydrateMessageDates(message: SerializedChatMessage): ChatMessage {
  return {
    ...message,
    metadata: {
      ...message.metadata,
      createdAt:
        message.metadata.createdAt instanceof Date
          ? message.metadata.createdAt
          : new Date(message.metadata.createdAt),
    },
  };
}

export function usePublicChat(
  chatId: string,
  { enabled }: { enabled?: boolean } = {}
) {
  return useQuery({
    queryKey: chatKeys.publicChat(chatId),
    queryFn: async () => {
      const chat = await getPublicChat({ chatId });
      return hydrateChatDates(chat as SerializedChat);
    },
    enabled: enabled ?? true,
  });
}

export function usePublicChatMessages(chatId: string) {
  return useQuery({
    queryKey: chatKeys.publicMessages(chatId),
    queryFn: async () => {
      const messages = await getPublicChatMessages({ chatId });
      return (messages as SerializedChatMessage[]).map(hydrateMessageDates);
    },
    enabled: !!chatId,
  });
}
