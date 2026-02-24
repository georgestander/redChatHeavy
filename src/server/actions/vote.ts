"use server";

import { requestInfo } from "rwsdk/worker";
import { getServerSession } from "@/lib/auth";
import {
  getChatById,
  getVotesByChatId,
  voteMessage as saveVoteMessage,
} from "@/lib/db/queries";
import {
  getVotesInputSchema,
  voteMessageInputSchema,
} from "@/lib/schemas/vote";

async function requireUserId() {
  const session = await getServerSession(requestInfo.request.headers);
  const userId = session?.user?.id;
  if (!userId) {
    throw new Error("UNAUTHORIZED");
  }
  return userId;
}

export async function getVotes(input: unknown) {
  try {
    const userId = await requireUserId();
    const parsed = getVotesInputSchema.parse(input);

    const chat = await getChatById({ id: parsed.chatId });

    if (!chat || chat.userId !== userId) {
      return [];
    }

    return await getVotesByChatId({ id: parsed.chatId });
  } catch (error) {
    console.error("Failed to load votes", error);
    return [];
  }
}

export async function voteMessage(input: unknown) {
  const userId = await requireUserId();
  const parsed = voteMessageInputSchema.parse(input);

  const chat = await getChatById({ id: parsed.chatId });

  if (!chat) {
    throw new Error("Chat not found");
  }

  if (chat.userId !== userId) {
    throw new Error("UNAUTHORIZED");
  }

  await saveVoteMessage({
    chatId: parsed.chatId,
    messageId: parsed.messageId,
    type: parsed.type,
  });

  return { success: true };
}
