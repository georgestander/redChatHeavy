import type { ChatMessage } from "@/lib/ai/types";

function isTextPart(part: ChatMessage["parts"][number]): part is {
  type: "text";
  text: string;
} {
  return part.type === "text";
}

export function getTextPartsFromMessage(message: ChatMessage): string[] {
  return message.parts.filter(isTextPart).map((part) => part.text);
}

export function getTextContentFromMessage(
  message: ChatMessage,
  options?: { trim?: boolean }
): string {
  const text = getTextPartsFromMessage(message).join("\n");
  if (options?.trim === false) {
    return text;
  }

  return text.trim();
}
