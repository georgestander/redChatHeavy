// Hooks enabled by the with-threads middleware

import { useCallback } from "react";
import { useStoreWithEqualityFn } from "zustand/traditional";
import type { ChatMessage } from "../ai/types";
import {
  type CustomChatStoreState,
  useCustomChatStoreApi,
} from "./custom-store-provider";

function useThreadStore<T>(
  selector: (store: CustomChatStoreState<ChatMessage>) => T,
  equalityFn?: (a: T, b: T) => boolean
): T {
  const store = useCustomChatStoreApi<ChatMessage>();
  if (!store) {
    throw new Error("useThreadStore must be used within ChatStoreProvider");
  }
  return useStoreWithEqualityFn(store, selector, equalityFn);
}

export const useThreadEpoch = () =>
  useThreadStore((state) => state.threadEpoch);

export const useThreadInitialMessages = () =>
  useThreadStore((state) => state.threadInitialMessages);

const _useBumpThreadEpoch = () => {
  const store = useCustomChatStoreApi<ChatMessage>();
  return useCallback(() => {
    store.getState().bumpThreadEpoch();
  }, [store]);
};

export const useResetThreadEpoch = () => {
  const store = useCustomChatStoreApi<ChatMessage>();
  return useCallback(() => {
    store.getState().resetThreadEpoch();
  }, [store]);
};

export const useSetMessagesWithEpoch = () => {
  const store = useCustomChatStoreApi<ChatMessage>();
  return useCallback(
    (messages: ChatMessage[]) => {
      store.getState().setMessagesWithEpoch(messages);
    },
    [store]
  );
};
