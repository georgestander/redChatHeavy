export const projectKeys = {
  list: ["project", "list"] as const,
  byId: (projectId: string) => ["project", "byId", projectId] as const,
} as const;
