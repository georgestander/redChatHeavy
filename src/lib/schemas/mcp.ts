import { z } from "zod";
import { MCP_NAME_MAX_LENGTH } from "@/lib/ai/mcp-name-id";

export const mcpCreateInputSchema = z.object({
  name: z.string().min(1).max(MCP_NAME_MAX_LENGTH),
  url: z.string().url(),
  type: z.enum(["http", "sse"]),
  oauthClientId: z.string().optional(),
  oauthClientSecret: z.string().optional(),
});

export const mcpUpdateInputSchema = z.object({
  id: z.string().uuid(),
  updates: z.object({
    name: z.string().min(1).max(MCP_NAME_MAX_LENGTH).optional(),
    url: z.string().url().optional(),
    type: z.enum(["http", "sse"]).optional(),
    oauthClientId: z.string().nullable().optional(),
    oauthClientSecret: z.string().nullable().optional(),
    enabled: z.boolean().optional(),
  }),
});

export const mcpIdInputSchema = z.object({ id: z.string().uuid() });

export const mcpToggleEnabledInputSchema = z.object({
  id: z.string().uuid(),
  enabled: z.boolean(),
});

export const mcpDiscoverInputSchema = z.object({ id: z.uuid() });
