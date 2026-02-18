export const mcpKeys = {
  list: ["mcp", "list"] as const,
  listConnected: ["mcp", "listConnected"] as const,
  discover: (id: string) => ["mcp", "discover", id] as const,
  checkAuth: (id: string) => ["mcp", "checkAuth", id] as const,
  testConnection: (id: string) => ["mcp", "testConnection", id] as const,
} as const;
