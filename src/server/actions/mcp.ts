"use server";

import { requestInfo } from "rwsdk/worker";
import type { z } from "zod";
import {
  type ConnectionStatusResult,
  createCachedConnectionStatus,
  createCachedDiscovery,
  type DiscoveryResult,
  invalidateAllMcpCaches,
} from "@/lib/ai/mcp/cache";
import { getOrCreateMcpClient, removeMcpClient } from "@/lib/ai/mcp/mcp-client";
import { generateMcpNameId } from "@/lib/ai/mcp-name-id";
import { auth } from "@/lib/auth";
import { config } from "@/lib/config";
import {
  createMcpConnector,
  deleteMcpConnector,
  deleteSessionsByConnectorId,
  getAuthenticatedSession,
  getMcpConnectorById,
  getMcpConnectorByNameId,
  getMcpConnectorsByUserId,
  updateMcpConnector,
} from "@/lib/db/mcp-queries";
import { createModuleLogger } from "@/lib/logger";
import {
  mcpCreateInputSchema,
  mcpDiscoverInputSchema,
  mcpIdInputSchema,
  mcpToggleEnabledInputSchema,
  mcpUpdateInputSchema,
} from "@/lib/schemas/mcp";

const log = createModuleLogger("mcp.actions");

type Permission = "own" | "own-or-global";

type McpCreateInput = z.infer<typeof mcpCreateInputSchema>;
type McpUpdateInput = z.infer<typeof mcpUpdateInputSchema>;
type McpIdInput = z.infer<typeof mcpIdInputSchema>;
type McpToggleEnabledInput = z.infer<typeof mcpToggleEnabledInputSchema>;
type McpDiscoverInput = z.infer<typeof mcpDiscoverInputSchema>;

function assertMcpEnabled() {
  if (!config.integrations.mcp) {
    throw new Error("MCP integration disabled");
  }
}

async function requireUser() {
  const session = await auth.api.getSession({
    headers: requestInfo.request.headers,
  });

  if (!session?.user) {
    throw new Error("UNAUTHORIZED");
  }

  const { id, ...rest } = session.user;
  if (!id) {
    console.error("User ID missing in session callback");
    throw new Error("UNAUTHORIZED");
  }

  return { id, ...rest };
}

/**
 * Validates and generates a nameId from a connector name.
 * Throws Error if the name is invalid or the namespace already exists.
 */
async function validateAndGenerateNameId({
  name,
  userId,
  excludeId,
}: {
  name: string;
  userId: string | null;
  excludeId?: string;
}): Promise<string> {
  assertMcpEnabled();
  const result = generateMcpNameId(name);
  if (!result.ok) {
    throw new Error(
      result.error === "empty"
        ? "Connector name must contain at least one alphanumeric character"
        : 'Connector name cannot be "global" (reserved)'
    );
  }

  const existing = await getMcpConnectorByNameId({
    userId,
    nameId: result.nameId,
    excludeId,
  });

  if (existing) {
    throw new Error(
      `A connector with namespace "${result.nameId}" already exists. Choose a different name.`
    );
  }

  return result.nameId;
}

/**
 * Fetches connector and validates user permission.
 * - "own": user must own the connector (userId === ctx.user.id)
 * - "own-or-global": user must own OR connector is global (userId === null)
 */
async function getConnectorWithPermission({
  id,
  userId,
  permission,
}: {
  id: string;
  userId: string;
  permission: Permission;
}) {
  const connector = await getMcpConnectorById({ id });
  if (!connector) {
    throw new Error("Connector not found");
  }

  const isOwner = connector.userId === userId;
  const isGlobal = connector.userId === null;

  const hasPermission = permission === "own" ? isOwner : isOwner || isGlobal;

  if (!hasPermission) {
    throw new Error("Cannot access this connector");
  }

  return connector;
}

export async function list() {
  const user = await requireUser();
  if (!config.integrations.mcp) {
    return [];
  }
  return await getMcpConnectorsByUserId({ userId: user.id });
}

/**
 * List connectors with their connection status.
 * Returns only connectors that have a valid connection (for use in dropdowns, etc.)
 * Still includes enabled/disabled state so UI can show toggles.
 */
export async function listConnected() {
  const user = await requireUser();
  if (!config.integrations.mcp) {
    return [];
  }
  const connectors = await getMcpConnectorsByUserId({ userId: user.id });

  const results = await Promise.all(
    connectors.map(async (connector) => {
      const fetchConnectionStatus =
        async (): Promise<ConnectionStatusResult> => {
          const mcpClient = getOrCreateMcpClient({
            id: connector.id,
            name: connector.name,
            url: connector.url,
            type: connector.type,
          });
          const result = await mcpClient.attemptConnection();
          return {
            status: result.status,
            needsAuth: result.needsAuth,
            error: result.error,
          };
        };

      const cachedFetch = createCachedConnectionStatus(
        connector.id,
        fetchConnectionStatus
      );

      try {
        const status = await cachedFetch();
        return { connector, status };
      } catch {
        return { connector, status: null };
      }
    })
  );

  return results
    .filter((r) => r.status?.status === "connected")
    .map((r) => r.connector);
}

