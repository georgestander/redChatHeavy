"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Globe, Plug, Settings } from "lucide-react";
import { memo } from "react";
import { toast } from "sonner";
import Link from "@/components/link";
import { config } from "@/lib/config";
import { mcpKeys } from "@/lib/query-keys";
import { useSession } from "@/providers/session-provider";
import {
  listConnected as listConnectedAction,
  toggleEnabled as toggleEnabledAction,
} from "@/server/actions/mcp";
import { Favicon } from "./favicon";
import { getGoogleFaviconUrl } from "./get-google-favicon-url";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Switch } from "./ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

function PureConnectorsDropdown() {
  const queryClient = useQueryClient();

  const { data: session } = useSession();
  const isAuthenticated = !!session?.user;

  const { data: connectors } = useQuery({
    queryKey: mcpKeys.listConnected,
    queryFn: listConnectedAction,
    enabled: config.integrations.mcp && isAuthenticated,
  });

  const queryKey = mcpKeys.listConnected;

  const { mutate: toggleEnabled } = useMutation({
    mutationFn: toggleEnabledAction,
    onMutate: async (newData) => {
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData(queryKey);
      queryClient.setQueryData(queryKey, (old: typeof connectors) => {
        if (!old) {
          return old;
        }
        return old.map((c) =>
          c.id === newData.id ? { ...c, enabled: newData.enabled } : c
        );
      });
      return { prev };
    },
    onError: (_err, _newData, context) => {
      queryClient.setQueryData(queryKey, context?.prev);
      toast.error("Failed to update connector");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });
  if (!config.integrations.mcp) {
    return null;
  }
  if (!connectors || connectors.length === 0) {
    return null;
  }

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              className="@[500px]:h-10 h-8 @[500px]:gap-2 gap-1 p-1.5 px-2.5"
              size="sm"
              variant="ghost"
            >
              <Plug size={14} />
              <span className="@[500px]:inline hidden">Connectors</span>
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>MCP Connectors</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align="start"
        className="w-56"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {connectors.map((connector) => {
          const faviconUrl =
            connector.type === "http" ? getGoogleFaviconUrl(connector.url) : "";
          return (
            <DropdownMenuItem
              className="flex items-center gap-2"
              key={connector.id}
              onSelect={(e) => e.preventDefault()}
            >
              <div className="flex size-5 shrink-0 items-center justify-center">
                {faviconUrl ? (
                  <>
                    <Favicon className="size-4 rounded-sm" url={faviconUrl} />
                    <Globe className="hidden size-4 text-muted-foreground" />
                  </>
                ) : (
                  <Globe className="size-4 text-muted-foreground" />
                )}
              </div>
              <span className="flex-1 truncate text-sm">{connector.name}</span>
              <Switch
                checked={connector.enabled}
                className="scale-75"
                onCheckedChange={(enabled) =>
                  toggleEnabled({ id: connector.id, enabled })
                }
                onClick={(e) => e.stopPropagation()}
              />
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link className="flex items-center gap-2" href="/settings/connectors">
            <Settings className="size-4" />
            <span>Manage Connectors</span>
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export const ConnectorsDropdown = memo(PureConnectorsDropdown);
