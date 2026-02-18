"use client";
import { useMemo } from "react";
import { ChatSystem } from "@/components/chat-system";
import { useSearchParams } from "@/hooks/use-navigation";
import type { AppModelId } from "@/lib/ai/app-models";
import { useChatId } from "@/providers/chat-id-provider";

export function ChatHome() {
  const { id } = useChatId();
  const searchParams = useSearchParams();
  const overrideModelId = useMemo(() => {
    const value = searchParams.get("modelId");
    return (value as AppModelId) || undefined;
  }, [searchParams]);
  return (
    <ChatSystem
      id={id}
      initialMessages={[]}
      isReadonly={false}
      overrideModelId={overrideModelId}
    />
  );
}
