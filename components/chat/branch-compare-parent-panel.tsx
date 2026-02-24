"use client";

import { ArrowUpRightFromSquare } from "lucide-react";
import type { ChatMessage } from "@/lib/ai/types";
import { getTextContentFromMessage } from "@/lib/branching/message-text";
import type { ChatBranch } from "@/lib/db/schema";
import { cn } from "@/lib/utils";
import { Response } from "../ai-elements/response";
import { ScrollArea } from "../ui/scroll-area";

type BranchCompareParentPanelProps = {
  activeBranch: ChatBranch;
  parentBranch: ChatBranch;
  parentMessages: ChatMessage[];
  className?: string;
};

function CompareMessage({ message }: { message: ChatMessage }) {
  const textContent = getTextContentFromMessage(message);

  return (
    <div className={cn("flex w-full", message.role === "user" && "justify-end")}>
      <div
        className={cn(
          "max-w-[92%] rounded-lg border px-3 py-2 text-sm",
          message.role === "user" ? "bg-muted" : "bg-background"
        )}
      >
        {textContent ? (
          <Response mode="static">{textContent}</Response>
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

      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-3 py-3">
          {parentMessages.length > 0 ? (
            parentMessages.map((message) => (
              <CompareMessage key={message.id} message={message} />
            ))
          ) : (
            <p className="text-muted-foreground text-sm">No parent messages yet.</p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
