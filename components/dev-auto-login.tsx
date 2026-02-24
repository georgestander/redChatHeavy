"use client";

import { useEffect, useRef } from "react";
import { useSession } from "@/providers/session-provider";

export function DevAutoLogin({ enabled }: { enabled: boolean }) {
  const { data: session, isPending } = useSession();
  const hasTriggered = useRef(false);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    if (hasTriggered.current || isPending || session?.user) {
      return;
    }

    hasTriggered.current = true;
    const next = `${window.location.pathname}${window.location.search}`;
    window.location.assign(`/api/dev-login?next=${encodeURIComponent(next)}`);
  }, [enabled, isPending, session?.user]);

  return null;
}
