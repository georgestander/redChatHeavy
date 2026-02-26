"use client";

import { ArrowUpRightFromSquare } from "lucide-react";
import { type MouseEvent, useCallback, useMemo } from "react";
import type { ChatMessage } from "@/lib/ai/types";
import { buildChildBranchHighlightsByMessage } from "@/lib/branching/branch-origin-highlights";
import { getTextContentFromMessage } from "@/lib/branching/message-text";
import type {
  BranchTextHighlight,
} from "@/lib/branching/text-highlights";
import type { ChatBranch } from "@/lib/db/schema";
import { cn } from "@/lib/utils";
import { useBranchState } from "@/providers/branch-state-provider";
import { Response } from "../ai-elements/response";
import { ScrollArea } from "../ui/scroll-area";

type BranchCompareParentPanelProps = {
  activeBranch: ChatBranch;
  parentBranch: ChatBranch;
  parentMessages: ChatMessage[];
  className?: string;
};

const EMPTY_TEXT_HIGHLIGHTS: BranchTextHighlight[] = [];

function CompareMessage({
  message,
  textHighlights,
}: {
  message: ChatMessage;
  textHighlights: BranchTextHighlight[];
}) {
  const textContent = getTextContentFromMessage(message, { trim: false });
  const hasTextContent = textContent.trim().length > 0;

  return (
    <div className={cn("flex w-full", message.role === "user" && "justify-end")}>
      <div
        className={cn(
          "max-w-[92%] rounded-lg border px-3 py-2 text-sm",
          message.role === "user" ? "bg-muted" : "bg-background"
        )}
      >
        {hasTextContent ? (
          <Response mode="static" textHighlights={textHighlights}>
            {textContent}
          </Response>
        ) : (
          <p className="text-muted-foreground text-xs">No text content</p>
        )}
      </div>
    </div>
  );
}

export function BranchCompareParentPanel({
  activeBranch,
  parentBranch,
  parentMessages,
  className,
}: BranchCompareParentPanelProps) {
  const excerpt = activeBranch.createdFromExcerpt?.trim() ?? "";
  const {
    branches,
    setActiveBranchId,
    setCompareMode,
    setCompareSheetOpen,
  } = useBranchState();

  const textHighlightsByMessageId = useMemo(
    () =>
      buildChildBranchHighlightsByMessage({
        branches,
        parentBranchId: parentBranch.id,
        activeBranchId: activeBranch.id,
      }),
    [activeBranch.id, branches, parentBranch.id]
  );

  const handleBranchHighlightClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      const target =
        event.target instanceof Element ? event.target : null;
      if (!target) {
        return;
      }

      const highlight = target.closest<HTMLElement>("mark[data-branch-id]");
      if (!highlight) {
        return;
      }

      const branchId = highlight.dataset.branchId?.trim();
      if (!branchId) {
        return;
      }

      event.preventDefault();

      if (branchId !== activeBranch.id) {
        setActiveBranchId(branchId, { history: "push" });
      }

      setCompareMode(true, { history: "replace" });
      setCompareSheetOpen(true);
    },
    [activeBranch.id, setActiveBranchId, setCompareMode, setCompareSheetOpen]
  );

  return (
    <div className={cn("flex h-full min-h-0 flex-col border-r bg-muted/20", className)}>
      <div className="border-b px-3 py-2">
        <div className="flex items-center gap-2 font-medium text-sm">
          <ArrowUpRightFromSquare className="h-3.5 w-3.5" />
          Parent Context
        </div>
        <p className="mt-1 text-muted-foreground text-xs">
          {`Comparing "${activeBranch.title}" with parent "${parentBranch.title}".`}
        </p>
        {excerpt ? (
          <blockquote className="mt-2 border-l-2 pl-2 text-muted-foreground text-xs">
            {excerpt}
          </blockquote>
        ) : null}
      </div>

      <ScrollArea className="min-h-0 flex-1" onClick={handleBranchHighlightClick}>
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-3 py-3">
          {parentMessages.length > 0 ?
            parentMessages.map((message) => (
              <CompareMessage
                key={message.id}
                message={message}
                textHighlights={
                  textHighlightsByMessageId.get(message.id) ?? EMPTY_TEXT_HIGHLIGHTS
                }
              />
            ))
          : <p className="text-muted-foreground text-sm">No parent messages yet.</p>}
        </div>
      </ScrollArea>
    </div>
  );
}
