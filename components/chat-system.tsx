"use client";

import { memo } from "react";
import { Chat } from "@/components/chat";
import { ChatSync } from "@/components/chat-sync";
import { DataStreamHandler } from "@/components/data-stream-handler";
import { DataStreamProvider } from "@/components/data-stream-provider";
import { ArtifactProvider } from "@/hooks/use-artifact";
import type { AppModelId } from "@/lib/ai/app-models";
import type { ChatMessage, UiToolName } from "@/lib/ai/types";
import { CustomStoreProvider } from "@/lib/stores/custom-store-provider";
import { ChatInputProvider } from "@/providers/chat-input-provider";
import {
  MessageTreeProvider,
  useMessageTree,
} from "@/providers/message-tree-provider";

function ChatThreadSync({
  id,
  projectId,
  withHandler,
}: {
  id: string;
  projectId?: string;
  withHandler: boolean;
}) {
  const { threadEpoch } = useMessageTree();
  return (
    <>
      <ChatSync
        id={id}
        key={`chat-sync:${id}:${threadEpoch}`}
        projectId={projectId}
      />
      {withHandler ? (
        <DataStreamHandler id={id} key={`stream:${id}:${threadEpoch}`} />
      ) : null}
    </>
  );
}

export const ChatSystem = memo(function PureChatSystem({
  id,
  initialMessages,
  isReadonly,
  initialTool = null,
  overrideModelId,
  projectId,
}: {
  id: string;
  initialMessages: ChatMessage[];
  isReadonly: boolean;
  initialTool?: UiToolName | null;
  overrideModelId?: AppModelId;
  projectId?: string;
}) {
  return (
    <ArtifactProvider key={id}>
      <DataStreamProvider key={id}>
        <CustomStoreProvider<ChatMessage>
          initialMessages={initialMessages}
          key={id}
        >
          <MessageTreeProvider>
            {isReadonly ? (
              <>
                <ChatThreadSync
                  id={id}
                  projectId={projectId}
                  withHandler={false}
                />
                <Chat
                  id={id}
                  initialMessages={initialMessages}
                  isReadonly={isReadonly}
                  key={id}
                  projectId={projectId}
                />
              </>
            ) : (
              <ChatInputProvider
                initialTool={initialTool ?? null}
                isProjectContext={!!projectId}
                localStorageEnabled={true}
                overrideModelId={overrideModelId}
              >
                <ChatThreadSync
                  id={id}
                  projectId={projectId}
                  withHandler={true}
                />
                <Chat
                  id={id}
                  initialMessages={initialMessages}
                  isReadonly={isReadonly}
                  key={id}
                  projectId={projectId}
                />
              </ChatInputProvider>
            )}
          </MessageTreeProvider>
        </CustomStoreProvider>
      </DataStreamProvider>
    </ArtifactProvider>
  );
});
