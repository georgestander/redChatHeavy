"use client";

import { useChatStoreApi } from "@ai-sdk-tools/store";
import { GitBranchPlus, X } from "lucide-react";
import {
  type PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { useCreateChatBranch } from "@/hooks/chat-sync-hooks";
import { computeSelectionOffsets } from "@/lib/branching/selection-offsets";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/lib/ai/types";
import { useBranchState } from "@/providers/branch-state-provider";
import { useSession } from "@/providers/session-provider";
import { Button } from "./ui/button";

type SelectionState = {
  start: number;
  end: number;
  text: string;
  rect: DOMRect;
};

function getElementFromNode(node: Node): Element | null {
  if (node.nodeType === Node.ELEMENT_NODE) {
    return node as Element;
  }

  return node.parentElement;
}

export function AssistantBranchSelection({
  messageId,
  isReadonly,
  className,
  children,
}: PropsWithChildren<{
  messageId: string;
  isReadonly: boolean;
  className?: string;
}>) {
  const storeApi = useChatStoreApi<ChatMessage>();
  const { mutateAsync: createBranch, isPending: isCreatingBranch } =
    useCreateChatBranch();
  const {
    activeBranchId,
    setActiveBranchId,
    setCompareMode,
    setCompareSheetOpen,
  } = useBranchState();
  const { data: session } = useSession();
  const isAuthenticated = Boolean(session?.user);
  const shouldUsePersistedBranching = isAuthenticated;

  const [selection, setSelection] = useState<SelectionState | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const clearSelection = useCallback(() => {
    setSelection(null);
    const selected = window.getSelection();
    if (selected?.rangeCount) {
      selected.removeAllRanges();
    }
  }, []);

  const handleSelection = useCallback(() => {
    if (isReadonly) {
      setSelection(null);
      return;
    }

    const root = containerRef.current;
    if (!root) {
      setSelection(null);
      return;
    }

    const selected = window.getSelection();
    if (!selected || selected.isCollapsed || selected.rangeCount === 0) {
      setSelection(null);
      return;
    }

    const range = selected.getRangeAt(0);
    if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) {
      setSelection(null);
      return;
    }

    const startElement = getElementFromNode(range.startContainer);
    const endElement = getElementFromNode(range.endContainer);

    if (
      !startElement?.closest('[data-branchable-text="true"]') ||
      !endElement?.closest('[data-branchable-text="true"]')
    ) {
      setSelection(null);
      return;
    }

    const span = computeSelectionOffsets(root, range, {
      includeTextNode: (node) =>
        Boolean(node.parentElement?.closest('[data-branchable-text="true"]')),
    });

    const text = selected.toString().trim();
    if (!span || !text || span.start >= span.end) {
      setSelection(null);
      return;
    }

    const rect = range.getBoundingClientRect();
    setSelection({
      ...span,
      text,
      rect,
    });
  }, [isReadonly]);

  const createSelectionBranch = useCallback(async () => {
    if (!selection) {
      return;
    }

    const message = storeApi
      .getState()
      .messages.find((candidate) => candidate.id === messageId) as
      | ChatMessage
      | undefined;

    if (!message) {
      toast.error("Could not branch this message");
      return;
    }

    const branchExcerpt = selection.text.slice(0, 2000);

    if (!shouldUsePersistedBranching) {
      const currentMessages = storeApi.getState().getThrottledMessages() as ChatMessage[];
      const messageIndex = currentMessages.findIndex(
        (candidate) => candidate.id === messageId
      );

      if (messageIndex === -1) {
        toast.error("Could not branch this message");
        return;
      }

      const localBranchMessages = currentMessages.slice(0, messageIndex + 1);
      storeApi.getState().setMessages(localBranchMessages);
      clearSelection();
      toast.success("Started local branch from selection");
      return;
    }

    try {
      const createdBranch = await createBranch({
        messageId,
        parentBranchId: activeBranchId ?? null,
        excerpt: branchExcerpt,
        span: {
          start: selection.start,
          end: selection.end,
        },
      });

      if (createdBranch?.id) {
        setActiveBranchId(createdBranch.id, { history: "push" });
      }

      setCompareMode(true, { history: "replace" });
      setCompareSheetOpen(true);
      clearSelection();
      toast.success("Branch created");
    } catch {
      toast.error("Failed to create branch");
    }
  }, [
    activeBranchId,
    clearSelection,
    createBranch,
    messageId,
    selection,
    setActiveBranchId,
    setCompareMode,
    setCompareSheetOpen,
    shouldUsePersistedBranching,
    storeApi,
  ]);

  useEffect(() => {
    setSelection(null);
  }, [messageId]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        clearSelection();
      }
    };

    const clearOnViewportChange = () => {
      setSelection(null);
    };

    window.addEventListener("keydown", handleEscape);
    window.addEventListener("resize", clearOnViewportChange);
    window.addEventListener("scroll", clearOnViewportChange, true);

    return () => {
      window.removeEventListener("keydown", handleEscape);
      window.removeEventListener("resize", clearOnViewportChange);
      window.removeEventListener("scroll", clearOnViewportChange, true);
    };
  }, [clearSelection]);

  const popoverStyle = useMemo(() => {
    if (!selection) {
      return undefined;
    }

    const top = Math.max(8, selection.rect.bottom + 8);
    const left = Math.max(8, Math.min(selection.rect.left, window.innerWidth - 280));

    return {
      top,
      left,
    };
  }, [selection]);

  return (
    <div
      className={cn("relative", className)}
      onKeyUp={handleSelection}
      onMouseUp={handleSelection}
      ref={containerRef}
    >
      {children}

      {selection && popoverStyle ? (
        <div
          className="fixed z-50"
          style={{
            left: popoverStyle.left,
            top: popoverStyle.top,
          }}
        >
          <div className="flex items-center gap-1 rounded-md border bg-popover px-2 py-1.5 shadow-md">
            <Button
              className="h-7 gap-1.5 px-2 text-xs"
              disabled={isCreatingBranch}
              onClick={() => {
                void createSelectionBranch();
              }}
              size="sm"
              variant="default"
            >
              <GitBranchPlus className="h-3.5 w-3.5" />
              {isCreatingBranch ? "Branching..." : "Branch"}
            </Button>
            <Button
              className="h-7 w-7 p-0"
              onClick={clearSelection}
              size="icon"
              variant="ghost"
            >
              <X className="h-3.5 w-3.5" />
              <span className="sr-only">Close</span>
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
