import { z } from "zod";

export const getVotesInputSchema = z.object({ chatId: z.string() });
export const voteMessageInputSchema = z.object({
  chatId: z.string(),
  messageId: z.string(),
  type: z.enum(["up", "down"]),
});
