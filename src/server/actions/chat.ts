"use server";

import { generateText } from "ai";
import { requestInfo } from "rwsdk/worker";
import { getLanguageModel } from "@/lib/ai/providers";
import type { ChatMessage } from "@/lib/ai/types";
import { auth } from "@/lib/auth";
import {
  cloneAttachmentsInMessages,
  cloneMessagesWithDocuments,
} from "@/lib/clone-messages";
import { config } from "@/lib/config";
import {
  deleteChatById,
  deleteMessagesByChatIdAfterMessageId,
  getAllMessagesByChatId,
  getChatById as getChatByIdQuery,
  getChatsByUserId,
  getDocumentsByMessageIds,
  getMessageById,
  saveChat,
  saveChatMessages,
  saveDocuments,
  updateChatIsPinnedById,
  updateChatTitleById,
  updateChatVisiblityById,
  updateMessageCanceledAt,
} from "@/lib/db/queries";
import { dbChatToUIChat } from "@/lib/message-conversion";
import {
  chatGenerateTitleInputSchema,
  chatGetAllChatsInputSchema,
  chatIdInputSchema,
  chatMessageIdInputSchema,
  chatRenameInputSchema,
  chatSetIsPinnedInputSchema,
  chatSetVisibilityInputSchema,
} from "@/lib/schemas/chat";
import { generateUUID } from "@/lib/utils";

function serializeChat(chat: ReturnType<typeof dbChatToUIChat>) {
  return {
    ...chat,
    createdAt:
      chat.createdAt instanceof Date
        ? chat.createdAt.toISOString()
        : chat.createdAt,
    updatedAt:
      chat.updatedAt instanceof Date
        ? chat.updatedAt.toISOString()
        : chat.updatedAt,
  };
}

function serializeMessage(message: ChatMessage) {
  return {
    ...message,
    metadata: {
      ...message.metadata,
      createdAt:
        message.metadata.createdAt instanceof Date
          ? message.metadata.createdAt.toISOString()
          : message.metadata.createdAt,
    },
  };
}

async function requireUserId() {
  const session = await auth.api.getSession({
    headers: requestInfo.request.headers,
  });
  const userId = session?.user?.id;
  if (!userId) {
    throw new Error("UNAUTHORIZED");
  }
  return userId;
}

