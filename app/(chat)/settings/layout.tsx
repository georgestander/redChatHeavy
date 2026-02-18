import { SettingsHeader } from "@/components/settings/settings-header";
import { SettingsNav } from "@/components/settings/settings-nav";

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex h-dvh max-h-dvh w-full max-w-4xl flex-1 flex-col px-2 py-2 md:px-4">
      <SettingsHeader />
      {/* Mobile: horizontal tabs on top */}
      <div className="mb-4 md:hidden">
        <SettingsNav orientation="horizontal" />
      </div>
      <div className="flex min-h-0 flex-1 gap-4">
        {/* Desktop: vertical nav on side */}
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
