"use client";

import { useChatStoreApi } from "@ai-sdk-tools/store";
import { GitBranchPlus, X } from "lucide-react";
import {
  type MouseEvent,
  type PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { useCreateChatBranch } from "@/hooks/chat-sync-hooks";
import type { ChatMessage } from "@/lib/ai/types";
import { computeSelectionOffsets } from "@/lib/branching/selection-offsets";
import { cn } from "@/lib/utils";
import { useBranchState } from "@/providers/branch-state-provider";
import { useSession } from "@/providers/session-provider";
import { Button } from "./ui/button";

type SelectionState = {
  span: { start: number; end: number } | null;
  text: string;
  rect: DOMRect;
  anchorX: number;
};

const BRANCH_POPOVER_HEIGHT = 40;
const BRANCH_POPOVER_OFFSET = 8;
const POPUP_ANCHOR_MAX_WIDTH = 240;

function getElementFromNode(node: Node): Element | null {
  if (node.nodeType === Node.ELEMENT_NODE) {
    return node as Element;
  }

  return node.parentElement;
}

function cloneRect(rect: DOMRect | DOMRectReadOnly): DOMRect {
  return new DOMRect(rect.x, rect.y, rect.width, rect.height);
}

function getRectCenter(rect: DOMRect | DOMRectReadOnly): { x: number; y: number } {
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

function getSelectionAnchorRect(
  selection: Selection,
  range: Range,
  pointerPoint?: { x: number; y: number }
): DOMRect | null {
  const rects = Array.from(range.getClientRects()).filter(
    (rect) => rect.width > 0 || rect.height > 0
  );

  if (rects.length > 0) {
    const point = pointerPoint;
    const pickClosestRect = (target: { x: number; y: number }) =>
      rects.reduce((closest, rect) => {
        const closestCenter = getRectCenter(closest);
        const rectCenter = getRectCenter(rect);
        const closestDistance =
          Math.abs(closestCenter.x - target.x) +
          Math.abs(closestCenter.y - target.y);
        const rectDistance =
          Math.abs(rectCenter.x - target.x) + Math.abs(rectCenter.y - target.y);

        return rectDistance < closestDistance ? rect : closest;
      });

    let selectedRect: DOMRect | DOMRectReadOnly = rects[0];

    // Prefer a rect closest to the focus/caret point so the bubble appears where
    // the user ended the selection rather than the center of a large multi-line box.
    if (point) {
      selectedRect = pickClosestRect(point);
    } else {
      const focusNode = selection.focusNode;
      if (focusNode) {
        try {
          const focusRange = document.createRange();
          focusRange.setStart(focusNode, selection.focusOffset);
          focusRange.collapse(true);
          const focusRect =
            focusRange.getClientRects().item(0) ??
            focusRange.getBoundingClientRect();

          if (focusRect && (focusRect.width > 0 || focusRect.height > 0)) {
            selectedRect = pickClosestRect(getRectCenter(focusRect));
          }
        } catch {
          // Keep first rect fallback when focus range can't be resolved.
        }
      }
    }

    return cloneRect(
      new DOMRect(
        selectedRect.left,
        selectedRect.top,
        Math.min(selectedRect.width, POPUP_ANCHOR_MAX_WIDTH),
        selectedRect.height
      )
    );
  }

  const boundingRect = range.getBoundingClientRect();
  if (boundingRect.width > 0 || boundingRect.height > 0) {
    return cloneRect(boundingRect);
  }

  return null;
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
  const selectionRafRef = useRef<number | null>(null);
  const pointerAnchorRef = useRef<{ x: number; y: number } | null>(null);

  const clearSelection = useCallback(() => {
    setSelection(null);
    pointerAnchorRef.current = null;
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

    const text = selected.toString().trim();
    if (!text) {
      setSelection(null);
      return;
    }

    const computedSpan = computeSelectionOffsets(root, range, {
      includeTextNode: (node) =>
        Boolean(node.parentElement?.closest('[data-branchable-text="true"]')),
    });
    const span =
      computedSpan && computedSpan.start < computedSpan.end
        ? computedSpan
        : null;

    const rect = getSelectionAnchorRect(
      selected,
      range,
      pointerAnchorRef.current ?? undefined
    );
    if (!rect) {
      setSelection(null);
      return;
    }

    const anchorX =
      pointerAnchorRef.current !== null
        ? Math.min(
            Math.max(pointerAnchorRef.current.x, rect.left),
            rect.right || rect.left
          )
        : rect.left + rect.width / 2;

    setSelection({
      span,
      text,
      rect,
      anchorX,
    });
    pointerAnchorRef.current = null;
  }, [isReadonly]);

  const scheduleSelectionCheck = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (selectionRafRef.current !== null) {
      window.cancelAnimationFrame(selectionRafRef.current);
    }

    selectionRafRef.current = window.requestAnimationFrame(() => {
      selectionRafRef.current = null;
      handleSelection();
    });
  }, [handleSelection]);

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
        span: selection.span ?? null,
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

  const handlePersistedBranchHighlightClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      const target =
        event.target instanceof Element ? event.target : null;
      if (!target) {
        return;
      }

      const highlight = target.closest<HTMLElement>("mark[data-branch-id]");
      if (!highlight || !containerRef.current?.contains(highlight)) {
        return;
      }

      const selectedText = window.getSelection()?.toString().trim() ?? "";
      if (selectedText.length > 0) {
        return;
      }

      const branchId = highlight.dataset.branchId?.trim();
      if (!branchId) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (branchId !== activeBranchId) {
        setActiveBranchId(branchId, { history: "push" });
      }

      setCompareMode(true, { history: "replace" });
      setCompareSheetOpen(true);
      setSelection(null);
    },
    [
      activeBranchId,
      setActiveBranchId,
      setCompareMode,
      setCompareSheetOpen,
    ]
  );

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        clearSelection();
      }
    };

    const clearOnViewportResize = () => {
      setSelection(null);
    };

    const handleSelectionChange = () => {
      scheduleSelectionCheck();
    };
    const handlePointerUp = (event: PointerEvent) => {
      pointerAnchorRef.current = {
        x: event.clientX,
        y: event.clientY,
      };
      scheduleSelectionCheck();
    };
    const handleViewportScroll = () => {
      // Keep behavior deterministic while the viewport moves.
      setSelection(null);
    };

    window.addEventListener("keydown", handleEscape);
    window.addEventListener("resize", clearOnViewportResize);
    window.addEventListener("scroll", handleViewportScroll, true);
    document.addEventListener("pointerup", handlePointerUp);
    document.addEventListener("selectionchange", handleSelectionChange);

    return () => {
      window.removeEventListener("keydown", handleEscape);
      window.removeEventListener("resize", clearOnViewportResize);
      window.removeEventListener("scroll", handleViewportScroll, true);
      document.removeEventListener("pointerup", handlePointerUp);
      document.removeEventListener("selectionchange", handleSelectionChange);
      if (selectionRafRef.current !== null) {
        window.cancelAnimationFrame(selectionRafRef.current);
        selectionRafRef.current = null;
      }
    };
  }, [clearSelection, scheduleSelectionCheck]);

  const popoverStyle = useMemo(() => {
    if (!selection || typeof window === "undefined") {
      return undefined;
    }

    const left = Math.max(8, Math.min(selection.anchorX, window.innerWidth - 8));

    const canRenderBelow =
      selection.rect.bottom + BRANCH_POPOVER_HEIGHT + BRANCH_POPOVER_OFFSET <=
      window.innerHeight;
    const top = canRenderBelow
      ? selection.rect.bottom + BRANCH_POPOVER_OFFSET
      : Math.max(
          8,
          selection.rect.top - BRANCH_POPOVER_HEIGHT - BRANCH_POPOVER_OFFSET
        );

    return {
      top,
      left,
    };
  }, [selection]);

  return (
    <div
      className={cn("relative", className)}
      onClickCapture={handlePersistedBranchHighlightClick}
      ref={containerRef}
    >
      {children}

      {selection && popoverStyle && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed z-50 -translate-x-1/2"
              style={{
                left: popoverStyle.left,
                top: popoverStyle.top,
                maxWidth: "calc(100vw - 16px)",
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
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
