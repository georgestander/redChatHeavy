export const chatKeys = {
  allChats: (projectId?: string | null) =>
    ["chat", "allChats", { projectId: projectId ?? null }] as const,
  byId: (chatId: string) => ["chat", "byId", chatId] as const,
  messages: (chatId: string) => ["chat", "messages", chatId] as const,
  branches: (chatId: string) => ["chat", "branches", chatId] as const,
  publicChat: (chatId: string) => ["chat", "publicChat", chatId] as const,
  publicMessages: (chatId: string) =>
    ["chat", "publicMessages", chatId] as const,
  publicBranches: (chatId: string) =>
    ["chat", "publicBranches", chatId] as const,
} as const;