export async function create(input: McpCreateInput) {
  const user = await requireUser();
  const parsed = mcpCreateInputSchema.parse(input);
  assertMcpEnabled();
  const nameId = await validateAndGenerateNameId({
    name: parsed.name,
    userId: user.id,
  });

  return await createMcpConnector({
    userId: user.id,
    name: parsed.name,
    nameId,
    url: parsed.url,
    type: parsed.type,
    oauthClientId: parsed.oauthClientId,
    oauthClientSecret: parsed.oauthClientSecret,
  });
}

export async function update(input: McpUpdateInput) {
  const user = await requireUser();
  const parsed = mcpUpdateInputSchema.parse(input);
  assertMcpEnabled();
  const connector = await getConnectorWithPermission({
    id: parsed.id,
    userId: user.id,
    permission: "own",
  });

  const updates = { ...parsed.updates };
  if (updates.name) {
    const nameId = await validateAndGenerateNameId({
      name: updates.name,
      userId: connector.userId,
      excludeId: parsed.id,
    });
    (updates as typeof updates & { nameId: string }).nameId = nameId;
  }

  await updateMcpConnector({ id: parsed.id, updates });
  return { success: true };
}

export async function deleteConnector(input: McpIdInput) {
  const user = await requireUser();
  const parsed = mcpIdInputSchema.parse(input);
  assertMcpEnabled();
  await getConnectorWithPermission({
    id: parsed.id,
    userId: user.id,
    permission: "own",
  });
  await deleteMcpConnector({ id: parsed.id });
  await removeMcpClient(parsed.id);
  return { success: true };
}

export async function disconnect(input: McpIdInput) {
  const user = await requireUser();
  const parsed = mcpIdInputSchema.parse(input);
  assertMcpEnabled();
  await getConnectorWithPermission({
    id: parsed.id,
    userId: user.id,
    permission: "own-or-global",
  });
  await deleteSessionsByConnectorId({ mcpConnectorId: parsed.id });
  await removeMcpClient(parsed.id);
  invalidateAllMcpCaches(parsed.id);
  return { success: true };
}

export async function toggleEnabled(input: McpToggleEnabledInput) {
  const user = await requireUser();
  const parsed = mcpToggleEnabledInputSchema.parse(input);
  assertMcpEnabled();
  await getConnectorWithPermission({
    id: parsed.id,
    userId: user.id,
    permission: "own",
  });
  await updateMcpConnector({
    id: parsed.id,
    updates: { enabled: parsed.enabled },
  });
  return { success: true };
}

/**
 * Lightweight connection test - just checks if we can connect without full discovery.
 * Much faster than discover since it doesn't fetch tools/resources/prompts.
 * Cached for 60 seconds.
 */
export async function testConnection(input: McpIdInput) {
  const user = await requireUser();
  const parsed = mcpIdInputSchema.parse(input);
  assertMcpEnabled();
  const connector = await getConnectorWithPermission({
    id: parsed.id,
    userId: user.id,
    permission: "own-or-global",
  });

  const fetchConnectionStatus = async (): Promise<ConnectionStatusResult> => {
    log.debug(
      { connectorId: connector.id, url: connector.url },
      "testing MCP connection (cache miss)"
    );

    const mcpClient = getOrCreateMcpClient({
      id: connector.id,
      name: connector.name,
      url: connector.url,
      type: connector.type,
    });

    const result = await mcpClient.attemptConnection();

    log.debug(
      {
        connectorId: connector.id,
        status: result.status,
        needsAuth: result.needsAuth,
        error: result.error,
      },
      "MCP connection test completed"
    );

    return {
      status: result.status,
      needsAuth: result.needsAuth,
      error: result.error,
    };
  };

  const cachedFetch = createCachedConnectionStatus(
    connector.id,
    fetchConnectionStatus
  );

  return cachedFetch();
}

/**
 * Discover tools, resources, and prompts from an MCP server.
 * Cached for 5 minutes.
 */
