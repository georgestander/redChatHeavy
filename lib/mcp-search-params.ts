const mcpConnectorsDialogValues = ["config", "connect"] as const;

export type McpConnectorsDialog = (typeof mcpConnectorsDialogValues)[number];

function isMcpConnectorsDialog(
  value: string | null
): value is McpConnectorsDialog {
  if (!value) {
    return false;
  }
  return (mcpConnectorsDialogValues as readonly string[]).includes(value);
}

export function parseMcpConnectorsSearchParams(searchParams: URLSearchParams) {
  const dialog = searchParams.get("dialog");
  const connectorId = searchParams.get("connectorId");

  return {
    dialog: isMcpConnectorsDialog(dialog) ? dialog : null,
    connectorId: connectorId || null,
  };
}

export function parseMcpOAuthCallbackSearchParams(url: URL) {
  const searchParams = url.searchParams;

  return {
    code: searchParams.get("code") || null,
    state: searchParams.get("state") || null,
    error: searchParams.get("error") || null,
    error_description: searchParams.get("error_description") || null,
  };
}
