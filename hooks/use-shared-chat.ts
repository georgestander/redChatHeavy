import { useQuery } from "@tanstack/react-query";
import type { ChatMessage } from "@/lib/ai/types";
import type { ChatBranch } from "@/lib/db/schema";
import { chatKeys } from "@/lib/query-keys";
import type { UIChat } from "@/lib/types/ui-chat";
import {
  getPublicChat,
  getPublicChatBranches,
  getPublicChatMessages,
} from "@/server/actions/chat";

type SerializedChat = Omit<UIChat, "createdAt" | "updatedAt"> & {
  createdAt: string | Date;
  updatedAt: string | Date;
};

type SerializedChatMessage = Omit<ChatMessage, "metadata"> & {
  metadata: Omit<ChatMessage["metadata"], "createdAt"> & {
    createdAt: string | Date;
  };
};

type SerializedChatBranch = Omit<ChatBranch, "createdAt" | "archivedAt"> & {
  createdAt: string | Date;
  archivedAt: string | Date | null;
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

function hydrateBranchDates(branch: SerializedChatBranch): ChatBranch {
  return {
    ...branch,
    createdAt:
      branch.createdAt instanceof Date
        ? branch.createdAt
        : new Date(branch.createdAt),
    archivedAt:
      branch.archivedAt instanceof Date
        ? branch.archivedAt
        : branch.archivedAt
          ? new Date(branch.archivedAt)
          : null,
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

export function usePublicChatBranches(chatId: string) {
  return useQuery({
    queryKey: chatKeys.publicBranches(chatId),
    queryFn: async () => {
      const branches = await getPublicChatBranches({ chatId });
      return (branches as SerializedChatBranch[]).map(hydrateBranchDates);
    },
    enabled: !!chatId,
  });
}
