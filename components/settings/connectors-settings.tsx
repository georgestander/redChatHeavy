"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowUpRight,
  Loader2,
  MoreHorizontal,
  Plus,
  Radio,
  Trash2,
} from "lucide-react";
import { Fragment, useCallback, useMemo } from "react";
import { toast } from "sonner";
import Link from "@/components/link";
import { ConnectorHeader } from "@/components/settings/connector-header";
import { McpConnectDialog } from "@/components/settings/mcp-connect-dialog";
import { McpCreateDialog } from "@/components/settings/mcp-create-dialog";
import { SettingsPageContent } from "@/components/settings/settings-page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { updateSearchParams, useSearchParams } from "@/hooks/use-navigation";
import { config } from "@/lib/config";
import type { McpConnector } from "@/lib/db/schema";
import {
  type McpConnectorsDialog,
  parseMcpConnectorsSearchParams,
} from "@/lib/mcp-search-params";
import { mcpKeys } from "@/lib/query-keys";
import { useSession } from "@/providers/session-provider";
import {
  checkAuth as checkConnectorAuth,
  deleteConnector as deleteConnectorAction,
  disconnect as disconnectConnectorAction,
  list as listConnectorsAction,
  testConnection as testConnectionAction,
} from "@/server/actions/mcp";

