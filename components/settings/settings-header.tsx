"use client";

export function SettingsHeader() {
  return (
    <div className="mb-8 flex flex-col items-start gap-2">
      <div>
        <h1 className="font-semibold text-2xl">Settings</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          Manage your chat preferences and configurations.
        </p>
      </div>
    </div>
  );
}
