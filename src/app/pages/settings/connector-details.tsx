import { McpDetailsPage } from "@/components/settings/mcp-details-page";
import {
  SettingsPage,
  SettingsPageHeader,
} from "@/components/settings/settings-page";

export function SettingsConnectorDetailsPage({
  connectorId,
}: {
  connectorId: string;
}) {
  return (
    <>
      <title>Settings · Connector</title>
      <SettingsPage>
        <SettingsPageHeader>
          <h2 className="font-semibold text-lg">Connector details</h2>
          <p className="text-muted-foreground text-sm">
            Tools, resources, and authorization status.
          </p>
        </SettingsPageHeader>
        <McpDetailsPage connectorId={connectorId} />
      </SettingsPage>
    </>
  );
}
