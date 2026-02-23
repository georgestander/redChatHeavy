"use client";

import { useChat } from "@ai-sdk-tools/store";
import { DefaultChatTransport } from "ai";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useDataStream } from "@/components/data-stream-provider";
import { useSaveMessageMutation } from "@/hooks/chat-sync-hooks";
import { useCompleteDataPart } from "@/hooks/use-complete-data-part";
import { ChatSDKError } from "@/lib/ai/errors";
import type { ChatMessage } from "@/lib/ai/types";
import { useThreadInitialMessages } from "@/lib/stores/hooks-threads";
import { fetchWithErrorHandlers, generateUUID } from "@/lib/utils";
import { useSession } from "@/providers/session-provider";

export function ChatSync({
  id,
  projectId,
}: {
  id: string;
  projectId?: string;
}) {
  const { data: session } = useSession();
  const { mutate: saveChatMessage } = useSaveMessageMutation();
  const { setDataStream } = useDataStream();
  const [_, setAutoResume] = useState(true);

  const isAuthenticated = !!session?.user;
  const threadInitialMessages = useThreadInitialMessages();

  const lastMessage = threadInitialMessages.at(-1);
  const isLastMessagePartial = !!lastMessage?.metadata?.activeStreamId;

  // Backstop: if we remount ChatSync (e.g. threadEpoch changes), ensure the prior
  // stream buffer is cleared so we don't replay old deltas.
  // Do not force-stop the active request here: navigating from "/" to "/chat/:id"
  // remounts ChatSync on first send, and aborting at unmount can cancel the
  // initial /api/chat request before persistence completes.
  useEffect(
    () => () => {
      setDataStream([]);
    },
    [setDataStream]
  );

  useChat<ChatMessage>({
    experimental_throttle: 100,
    id,
    // TODO: this is a special "snapshot" value in the store that is only updated
    // on store init + sibling switch. Once the store can guarantee up-to-date
    // messages at ChatSync remount time, we can likely remove this override.
    messages: threadInitialMessages,
    generateId: generateUUID,
    onFinish: ({ message }) => {
      saveChatMessage({ message, chatId: id });
      setAutoResume(true);
    },
    resume: isLastMessagePartial,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      fetch: fetchWithErrorHandlers,
      prepareSendMessagesRequest({ messages, id: requestId, body }) {
        setAutoResume(true);

        return {
          body: {
            id: requestId,
            message: messages.at(-1),
            prevMessages: isAuthenticated ? [] : messages.slice(0, -1),
            projectId,
            ...body,
          },
        };
      },
      prepareReconnectToStreamRequest({ id: chatId }) {
        const partialMessageId = lastMessage?.metadata?.activeStreamId
          ? lastMessage.id
          : null;
        return {
          api: `/api/chat/${chatId}/stream${partialMessageId ? `?messageId=${partialMessageId}` : ""}`,
        };
      },
    }),
    onData: (dataPart) => {
      setDataStream((ds) =>
        ds ? [...ds, dataPart as (typeof ds)[number]] : []
      );
    },
    onError: (error) => {
      if (
        error instanceof ChatSDKError &&
        error.type === "not_found" &&
        error.surface === "stream"
      ) {
        setAutoResume(false);
      }

      console.error(error);
      const cause = error.cause;
      if (cause && typeof cause === "string") {
        toast.error(error.message ?? "An error occured, please try again!", {
          description: cause,
        });
      } else {
        toast.error(error.message ?? "An error occured, please try again!");
      }
    },
  });

  useCompleteDataPart();

  return null;
}