export async function discover(input: McpDiscoverInput) {
  const user = await requireUser();
  const parsed = mcpDiscoverInputSchema.parse(input);
  assertMcpEnabled();
  const connector = await getConnectorWithPermission({
    id: parsed.id,
    userId: user.id,
    permission: "own-or-global",
  });

  const fetchDiscovery = async (): Promise<DiscoveryResult> => {
    log.debug(
      { connectorId: connector.id, url: connector.url },
      "creating MCP client for discovery (cache miss)"
    );

    // Use OAuth-aware client
    const mcpClient = getOrCreateMcpClient({
      id: connector.id,
      name: connector.name,
      url: connector.url,
      type: connector.type,
    });

    await mcpClient.connect();

    // Check if authorization is needed
    if (mcpClient.status === "authorizing") {
      throw new Error("Connector requires OAuth authorization");
    }

    if (mcpClient.status !== "connected") {
      throw new Error(
        `Failed to connect to MCP server (status: ${mcpClient.status})`
      );
    }

    log.debug(
      { connectorId: connector.id },
      "MCP client connected, discovering capabilities"
    );

    try {
      const [toolsResult, resourcesResult, promptsResult] = await Promise.all([
        mcpClient
          .tools()
          .then((tools) =>
            Object.entries(tools).map(([name, tool]) => ({
              name,
              description: tool.description ?? null,
            }))
          )
          .catch((err) => {
            log.warn(
              { connectorId: connector.id, err },
              "failed to list tools"
            );
            return [];
          }),
        mcpClient
          .listResources()
          .then((r) =>
            r.resources.map((res) => ({
              name: res.name,
              uri: res.uri,
              description: res.description ?? null,
              mimeType: res.mimeType ?? null,
            }))
          )
          .catch((err) => {
            log.warn(
              { connectorId: connector.id, err },
              "failed to list resources"
            );
            return [];
          }),
        mcpClient
          .listPrompts()
          .then((r) =>
            r.prompts.map((p) => ({
              name: p.name,
              description: p.description ?? null,
              arguments:
                p.arguments?.map((arg) => ({
                  name: arg.name,
                  description: arg.description ?? null,
                  required: arg.required ?? false,
                })) ?? [],
            }))
          )
          .catch((err) => {
            log.warn(
              { connectorId: connector.id, err },
              "failed to list prompts"
            );
            return [];
          }),
      ]);

      log.info(
        {
          connectorId: connector.id,
          toolsCount: toolsResult.length,
          resourcesCount: resourcesResult.length,
          promptsCount: promptsResult.length,
        },
        "MCP discovery completed"
      );

      return {
        tools: toolsResult,
        resources: resourcesResult,
        prompts: promptsResult,
      };
    } finally {
      // Don't close the client - keep it cached for reuse
      log.debug({ connectorId: connector.id }, "MCP discovery finished");
    }
  };

  const cachedFetch = createCachedDiscovery(connector.id, fetchDiscovery);

  return cachedFetch();
}

/**
 * Initiate OAuth authorization for an MCP connector.
 * Returns the authorization URL that the client should open in a popup.
 */
export async function authorize(input: McpIdInput) {
  const user = await requireUser();
  const parsed = mcpIdInputSchema.parse(input);
  assertMcpEnabled();
  const connector = await getConnectorWithPermission({
    id: parsed.id,
    userId: user.id,
    permission: "own-or-global",
  });

  log.info({ connectorId: connector.id }, "Initiating OAuth authorization");

  // Remove any existing client to force a fresh connection
  await removeMcpClient(connector.id);

  // Create a new client and attempt to connect
  const mcpClient = getOrCreateMcpClient({
    id: connector.id,
    name: connector.name,
    url: connector.url,
    type: connector.type,
  });

  await mcpClient.connect();

  if (mcpClient.status !== "authorizing") {
    throw new Error("Connector does not require OAuth authorization");
  }

  const authUrl = mcpClient.getAuthorizationUrl();
  if (!authUrl) {
    throw new Error("Failed to get authorization URL");
  }

  log.info(
    { connectorId: connector.id, authUrl: authUrl.toString() },
    "OAuth authorization URL generated"
  );

  return { authorizationUrl: authUrl.toString() };
}

/**
 * Check if a connector has valid OAuth tokens.
 */
export async function checkAuth(input: McpIdInput) {
  const user = await requireUser();
  const parsed = mcpIdInputSchema.parse(input);
  assertMcpEnabled();
  const connector = await getConnectorWithPermission({
    id: parsed.id,
    userId: user.id,
    permission: "own-or-global",
  });

  const session = await getAuthenticatedSession({
    mcpConnectorId: connector.id,
  });

  return {
    isAuthenticated: !!session?.tokens,
    hasSession: !!session,
  };
}

/**
 * Refresh/reconnect an MCP client after OAuth completion.
 */
export async function refreshClient(input: McpIdInput) {
  const user = await requireUser();
  const parsed = mcpIdInputSchema.parse(input);
  assertMcpEnabled();
  const connector = await getConnectorWithPermission({
    id: parsed.id,
    userId: user.id,
    permission: "own-or-global",
  });

  await removeMcpClient(connector.id);
  invalidateAllMcpCaches(connector.id);

  const mcpClient = getOrCreateMcpClient({
    id: connector.id,
    name: connector.name,
    url: connector.url,
    type: connector.type,
  });

  await mcpClient.connect();

  return {
    status: mcpClient.status,
    needsAuth: mcpClient.status === "authorizing",
  };
}
