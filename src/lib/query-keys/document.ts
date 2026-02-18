export const documentKeys = {
  byMessageId: (messageId: string) =>
    ["document", "byMessageId", messageId] as const,
  publicByMessageId: (messageId: string) =>
    ["document", "publicByMessageId", messageId] as const,
} as const;
