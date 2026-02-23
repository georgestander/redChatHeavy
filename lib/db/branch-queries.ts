import "server-only";

import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { db } from "./client";
import { type ChatBranch, chatBranch, message } from "./schema";

export async function getChatBranchesByChatId({
  chatId,
}: {
  chatId: string;
}): Promise<ChatBranch[]> {
  return db
    .select()
    .from(chatBranch)
    .where(eq(chatBranch.chatId, chatId))
    .orderBy(asc(chatBranch.createdAt));
}

export async function getChatBranchById({
  branchId,
}: {
  branchId: string;
}): Promise<ChatBranch | null> {
  const [branch] = await db
    .select()
    .from(chatBranch)
    .where(eq(chatBranch.id, branchId));
  return branch ?? null;
}

export async function getRootChatBranchByChatId({
  chatId,
}: {
  chatId: string;
}): Promise<ChatBranch | null> {
  const [branch] = await db
    .select()
    .from(chatBranch)
    .where(
      and(eq(chatBranch.chatId, chatId), isNull(chatBranch.parentBranchId))
    )
    .orderBy(asc(chatBranch.createdAt));
  return branch ?? null;
}

export async function getLatestChatBranchByChatId({
  chatId,
}: {
  chatId: string;
}): Promise<ChatBranch | null> {
  const [branch] = await db
    .select()
    .from(chatBranch)
    .where(eq(chatBranch.chatId, chatId))
    .orderBy(desc(chatBranch.createdAt));
  return branch ?? null;
}

export async function createChatBranch(input: {
  id: string;
  chatId: string;
  parentBranchId?: string | null;
  title: string;
  createdFromMessageId?: string | null;
  createdFromStart?: number | null;
  createdFromEnd?: number | null;
  createdFromExcerpt?: string | null;
  headMessageId?: string | null;
  createdAt?: Date;
  archivedAt?: Date | null;
}): Promise<ChatBranch> {
  const [created] = await db
    .insert(chatBranch)
    .values({
      id: input.id,
      chatId: input.chatId,
      parentBranchId: input.parentBranchId ?? null,
      title: input.title,
      createdFromMessageId: input.createdFromMessageId ?? null,
      createdFromStart: input.createdFromStart ?? null,
      createdFromEnd: input.createdFromEnd ?? null,
      createdFromExcerpt: input.createdFromExcerpt ?? null,
      headMessageId: input.headMessageId ?? null,
      createdAt: input.createdAt ?? new Date(),
      archivedAt: input.archivedAt ?? null,
    })
    .returning();

  if (!created) {
    throw new Error("Failed to create chat branch");
  }

  return created;
}

export async function renameChatBranchById({
  branchId,
  title,
}: {
  branchId: string;
  title: string;
}): Promise<ChatBranch | null> {
  const [updated] = await db
    .update(chatBranch)
    .set({ title })
    .where(eq(chatBranch.id, branchId))
    .returning();
  return updated ?? null;
}

export async function updateChatBranchHeadMessage({
  branchId,
  headMessageId,
}: {
  branchId: string;
  headMessageId: string | null;
}): Promise<void> {
  await db
    .update(chatBranch)
    .set({ headMessageId })
    .where(eq(chatBranch.id, branchId));
}

export async function assignMessageBranchById({
  messageId,
  branchId,
}: {
  messageId: string;
  branchId: string | null;
}): Promise<void> {
  await db
    .update(message)
    .set({ branchId })
    .where(eq(message.id, messageId));
}

export async function assignMessagesWithoutBranchToRoot({
  chatId,
  rootBranchId,
}: {
  chatId: string;
  rootBranchId: string;
}): Promise<number> {
  const updatedRows = await db
    .update(message)
    .set({ branchId: rootBranchId })
    .where(and(eq(message.chatId, chatId), isNull(message.branchId)))
    .returning();

  return updatedRows.length;
}
