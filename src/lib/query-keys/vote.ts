export const voteKeys = {
  byChatId: (chatId: string) => ["vote", "byChatId", chatId] as const,
} as const;
