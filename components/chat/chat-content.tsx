"use client";

import { useChatStatus } from "@ai-sdk-tools/store";
import { useQuery } from "@tanstack/react-query";
import { memo, useEffect, useMemo, useRef } from "react";
import { BranchCompareParentPanel } from "@/components/chat/branch-compare-parent-panel";
import { MessagesPane } from "@/components/messages-pane";
import { ProjectHome } from "@/components/project-home";
import { useIsMobile } from "@/hooks/use-mobile";
import type { ChatMessage } from "@/lib/ai/types";
import { getBranchThread } from "@/lib/branching/compare-thread";
import { chatKeys } from "@/lib/query-keys";
import { useMessageIds } from "@/lib/stores/hooks-base";
import { cn } from "@/lib/utils";
import { useBranchState } from "@/providers/branch-state-provider";
import { useChatId } from "@/providers/chat-id-provider";
import { getChatMessages, getPublicChatMessages } from "@/server/actions/chat";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "../ui/resizable";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "../ui/sheet";
import { ChatWelcome } from "./chat-welcome";

type SerializedChatMessage = Omit<ChatMessage, "metadata"> & {
  metadata: Omit<ChatMessage["metadata"], "createdAt"> & {
    createdAt: string | Date;
  };
};

function hydrateMessageDates(message: SerializedChatMessage): ChatMessage {
  return {
    ...message,
    metadata: {
      ...message.metadata,
      createdAt:
        message.metadata.createdAt instanceof Date
          ? message.metadata.createdAt
          : new Date(message.metadata.createdAt),
    },
  };
}

function ActiveChatContent({
  chatId,
  className,
  projectId,
  isReadonly,
  hasMessages,
  suppressWelcome,
}: {
  chatId: string;
  className?: string;
  projectId?: string;
  isReadonly: boolean;
  hasMessages: boolean;
  suppressWelcome: boolean;
}) {
  const status = useChatStatus();

  // Project context: switch between ProjectHome and MessagesPane
  if (projectId) {
    return hasMessages ? (
      <MessagesPane
        chatId={chatId}
        className={cn("bg-background", className)}
        isReadonly={isReadonly}
        suppressGreeting={suppressWelcome}
        status={status}
      />
    ) : (
      <ProjectHome
        chatId={chatId}
        className={cn("h-full", className)}
        projectId={projectId}
        status={status}
      />
    );
  }

  // Non-project: keep both mounted, toggle visibility with CSS
  const showWelcome = !hasMessages && !suppressWelcome;

  return (
    <>
      <ChatWelcome
        chatId={chatId}
        className={cn(className, !showWelcome && "hidden")}
        status={status}
      />
      <MessagesPane
        chatId={chatId}
        className={cn("bg-background", className, showWelcome && "hidden")}
        isReadonly={isReadonly}
        suppressGreeting={suppressWelcome}
        status={status}
      />
    </>
  );
}

function PureChatContent({
  chatId,
  className,
  projectId,
  isReadonly,
}: {
  chatId: string;
  className?: string;
  projectId?: string;
  isReadonly: boolean;
}) {
  const { source, isPersisted } = useChatId();
  const isShared = source === "share";
  const {
    activeBranch,
    branches,
    compareMode,
    compareSheetOpen,
    setCompareSheetOpen,
  } = useBranchState();
  const isMobile = useIsMobile();
  const messageIds = useMessageIds() as string[];
  const hasBranchSelectionContext =
    (activeBranch?.createdFromExcerpt?.trim().length ?? 0) > 0;
  const hasMessages = messageIds.length > 0 || hasBranchSelectionContext;
  const suppressWelcome = Boolean(
    activeBranch?.parentBranchId ||
      activeBranch?.createdFromMessageId ||
      hasBranchSelectionContext
  );

  const allMessagesQuery = useQuery({
    queryKey: isShared
      ? chatKeys.publicMessages(chatId)
      : chatKeys.messages(chatId),
    queryFn: async () => {
      const messages = isShared
        ? await getPublicChatMessages({ chatId })
        : await getChatMessages({ chatId });
      return (messages as SerializedChatMessage[]).map(hydrateMessageDates);
    },
    enabled: Boolean(chatId) && isPersisted,
  });
  const allMessages = allMessagesQuery.data ?? [];

  const parentBranch = useMemo(() => {
    if (!activeBranch?.parentBranchId) {
      return null;
    }

    return (
      branches.find((branch) => branch.id === activeBranch.parentBranchId) ?? null
    );
  }, [activeBranch?.parentBranchId, branches]);

  const parentMessages = useMemo(
    () => getBranchThread(allMessages, branches, parentBranch?.id),
    [allMessages, branches, parentBranch?.id]
  );

  const showComparePanel = compareMode && Boolean(parentBranch);
  const previousCompareModeRef = useRef(false);

  useEffect(() => {
    if (!showComparePanel) {
      setCompareSheetOpen(false);
      previousCompareModeRef.current = compareMode;
      return;
    }

    if (isMobile && compareMode && !previousCompareModeRef.current) {
      setCompareSheetOpen(true);
    }

    previousCompareModeRef.current = compareMode;
  }, [compareMode, isMobile, setCompareSheetOpen, showComparePanel]);

  const activeContent = (
    <ActiveChatContent
      chatId={chatId}
      className={className}
      hasMessages={hasMessages}
      isReadonly={isReadonly}
      projectId={projectId}
      suppressWelcome={suppressWelcome}
    />
  );

  if (!(showComparePanel && activeBranch && parentBranch)) {
    return activeContent;
  }

  if (isMobile) {
    return (
      <>
        {activeContent}
        <Sheet onOpenChange={setCompareSheetOpen} open={compareSheetOpen}>
          <SheetContent className="h-[85dvh] p-0" side="bottom">
            <SheetHeader className="sr-only">
              <SheetTitle>Parent Context</SheetTitle>
              <SheetDescription>
                View the parent branch while comparing responses.
              </SheetDescription>
            </SheetHeader>
            <BranchCompareParentPanel
              activeBranch={activeBranch}
              className="h-full border-r-0"
              parentBranch={parentBranch}
              parentMessages={parentMessages}
            />
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <ResizablePanelGroup
      className={cn("h-full min-h-0", className)}
      direction="horizontal"
    >
      <ResizablePanel defaultSize={36} minSize={24}>
        <BranchCompareParentPanel
          activeBranch={activeBranch}
          parentBranch={parentBranch}
          parentMessages={parentMessages}
        />
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={64} minSize={40}>
        <div className="h-full min-h-0">{activeContent}</div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

export const ChatContent = memo(PureChatContent);
