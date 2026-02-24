import type { StoreState as BaseChatStoreState } from "@ai-sdk-tools/store";
import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import { createStore } from "zustand/vanilla";
import { withThreads } from "./with-threads";

type TestMessage = UIMessage;

function message(id: string): TestMessage {
  return {
    id,
    role: "user",
    parts: [],
  } as TestMessage;
}

function createTestStore(initialStatus: "ready" | "submitted" | "streaming" | "error") {
  const creator = ((set: (partial: unknown) => void) => ({
    messages: [message("m1")],
    status: initialStatus,
    setMessages: (messages: TestMessage[]) => {
      set({ messages });
    },
  })) as unknown as Parameters<typeof withThreads<TestMessage, BaseChatStoreState<TestMessage>>>[0];

  return createStore(withThreads<TestMessage, BaseChatStoreState<TestMessage>>(creator));
}

describe("withThreads", () => {
  it("does not bump threadEpoch while streaming", () => {
    const store = createTestStore("streaming");
    const before = store.getState().threadEpoch;

    store.getState().setMessages([message("m1"), message("m2")]);

    expect(store.getState().threadEpoch).toBe(before);
  });

  it("does not bump threadEpoch while submitted", () => {
    const store = createTestStore("submitted");
    const before = store.getState().threadEpoch;

    store.getState().setMessages([message("m1"), message("m2")]);

    expect(store.getState().threadEpoch).toBe(before);
  });

  it("bumps threadEpoch when ready and thread IDs change", () => {
    const store = createTestStore("ready");
    const before = store.getState().threadEpoch;

    store.getState().setMessages([message("m1"), message("m2")]);

    expect(store.getState().threadEpoch).toBe(before + 1);
  });
});
