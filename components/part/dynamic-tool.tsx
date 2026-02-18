"use client";

import { useQuery } from "@tanstack/react-query";
import type { DynamicToolUIPart } from "ai";
import { WrenchIcon } from "lucide-react";
import { useMemo } from "react";
import { McpToolHeader } from "@/components/ai-elements/extra/mcp-tool-header";
import {
  Tool,
  ToolContent,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import { Favicon } from "@/components/favicon";
import { parseToolId } from "@/lib/ai/mcp-name-id";
import { mcpKeys } from "@/lib/query-keys";
import { useSession } from "@/providers/session-provider";
import { list as listConnectors } from "@/server/actions/mcp";
import { getGoogleFaviconUrl } from "../get-google-favicon-url";

type DynamicToolPartProps = {
  messageId: string;
  isReadonly: boolean;
  part: DynamicToolUIPart;
};

export function DynamicToolPart({ part }: DynamicToolPartProps) {
  const { data: session } = useSession();
  const isAuthenticated = !!session?.user;
  const { data: connectors } = useQuery({
    queryKey: mcpKeys.list,
    queryFn: listConnectors,
    enabled: isAuthenticated,
  });

  const parsed = useMemo(() => parseToolId(part.toolName), [part.toolName]);

  const iconUrl = useMemo(() => {
    if (!(parsed && connectors)) {
      return;
    }

    const connector = connectors.find((c) => c.nameId === parsed.namespace);
    if (!connector) {
      return;
    }

    return getGoogleFaviconUrl(connector.url);
  }, [parsed, connectors]);

  const icon = iconUrl ? (
    <Favicon className="size-4 rounded-sm" url={iconUrl} />
  ) : (
    <WrenchIcon className="size-4 text-muted-foreground" />
  );

  return (
    <Tool defaultOpen={false}>
      <McpToolHeader
        icon={icon}
        state={part.state}
        title={part.title ?? parsed?.toolName ?? part.toolName}
        type={`tool-${part.toolName}`}
      />
      <ToolContent>
        <ToolInput input={part.input} />
        <ToolOutput
          errorText={part.state === "output-error" ? part.errorText : undefined}
          output={part.state === "output-available" ? part.output : undefined}
        />
      </ToolContent>
    </Tool>
  );
}
