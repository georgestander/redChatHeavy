import { env as workersEnv } from "cloudflare:workers";
import {
  createUIMessageStream,
  JsonToSseTransformStream,
  UI_MESSAGE_STREAM_HEADERS,
} from "ai";
import { ChatSDKError } from "@/lib/ai/errors";
import type { ChatMessage } from "@/lib/ai/types";
import { auth } from "@/lib/auth";
import { getChatById, getChatMessageWithPartsById } from "@/lib/db/queries";
import {
  resumeStreamBuffer,
  type StreamBufferBindings,
} from "@/lib/stream-buffer/stream-buffer-client";

function appendMessageResponse(message: ChatMessage) {
  const stream = createUIMessageStream<ChatMessage>({
    execute: ({ writer }) => {
      writer.write({
        id: crypto.randomUUID(),
        type: "data-appendMessage",
        data: JSON.stringify(message),
        transient: true,
      });
    },
    generateId: () => message.id,
  });

  return new Response(
    stream
      .pipeThrough(new JsonToSseTransformStream())
      .pipeThrough(new TextEncoderStream()),
    { headers: UI_MESSAGE_STREAM_HEADERS }
  );
}

function getStreamBufferBindings(): StreamBufferBindings | null {
  const bindings = workersEnv as unknown as Partial<StreamBufferBindings>;
  if (!bindings.STREAM_BUFFER_DO) {
    return null;
  }

  return bindings as StreamBufferBindings;
}

async function getFinalizedFallbackResponse({
  chatId,
  messageId,
}: {
  chatId: string;
  messageId: string;
}): Promise<Response> {
  const refreshed = await getChatMessageWithPartsById({ id: messageId });
  if (
    refreshed &&
    refreshed.chatId === chatId &&
    refreshed.message.role === "assistant" &&
    !refreshed.message.metadata.activeStreamId
  ) {
    return appendMessageResponse(refreshed.message);
  }

  return new Response(null, { status: 204 });
}

export async function handleChatStreamRequest({
  request,
  chatId,
}: {
  request: Request;
  chatId: string;
}) {
  const requestUrl = new URL(request.url);
  const messageId = requestUrl.searchParams.get("messageId");

  if (!messageId) {
    return new ChatSDKError("bad_request:api").toResponse();
  }

  // Get message and validate it exists with an active stream
  const messageWithParts = await getChatMessageWithPartsById({ id: messageId });
  if (!messageWithParts || messageWithParts.chatId !== chatId) {
    return new ChatSDKError("not_found:stream").toResponse();
  }

  // Validate chat ownership
  const session = await auth.api.getSession({ headers: request.headers });
  const userId = session?.user?.id || null;

  const chat = await getChatById({ id: chatId });
  if (!chat) {
    return new ChatSDKError("not_found:chat").toResponse();
  }

  if (chat.visibility !== "public" && chat.userId !== userId) {
    return new ChatSDKError("forbidden:chat").toResponse();
  }

  const { message } = messageWithParts;

  // Stream finished (or we lost the resumable stream) — send the finalized
  // assistant message as a one-shot "appendMessage" data chunk.
  if (!message.metadata.activeStreamId) {
    if (message.role !== "assistant") {
      return new Response(null, { status: 204 });
    }

    return appendMessageResponse(message);
  }

  const streamBufferEnv = getStreamBufferBindings();
  if (!streamBufferEnv) {
    return new Response(null, { status: 204 });
  }

  const resumedStreamResponse = await resumeStreamBuffer({
    env: streamBufferEnv,
    streamId: message.metadata.activeStreamId,
    lastEventId: request.headers.get("Last-Event-ID"),
  }).catch(() => null);

  if (resumedStreamResponse?.ok && resumedStreamResponse.body) {
    return new Response(resumedStreamResponse.body, {
      headers: UI_MESSAGE_STREAM_HEADERS,
    });
  }

  if (resumedStreamResponse?.ok) {
    return new Response(null, { status: 204 });
  }

  // Stream missing but message might already be finalized (race vs DB update).
  return await getFinalizedFallbackResponse({ chatId, messageId });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return await handleChatStreamRequest({ request, chatId: id });
}