export function ConnectorsSettings() {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const isAuthenticated = !!session?.user;

  const searchParams = useSearchParams();
  const qs = useMemo(
    () => parseMcpConnectorsSearchParams(searchParams),
    [searchParams]
  );

  const { data: connectors, isLoading } = useQuery({
    queryKey: mcpKeys.list,
    queryFn: listConnectorsAction,
    enabled: config.integrations.mcp && isAuthenticated,
  });

  const createOpen = qs.dialog === "config";
  const connectOpen = qs.dialog === "connect";

  const connectConnector = useMemo(() => {
    if (!(connectOpen && qs.connectorId && connectors)) {
      return null;
    }
    return connectors.find((c) => c.id === qs.connectorId) ?? null;
  }, [connectOpen, qs.connectorId, connectors]);

  const queryKey = mcpKeys.list;

  const { mutate: deleteConnector } = useMutation({
    mutationFn: deleteConnectorAction,
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData(queryKey);
      queryClient.setQueryData(queryKey, (old: typeof connectors) => {
        if (!old) {
          return old;
        }
        return old.filter((c) => c.id !== data.id);
      });
      return { prev };
    },
    onError: (_err, _data, context) => {
      queryClient.setQueryData(queryKey, context?.prev);
      toast.error("Failed to uninstall connector");
    },
    onSuccess: () => {
      toast.success("Connector uninstalled");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const { mutate: disconnectConnector, isPending: isDisconnecting } =
    useMutation({
      mutationFn: disconnectConnectorAction,
      onSuccess: () => {
        toast.success("Disconnected");
      },
      onError: (err) => {
        toast.error(err.message || "Failed to disconnect");
      },
      onSettled: (_data, _err, vars) => {
        queryClient.invalidateQueries({ queryKey });
        queryClient.invalidateQueries({
          queryKey: mcpKeys.checkAuth(vars.id),
        });
        queryClient.invalidateQueries({
          queryKey: mcpKeys.discover(vars.id),
        });
      },
    });

  const setDialogState = useCallback(
    ({
      dialog,
      connectorId,
    }: {
      dialog: McpConnectorsDialog | null;
      connectorId?: string | null;
    }) => {
      const nextParams = new URLSearchParams(searchParams.toString());
      if (dialog) {
        nextParams.set("dialog", dialog);
      } else {
        nextParams.delete("dialog");
      }

      if (connectorId) {
        nextParams.set("connectorId", connectorId);
      } else {
        nextParams.delete("connectorId");
      }

      updateSearchParams(nextParams, { history: "replace" });
    },
    [searchParams]
  );

  const handleOpenCreateDialog = useCallback(() => {
    setDialogState({ dialog: "config" });
  }, [setDialogState]);

  const handleDialogClose = () => {
    setDialogState({ dialog: null });
  };

  const handleOpenConnectDialog = useCallback(
    (connectorId: string) => {
      setDialogState({ dialog: "connect", connectorId });
    },
    [setDialogState]
  );

  const handleConnectDialogClose = useCallback(() => {
    setDialogState({ dialog: null });
  }, [setDialogState]);

  if (!config.integrations.mcp) {
    return (
      <SettingsPageContent className="gap-4">
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="font-medium text-sm">MCP is not enabled</p>
        </div>
      </SettingsPageContent>
    );
  }
  if (isLoading) {
    return (
      <SettingsPageContent className="gap-4">
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map((i) => (
            <div className="h-20 rounded-lg bg-muted/50" key={i} />
          ))}
        </div>
      </SettingsPageContent>
    );
  }

  const customConnectors = (connectors ?? []).filter((c) => c.userId !== null);
  const globalConnectors = (connectors ?? []).filter((c) => c.userId === null);

  return (
    <SettingsPageContent className="gap-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-medium text-sm">Custom connectors</p>
          <p className="mt-0.5 text-muted-foreground text-xs">
            Connect MCP servers you trust to extend your AI with tools.
          </p>
        </div>
        <Button onClick={handleOpenCreateDialog} size="sm">
          <Plus className="size-4" />
          Add custom connector
        </Button>
      </div>

      <div className="flex flex-col">
        {customConnectors.length > 0 ? (
          customConnectors.map((connector, index) => (
            <Fragment key={connector.id}>
              <CustomConnectorRow
                connector={connector}
                isAuthenticated={isAuthenticated}
                isDisconnecting={isDisconnecting}
                onConnect={() => handleOpenConnectDialog(connector.id)}
                onDisconnect={() => disconnectConnector({ id: connector.id })}
                onUninstall={() => deleteConnector({ id: connector.id })}
              />
              {index < customConnectors.length - 1 ? <Separator /> : null}
            </Fragment>
          ))
        ) : (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="mb-4 rounded-full bg-muted p-3">
              <Radio className="size-6 text-muted-foreground" />
            </div>
            <p className="font-medium text-sm">No custom connectors</p>
            <p className="mt-1 max-w-sm text-muted-foreground text-xs">
              Add a custom MCP connector to access tools from your services.
            </p>
          </div>
        )}
      </div>

      {globalConnectors.length > 0 ? (
        <div>
          <p className="font-medium text-sm">Built-in connectors</p>
          <div className="divide-y">
            {globalConnectors.map((connector) => (
              <BuiltInConnectorRow connector={connector} key={connector.id} />
            ))}
          </div>
        </div>
      ) : null}

      <McpCreateDialog onClose={handleDialogClose} open={createOpen} />

      <McpConnectDialog
        connector={connectConnector}
        onClose={handleConnectDialogClose}
        open={connectOpen}
      />
    </SettingsPageContent>
  );
}

function CustomConnectorRow({
  connector,
  onConnect,
  onUninstall,
  onDisconnect,
  isDisconnecting,
  isAuthenticated,
}: {
  connector: McpConnector;
  onConnect: () => void;
  onUninstall: () => void;
  onDisconnect: () => void;
  isDisconnecting: boolean;
  isAuthenticated: boolean;
}) {
  const { data: authStatus } = useQuery({
    queryKey: mcpKeys.checkAuth(connector.id),
    queryFn: () => checkConnectorAuth({ id: connector.id }),
    staleTime: 30_000,
    enabled: isAuthenticated,
  });

  const { isLoading: isTestingConnection, data: connectionStatus } = useQuery({
    queryKey: mcpKeys.testConnection(connector.id),
    queryFn: () => testConnectionAction({ id: connector.id }),
    staleTime: 30_000,
    retry: false,
    enabled: isAuthenticated,
  });

  const needsOAuth = connectionStatus?.needsAuth ?? false;
  const isConnected = connectionStatus?.status === "connected";
  const isIncompatible = connectionStatus?.status === "incompatible";

  const statusText = (() => {
    if (isTestingConnection) {
      return "Checking connection…";
    }
    if (isIncompatible) {
      return "Incompatible server";
    }
    if (needsOAuth) {
      return "Authorization required";
    }
    if (isConnected) {
      return "Connected";
    }
    return connectionStatus?.error ?? "Unable to reach server";
  })();

  const actionLabel = (() => {
    if (isTestingConnection) {
      return "Loading";
    }
    if (needsOAuth) {
      return "Connect";
    }
    return "Configure";
  })();

  const href: `/settings/connectors/${string}` = `/settings/connectors/${connector.id}`;

  const showOAuthButton = needsOAuth && !isIncompatible;
  const showDetailsButton = !(needsOAuth || isIncompatible);

  return (
    <div className="flex items-center gap-4 py-3">
      <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden text-left">
        <ConnectorHeader
          isCustom
          name={connector.name}
          statusText={statusText}
          type={connector.type}
          url={connector.url}
        />
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {isIncompatible ? (
          <Badge className="gap-1" variant="destructive">
            <AlertTriangle className="size-3" />
            Error
          </Badge>
        ) : null}

        {showOAuthButton ? (
          <Button disabled={isTestingConnection} onClick={onConnect} size="sm">
            {isTestingConnection ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" />
                Loading
              </span>
            ) : (
              <span className="inline-flex items-center gap-2">
                Connect
                <ArrowUpRight className="-mr-1 size-4" />
              </span>
            )}
          </Button>
        ) : null}

        {showDetailsButton ? (
          <Button
            asChild
            disabled={isTestingConnection}
            size="sm"
            variant="outline"
          >
            <Link href={href}>
              {isTestingConnection ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" />
                  Loading
                </span>
              ) : (
                <span className="inline-flex items-center gap-2">
                  {actionLabel}
                </span>
              )}
            </Link>
          </Button>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {authStatus?.isAuthenticated ? (
              <>
                <DropdownMenuItem
                  disabled={isDisconnecting}
                  onClick={onDisconnect}
                >
                  Disconnect
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            ) : null}
            {needsOAuth ? (
              <>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.preventDefault();
                    onConnect();
                  }}
                >
                  Connect
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            ) : null}
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={onUninstall}
            >
              <Trash2 className="size-4" />
              Uninstall
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function BuiltInConnectorRow({ connector }: { connector: McpConnector }) {
  const href: `/settings/connectors/${string}` = `/settings/connectors/${connector.id}`;
  return (
    <div className="flex w-full items-center gap-3 py-3 text-left">
      <ConnectorHeader
        isCustom={false}
        name={connector.name}
        type={connector.type}
        url={connector.url}
      />
      <Button asChild size="sm" variant="outline">
        <Link href={href}>View</Link>
      </Button>
    </div>
  );
}
