"use client";

import { useMessageById } from "@ai-sdk-tools/store";
import { memo, useMemo } from "react";
import type { ChatMessage } from "@/lib/ai/types";
import {
  getChildBranchHighlightsForMessage,
  projectBranchHighlightsToTextRange,
} from "@/lib/branching/branch-origin-highlights";
import { useBranchState } from "@/providers/branch-state-provider";
import { Response } from "../ai-elements/response";

function getTextPartRange(
  parts: ChatMessage["parts"],
  partIdx: number
): { start: number; end: number } | null {
  let offset = 0;

  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];

    if (part.type !== "text") {
      continue;
    }

    const nextOffset = offset + part.text.length;
    if (index === partIdx) {
      return { start: offset, end: nextOffset };
    }

    offset = nextOffset;
  }

  return null;
}

export const TextMessagePart = memo(
  ({
    text,
    isLoading,
    messageId,
    partIdx,
  }: {
    text: string;
    isLoading: boolean;
    messageId: string;
    partIdx: number;
  }) => {
    const message = useMessageById<ChatMessage>(messageId);
    const { branches, activeBranchId } = useBranchState();

    const textHighlights = useMemo(() => {
      if (!message || !activeBranchId) {
        return [];
      }

      const partRange = getTextPartRange(message.parts, partIdx);
      if (!partRange) {
        return [];
      }

      const messageHighlights = getChildBranchHighlightsForMessage({
        branches,
        parentBranchId: activeBranchId,
        messageId,
      });

      return projectBranchHighlightsToTextRange(messageHighlights, partRange);
    }, [activeBranchId, branches, message, messageId, partIdx]);

    return (
      <div data-branchable-text="true">
        <Response
          isAnimating={isLoading}
          mode={isLoading ? "streaming" : "static"}
          textHighlights={textHighlights}
        >
          {text}
        </Response>
      </div>
    );
  }
);
