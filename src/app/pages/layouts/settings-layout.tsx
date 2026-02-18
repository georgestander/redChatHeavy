import type { LayoutProps } from "rwsdk/router";
import { SettingsHeader } from "@/components/settings/settings-header";
import { SettingsNav } from "@/components/settings/settings-nav";

export function SettingsLayout({ children }: LayoutProps) {
  return (
    <div className="mx-auto flex h-dvh max-h-dvh w-full max-w-4xl flex-1 flex-col px-2 py-2 md:px-4">
      <SettingsHeader />
      <div className="mb-4 md:hidden">
        <SettingsNav orientation="horizontal" />
      </div>
      <div className="flex min-h-0 flex-1 gap-4">
        <div className="hidden md:block">
          <SettingsNav orientation="vertical" />
        </div>
        <div className="flex min-h-0 w-full flex-1 flex-col px-4">
          {children}
        </div>
      </div>
    </div>
  );
}
