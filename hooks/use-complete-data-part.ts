"use client";

import { useChatActions, useChatStoreApi } from "@ai-sdk-tools/store";
import type { DataUIPart } from "ai";
import { useEffect, useRef } from "react";
import { useDataStream } from "@/components/data-stream-provider";
import type { ChatMessage, CustomUIDataTypes } from "@/lib/ai/types";

export function upsertMessagesFromAppendParts(
  currentMessages: ChatMessage[],
  dataParts: DataUIPart<CustomUIDataTypes>[]
): ChatMessage[] {
  let nextMessages = currentMessages;

  for (const dataPart of dataParts) {
    if (dataPart.type !== "data-appendMessage") {
      continue;
    }

    const message = JSON.parse(dataPart.data) as ChatMessage;
    const existingIdx = nextMessages.findIndex((m) => m.id === message.id);

    if (existingIdx !== -1) {
      nextMessages = [
        ...nextMessages.slice(0, existingIdx),
        message,
        ...nextMessages.slice(existingIdx + 1),
      ];
      continue;
    }

    nextMessages = [...nextMessages, message];
  }

  return nextMessages;
}

// Completes appendMessage data parts into concrete messages.
export function useCompleteDataPart() {
  const { dataStream } = useDataStream();
  const { setMessages } = useChatActions<ChatMessage>();
  const storeApi = useChatStoreApi<ChatMessage>();
  const lastProcessedIndexRef = useRef(-1);

  useEffect(() => {
    if (!dataStream || dataStream.length === 0) {
      lastProcessedIndexRef.current = -1;
      return;
    }

    const newDataParts = dataStream.slice(lastProcessedIndexRef.current + 1);
    lastProcessedIndexRef.current = dataStream.length - 1;

    const currentMessages = storeApi.getState().messages as ChatMessage[];
    const nextMessages = upsertMessagesFromAppendParts(
      currentMessages,
      newDataParts
    );
    if (nextMessages !== currentMessages) {
      setMessages(nextMessages);
    }
  }, [dataStream, setMessages, storeApi]);
}
