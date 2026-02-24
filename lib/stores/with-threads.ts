"use client";

// Middleware that extends @ai-sdk-tools/store with thread epoch tracking.
// NOTE: threadEpoch is intended for explicit thread switches. Bumping it
// during active request/stream phases remounts ChatSync and can abort the
// in-flight first-turn stream.

import type { StoreState as BaseChatStoreState } from "@ai-sdk-tools/store";
import type { UIMessage } from "ai";
import type { StateCreator } from "zustand";

export type ThreadAugmentedState<UM extends UIMessage> =
  BaseChatStoreState<UM> & {
    threadEpoch: number;
    /**
     * Snapshot of the currently-active thread to use as "initial messages" for
     * useChat on remounts. Intentionally NOT kept in sync with live messages;
     * only updated when switching threads (setMessagesWithEpoch) and on store init.
     */
    threadInitialMessages: UM[];
    bumpThreadEpoch: () => void;
    resetThreadEpoch: () => void;
    setMessagesWithEpoch: (messages: UM[]) => void;
  };

export const withThreads =
  <UI_MESSAGE extends UIMessage, T extends BaseChatStoreState<UI_MESSAGE>>(
    creator: StateCreator<T, [], []>
  ): StateCreator<T & ThreadAugmentedState<UI_MESSAGE>, [], []> =>
  (set, get, api) => {
    const base = creator(set, get, api);

    // Wrap the original setMessages to auto-bump epoch
    const originalSetMessages = base.setMessages;

    return {
      ...base,
      threadEpoch: 0,
      threadInitialMessages: base.messages,

      bumpThreadEpoch: () => {
        set((state) => ({
          ...state,
          threadEpoch: state.threadEpoch + 1,
        }));
      },

      resetThreadEpoch: () => {
        set((state) => ({
          ...state,
          threadEpoch: 0,
          threadInitialMessages: get().messages,
        }));
      },

      setMessagesWithEpoch: (messages: UI_MESSAGE[]) => {
        originalSetMessages(messages);
        set((state) => ({
          ...state,
          threadEpoch: state.threadEpoch + 1,
          threadInitialMessages: messages,
        }));
      },

      // Override setMessages to bump epoch only when thread shape changes in
      // stable UI states. During "submitted"/"streaming", remounting ChatSync
      // can drop the active request before tokens render.
      setMessages: (messages: UI_MESSAGE[]) => {
        const status = get().status;
        const shouldTrackThreadShift = status === "ready" || status === "error";

        if (!shouldTrackThreadShift) {
          originalSetMessages(messages);
          return;
        }

        const currentMessages = get().messages;
        const currentIds = currentMessages.map((m) => m.id).join(",");
        const newIds = messages.map((m) => m.id).join(",");

        originalSetMessages(messages);

        // Only bump epoch if the thread structure actually changed
        if (currentIds !== newIds) {
          set((state) => ({
            ...state,
            threadEpoch: state.threadEpoch + 1,
          }));
        }
      },
    };
  };