export async function getAllChats(rawInput?: unknown) {
  const input = chatGetAllChatsInputSchema.parse(rawInput);
  const userId = await requireUserId();

  const chats = await getChatsByUserId({
    id: userId,
    projectId: input?.projectId,
  });

  // Sort chats by pinned status, then by last updated date
  chats.sort((a, b) => {
    if (a.isPinned && !b.isPinned) {
      return -1;
    }
    if (!a.isPinned && b.isPinned) {
      return 1;
    }
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  return chats.map((chat) => serializeChat(dbChatToUIChat(chat)));
}

export async function getChatById(rawInput: unknown) {
  const input = chatIdInputSchema.parse(rawInput);
  const userId = await requireUserId();

  const chat = await getChatByIdQuery({ id: input.chatId });

  if (!chat || chat.userId !== userId) {
    throw new Error("Chat not found");
  }

  return serializeChat(dbChatToUIChat(chat));
}

export async function getChatMessages(rawInput: unknown) {
  const input = chatIdInputSchema.parse(rawInput);
  const userId = await requireUserId();

  const chat = await getChatByIdQuery({ id: input.chatId });
  if (!chat || chat.userId !== userId) {
    throw new Error("Chat not found");
  }

  const dbMessages = await getAllMessagesByChatId({ chatId: input.chatId });
  return dbMessages.map(serializeMessage);
}

export async function renameChat(rawInput: unknown) {
  const input = chatRenameInputSchema.parse(rawInput);
  const userId = await requireUserId();

  const chat = await getChatByIdQuery({ id: input.chatId });
  if (!chat || chat.userId !== userId) {
    throw new Error("Chat not found or access denied");
  }

  await updateChatTitleById({
    chatId: input.chatId,
    title: input.title,
  });
}

export async function deleteTrailingMessages(rawInput: unknown) {
  const input = chatMessageIdInputSchema.parse(rawInput);
  const userId = await requireUserId();

  const [message] = await getMessageById({ id: input.messageId });

  if (!message) {
    throw new Error("Message not found");
  }

  const chat = await getChatByIdQuery({ id: message.chatId });
  if (!chat || chat.userId !== userId) {
    throw new Error("Access denied");
  }

  await deleteMessagesByChatIdAfterMessageId({
    chatId: message.chatId,
    messageId: input.messageId,
  });
}

export async function stopStream(rawInput: unknown) {
  const input = chatMessageIdInputSchema.parse(rawInput);
  const userId = await requireUserId();

  const [msg] = await getMessageById({ id: input.messageId });
  if (!msg) {
    throw new Error("Message not found");
  }

  const chat = await getChatByIdQuery({ id: msg.chatId });
  if (!chat || chat.userId !== userId) {
    throw new Error("Chat not found or access denied");
  }

  await updateMessageCanceledAt({
    messageId: input.messageId,
    canceledAt: new Date(),
  });

  return { success: true };
}

export async function setVisibility(rawInput: unknown) {
  const input = chatSetVisibilityInputSchema.parse(rawInput);
  const userId = await requireUserId();

  const chat = await getChatByIdQuery({ id: input.chatId });
  if (!chat || chat.userId !== userId) {
    throw new Error("Chat not found or access denied");
  }

  await updateChatVisiblityById({
    chatId: input.chatId,
    visibility: input.visibility,
  });

  return { success: true };
}

export async function setIsPinned(rawInput: unknown) {
  const input = chatSetIsPinnedInputSchema.parse(rawInput);
  const userId = await requireUserId();

  const chat = await getChatByIdQuery({ id: input.chatId });
  if (!chat || chat.userId !== userId) {
    throw new Error("Chat not found or access denied");
  }

  await updateChatIsPinnedById({
    chatId: input.chatId,
    isPinned: input.isPinned,
  });

  return { success: true };
}

export async function deleteChat(rawInput: unknown) {
  const input = chatIdInputSchema.parse(rawInput);
  const userId = await requireUserId();

  const chat = await getChatByIdQuery({ id: input.chatId });
  if (!chat || chat.userId !== userId) {
    throw new Error("Chat not found or access denied");
  }

  await deleteChatById({ id: input.chatId });
  return { success: true };
}

export async function generateTitle(rawInput: unknown) {
  const input = chatGenerateTitleInputSchema.parse(rawInput);
  const { text: title } = await generateText({
    model: await getLanguageModel(config.models.defaults.title),
    system: `\n
        - you will generate a short title based on the first message a user begins a conversation with
        - ensure it is not more than 80 characters long
        - the title should be a summary of the user's message
        - do not use quotes or colons`,
    prompt: input.message,
    experimental_telemetry: { isEnabled: true },
  });

  return { title };
}

export async function getPublicChat(rawInput: unknown) {
  const input = chatIdInputSchema.parse(rawInput);
  const chat = await getChatByIdQuery({ id: input.chatId });

  if (!chat || chat.visibility !== "public") {
    throw new Error("Public chat not found");
  }

  return serializeChat(dbChatToUIChat(chat));
}

export async function getPublicChatMessages(rawInput: unknown) {
  const input = chatIdInputSchema.parse(rawInput);

  const chat = await getChatByIdQuery({ id: input.chatId });

  if (!chat || chat.visibility !== "public") {
    throw new Error("Public chat not found");
  }

  const dbMessages = await getAllMessagesByChatId({ chatId: input.chatId });
  return dbMessages.map(serializeMessage);
}

export async function cloneSharedChat(rawInput: unknown) {
  const input = chatIdInputSchema.parse(rawInput);
  const userId = await requireUserId();

  const sourceChat = await getChatByIdQuery({ id: input.chatId });

  if (!sourceChat || sourceChat.visibility !== "public") {
    throw new Error("Public chat not found");
  }

  const sourceMessages = await getAllMessagesByChatId({
    chatId: input.chatId,
  });

  if (sourceMessages.length === 0) {
    throw new Error("Source chat has no messages to copy");
  }

  const sourceMessageIds = sourceMessages.map((msg) => msg.id);
  const sourceDocuments = await getDocumentsByMessageIds({
    messageIds: sourceMessageIds,
  });

  const newChatId = generateUUID();

  await saveChat({
    id: newChatId,
    userId,
    title: `${sourceChat.title}`,
  });

  const { clonedMessages, clonedDocuments } = cloneMessagesWithDocuments(
    sourceMessages.map((msg) => ({
      ...msg,
      chatId: input.chatId,
    })) as Array<ChatMessage & { chatId: string }>,
    sourceDocuments,
    newChatId,
    userId
  );

  const messagesWithClonedAttachments =
    await cloneAttachmentsInMessages(clonedMessages);

  await saveChatMessages({
    messages: messagesWithClonedAttachments.map((msg) => ({
      id: msg.id,
      chatId: newChatId,
      message: msg,
    })),
  });
  if (clonedDocuments.length > 0) {
    await saveDocuments({ documents: clonedDocuments });
  }

  return { chatId: newChatId };
}
