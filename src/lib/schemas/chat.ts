import { z } from "zod";
import { MAX_MESSAGE_CHARS } from "@/lib/limits/tokens";

export const chatGetAllChatsInputSchema = z
  .object({
    projectId: z.uuid().optional().nullable(),
  })
  .optional();

export const chatIdInputSchema = z.object({
  chatId: z.string().uuid(),
});

export const chatRenameInputSchema = z.object({
  chatId: z.string().uuid(),
  title: z.string().min(1).max(255),
});

export const chatMessageIdInputSchema = z.object({
  messageId: z.string().uuid(),
});

export const chatSetVisibilityInputSchema = z.object({
  chatId: z.string().uuid(),
  visibility: z.enum(["private", "public"]),
});

export const chatSetIsPinnedInputSchema = z.object({
  chatId: z.string().uuid(),
  isPinned: z.boolean(),
});

export const chatGenerateTitleInputSchema = z.object({
  message: z.string().min(1).max(MAX_MESSAGE_CHARS),
});
