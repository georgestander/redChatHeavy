import type { DataUIPart } from "ai";
import { describe, expect, it } from "vitest";
import type { ChatMessage, CustomUIDataTypes } from "@/lib/ai/types";
import { upsertMessagesFromAppendParts } from "./use-complete-data-part";

function createMessage(id: string, text: string): ChatMessage {
  return {
    id,
    role: "assistant",
    parts: [{ type: "text", text }],
    metadata: {
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      parentMessageId: null,
      branchId: null,
      selectedModel: "openai/gpt-5.2",
      activeStreamId: null,
      selectedTool: undefined,
      usage: undefined,
    },
  };
}

function chatConfirmedPart(
  chatId: string
): DataUIPart<CustomUIDataTypes> {
  return {
    type: "data-chatConfirmed",
    id: `confirmed-${chatId}`,
    data: { chatId },
  };
}

function appendMessagePart(
  message: ChatMessage
): DataUIPart<CustomUIDataTypes> {
  return {
    type: "data-appendMessage",
    id: `append-${message.id}`,
    data: JSON.stringify(message),
  };
}

describe("upsertMessagesFromAppendParts", () => {
  it("applies appendMessage parts even when chatConfirmed comes first", () => {
    const appended = createMessage("m1", "hello");
    const current = [createMessage("existing", "seed")];

    const next = upsertMessagesFromAppendParts(current, [
      chatConfirmedPart("chat-1"),
      appendMessagePart(appended),
    ]);

    expect(next).toHaveLength(2);
    expect(next.at(-1)?.id).toBe("m1");
    expect(next.at(-1)?.parts[0]).toEqual({ type: "text", text: "hello" });
  });

  it("replaces existing message when appendMessage has the same id", () => {
    const current = [createMessage("m1", "old text")];
    const replacement = createMessage("m1", "new text");

    const next = upsertMessagesFromAppendParts(current, [
      appendMessagePart(replacement),
    ]);

    expect(next).toHaveLength(1);
    expect(next[0]?.id).toBe("m1");
    expect(next[0]?.parts[0]).toEqual({ type: "text", text: "new text" });
  });

  it("returns the same array reference when no appendMessage parts exist", () => {
    const current = [createMessage("m1", "seed")];

    const next = upsertMessagesFromAppendParts(current, [
      chatConfirmedPart("chat-2"),
    ]);

    expect(next).toBe(current);
  });
});
