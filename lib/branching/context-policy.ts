import type { ChatMessage } from "@/lib/ai/types";

function buildSyntheticExcerptMessage(options: {
  excerpt: string;
  parentMessageId: string | null;
  branchId: string;
}): ChatMessage {
  const content = `For reference, this question refers to branch context: "${options.excerpt}"`;
  return {
    id: `branch-excerpt-${options.branchId}`,
    role: "user",
    parts: [{ type: "text", text: content }],
    metadata: {
      createdAt: new Date(),
      parentMessageId: options.parentMessageId,
      branchId: options.branchId,
      selectedModel: "" as ChatMessage["metadata"]["selectedModel"],
      activeStreamId: null,
    },
  };
}

export function applyExcerptContextToPreviousMessages(options: {
  previousMessages: ChatMessage[];
  branchId: string;
  excerpt: string;
}): ChatMessage[] {
  const trimmedExcerpt = options.excerpt.trim();
  if (!trimmedExcerpt) {
    return options.previousMessages;
  }

  const branchOnlyMessages = options.previousMessages.filter(
    (message) => message.metadata?.branchId === options.branchId
  );
  const synthetic = buildSyntheticExcerptMessage({
    excerpt: trimmedExcerpt,
    parentMessageId: branchOnlyMessages.at(-1)?.id ?? null,
    branchId: options.branchId,
  });

  return [...branchOnlyMessages, synthetic];
}
