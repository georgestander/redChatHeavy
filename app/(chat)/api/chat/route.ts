import { env as workersEnv } from "cloudflare:workers";
import {
  convertToModelMessages,
  createUIMessageStream,
  JsonToSseTransformStream,
} from "ai";
import throttle from "throttleit";
import {
  type AppModelDefinition,
  type AppModelId,
  getAppModelDefinition,
} from "@/lib/ai/app-models";
import { createCoreChatAgent } from "@/lib/ai/core-chat-agent";
import { determineExplicitlyRequestedTools } from "@/lib/ai/determine-explicitly-requested-tools";
import { ChatSDKError } from "@/lib/ai/errors";
import {
  generateFollowupSuggestions,
  streamFollowupSuggestions,
} from "@/lib/ai/followup-suggestions";
import { systemPrompt } from "@/lib/ai/prompts";
import { calculateMessagesTokens } from "@/lib/ai/token-utils";
import { allTools } from "@/lib/ai/tools/tools-definitions";
import type { ChatMessage, ToolName } from "@/lib/ai/types";
import {
  getAnonymousSessionFromRequest,
  serializeAnonymousSessionCookie,
} from "@/lib/anonymous-session";
import { auth } from "@/lib/auth";
import { config } from "@/lib/config";
import { createAnonymousSession } from "@/lib/create-anonymous-session";
import { CostAccumulator } from "@/lib/credits/cost-accumulator";
import { canSpend, deductCredits } from "@/lib/db/credits";
import { getMcpConnectorsByUserId } from "@/lib/db/mcp-queries";
import {
  getChatById,
  getMessageById,
  getMessageCanceledAt,
  getProjectById,
  getUserById,
  saveChat,
  saveMessage,
  updateMessage,
  updateMessageActiveStreamId,
} from "@/lib/db/queries";
import type { McpConnector } from "@/lib/db/schema";
import { MAX_INPUT_TOKENS } from "@/lib/limits/tokens";
import { createModuleLogger } from "@/lib/logger";
import {
  appendStreamBufferEvents,
  finalizeStreamBuffer,
  type StreamBufferAppendEvent,
  type StreamBufferBindings,
} from "@/lib/stream-buffer/stream-buffer-client";
import type { AnonymousSession } from "@/lib/types/anonymous";
import { ANONYMOUS_LIMITS } from "@/lib/types/anonymous";
import { generateUUID } from "@/lib/utils";
import {
  checkAnonymousRateLimit,
  getClientIP,
  type RateLimitKV,
} from "@/lib/utils/rate-limit";
import { generateTitleFromUserMessage } from "../../actions";
import { getThreadUpToMessageId } from "./get-thread-up-to-message-id";

type SseChunk = string | Uint8Array;
const SSE_BLOCK_SEPARATOR = "\n\n";
const STREAM_BUFFER_BATCH_SIZE = 24;
const STREAM_BUFFER_FLUSH_DELAY_MS = 120;

function runInBackground(task: () => Promise<unknown>): void {
  void task().catch((error) => {
    console.error("Background task failed:", error);
  });
}

function getStreamBufferBindings(): StreamBufferBindings | null {
  const bindings = workersEnv as unknown as Partial<StreamBufferBindings>;
  if (!bindings.STREAM_BUFFER_DO) {
    return null;
  }

  return bindings as StreamBufferBindings;
}

function getRateLimitKV(): RateLimitKV | null {
  const bindings = workersEnv as unknown as { KV_RATE_LIMIT?: RateLimitKV };
  return bindings.KV_RATE_LIMIT ?? null;
}

function extractSseBlockId(block: string): string | null {
  const lines = block.split("\n");
  for (const line of lines) {
    if (!line.startsWith("id:")) {
      continue;
    }

    const value = line.slice(3).trim();
    return value.length > 0 ? value : null;
  }

  return null;
}

function decodeSseChunk(value: SseChunk, decoder: TextDecoder): string {
  if (typeof value === "string") {
    return value;
  }

  return decoder.decode(value, { stream: true });
}

function takeCompleteSseBlocks(input: string): {
  blocks: string[];
  remainder: string;
} {
  const parts = input.split(SSE_BLOCK_SEPARATOR);
  if (parts.length === 1) {
    return { blocks: [], remainder: input };
  }

  const remainder = parts.pop() ?? "";
  const blocks = parts.map((part) => `${part}${SSE_BLOCK_SEPARATOR}`);
  return { blocks, remainder };
}

function toStreamBufferEvents(blocks: string[]): StreamBufferAppendEvent[] {
  const events: StreamBufferAppendEvent[] = [];

  for (const block of blocks) {
    const blockId = extractSseBlockId(block);
    if (blockId) {
      events.push({ id: blockId, block });
    }
  }

  return events;
}

async function consumeStreamForBuffer({
  readable,
  streamId,
  streamBufferEnv,
}: {
  readable: ReadableStream<SseChunk>;
  streamId: string;
  streamBufferEnv: StreamBufferBindings;
}): Promise<void> {
  const log = createModuleLogger("api:chat:stream-buffer");
  const reader = readable.getReader();
  const decoder = new TextDecoder();
  let chunkBuffer = "";
  let pendingEvents: StreamBufferAppendEvent[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  const flushPendingEvents = async () => {
    if (pendingEvents.length === 0) {
      return;
    }

    const events = pendingEvents;
    pendingEvents = [];

    try {
      await appendStreamBufferEvents({
        env: streamBufferEnv,
        streamId,
        events,
      });
    } catch (error) {
      log.error(
        {
          error,
          streamId,
          batchSize: events.length,
        },
        "Failed to append stream batch"
      );
    }
  };

  const scheduleFlush = () => {
    if (flushTimer) {
      return;
    }

    flushTimer = setTimeout(() => {
      flushTimer = null;
      flushPendingEvents().catch((error) => {
        log.error(
          { error, streamId },
          "Failed to flush scheduled stream batch"
        );
      });
    }, STREAM_BUFFER_FLUSH_DELAY_MS);
  };

  const enqueueEvents = async (events: StreamBufferAppendEvent[]) => {
    if (events.length === 0) {
      return;
    }

    pendingEvents.push(...events);
    if (pendingEvents.length >= STREAM_BUFFER_BATCH_SIZE) {
      await flushPendingEvents();
      return;
    }

    scheduleFlush();
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      chunkBuffer += decodeSseChunk(value, decoder);
      const { blocks: chunkBlocks, remainder } =
        takeCompleteSseBlocks(chunkBuffer);
      chunkBuffer = remainder;
      await enqueueEvents(toStreamBufferEvents(chunkBlocks));
    }

    const trailing = decoder.decode();
    if (trailing) {
      chunkBuffer += trailing;
    }

    const { blocks: trailingBlocks } = takeCompleteSseBlocks(chunkBuffer);
    await enqueueEvents(toStreamBufferEvents(trailingBlocks));
  } catch (error) {
    log.error({ error, streamId }, "Failed while reading stream buffer branch");
  } finally {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }

    await flushPendingEvents();

    try {
      await finalizeStreamBuffer({ env: streamBufferEnv, streamId });
    } catch (error) {
      log.error({ error, streamId }, "Failed to finalize stream buffer");
    }
  }
}

type AnonymousSessionResult =
  | { success: true; session: AnonymousSession }
  | { success: false; error: Response };

async function handleAnonymousSession({
  request,
  existingSession,
  selectedModelId,
}: {
  request: Request;
  existingSession: AnonymousSession | null;
  selectedModelId: AppModelId;
}): Promise<AnonymousSessionResult> {
  const log = createModuleLogger("api:chat:anonymous");

  const clientIP = getClientIP(request);
  const rateLimitResult = await checkAnonymousRateLimit(
    clientIP,
    getRateLimitKV()
  );

  if (!rateLimitResult.success) {
    log.warn({ clientIP }, "Rate limit exceeded");
    return {
      success: false,
      error: Response.json(
        { error: rateLimitResult.error, type: "RATE_LIMIT_EXCEEDED" },
        { status: 429, headers: rateLimitResult.headers || {} }
      ),
    };
  }

  const session = existingSession ?? (await createAnonymousSession());

  if (session.remainingCredits <= 0) {
    log.info("Anonymous credit limit reached");
    return {
      success: false,
      error: Response.json(
        {
          error: "You've used your free credits. Sign up to continue chatting!",
          type: "ANONYMOUS_LIMIT_EXCEEDED",
          suggestion:
            "Create an account to get more credits and access to more AI models",
        },
        { status: 402, headers: rateLimitResult.headers || {} }
      ),
    };
  }

  if (
    !ANONYMOUS_LIMITS.AVAILABLE_MODELS.includes(
      selectedModelId as (typeof ANONYMOUS_LIMITS.AVAILABLE_MODELS)[number]
    )
  ) {
    log.warn("Model not available for anonymous users");
    return {
      success: false,
      error: Response.json(
        {
          error: "Model not available for anonymous users",
          availableModels: ANONYMOUS_LIMITS.AVAILABLE_MODELS,
        },
        { status: 403, headers: rateLimitResult.headers || {} }
      ),
    };
  }

  return { success: true, session };
}

async function handleChatValidation({
  chatId,
  userId,
  userMessage,
  projectId,
}: {
  chatId: string;
  userId: string;
  userMessage: ChatMessage;
  projectId?: string;
}): Promise<{ error: Response | null; isNewChat: boolean }> {
  const log = createModuleLogger("api:chat:validation");

  const chat = await getChatById({ id: chatId });
  let isNewChat = false;

  if (chat) {
    if (chat.userId !== userId) {
      log.warn("Unauthorized - chat ownership mismatch");
      return {
        error: new Response("Unauthorized", { status: 401 }),
        isNewChat,
      };
    }
  } else {
    isNewChat = true;
    const title = await generateTitleFromUserMessage({
      message: userMessage,
    });

    await saveChat({ id: chatId, userId, title, projectId });
  }

  const [existentMessage] = await getMessageById({ id: userMessage.id });

  if (existentMessage && existentMessage.chatId !== chatId) {
    log.warn("Unauthorized - message chatId mismatch");
    return { error: new Response("Unauthorized", { status: 401 }), isNewChat };
  }

  if (!existentMessage) {
    // If the message does not exist, save it
    await saveMessage({
      id: userMessage.id,
      chatId,
      message: userMessage,
    });
  }

  return { error: null, isNewChat };
}

async function checkUserCanSpend(userId: string): Promise<Response | null> {
  const userCanSpend = await canSpend(userId);
  if (!userCanSpend) {
    return new Response("Insufficient credits", { status: 402 });
  }
  return null;
}

async function prepareChatForRequest({
  chatId,
  userId,
  userMessage,
  projectId,
  anonymousSession,
}: {
  chatId: string;
  userId: string | null;
  userMessage: ChatMessage;
  projectId?: string;
  anonymousSession: AnonymousSession | null;
}): Promise<{
  error: Response | null;
  isNewChat: boolean;
  updatedAnonymousSession: AnonymousSession | null;
}> {
  if (userId) {
    const validationResult = await handleChatValidation({
      chatId,
      userId,
      userMessage,
      projectId,
    });
    if (validationResult.error) {
      return {
        ...validationResult,
        updatedAnonymousSession: null,
      };
    }

    const creditError = await checkUserCanSpend(userId);
    if (creditError) {
      return {
        error: creditError,
        isNewChat: validationResult.isNewChat,
        updatedAnonymousSession: null,
      };
    }

    return {
      error: null,
      isNewChat: validationResult.isNewChat,
      updatedAnonymousSession: null,
    };
  }

  if (anonymousSession) {
    // Pre-deduct anonymous credits before streaming begins.
    return {
      error: null,
      isNewChat: false,
      updatedAnonymousSession: {
        ...anonymousSession,
        remainingCredits: anonymousSession.remainingCredits - 1,
      },
    };
  }

  return { error: null, isNewChat: false, updatedAnonymousSession: null };
}

/**
 * Determines which built-in tools are allowed based on model capabilities.
 * MCP tools are handled separately in core-chat-agent.
 */
function determineAllowedTools({
  isAnonymous,
  modelDefinition,
  explicitlyRequestedTools,
}: {
  isAnonymous: boolean;
  modelDefinition: AppModelDefinition;
  explicitlyRequestedTools: ToolName[] | null;
}): ToolName[] {
  // Start with all tools or anonymous-limited tools
  const allowedTools: ToolName[] = isAnonymous
    ? [...ANONYMOUS_LIMITS.AVAILABLE_TOOLS]
    : [...allTools];

  // Disable all tools for models with unspecified features
  if (!modelDefinition?.input) {
    return [];
  }

  // If specific tools were requested, filter them against allowed tools
  if (explicitlyRequestedTools && explicitlyRequestedTools.length > 0) {
    return explicitlyRequestedTools.filter((tool) =>
      allowedTools.includes(tool)
    );
  }

  return allowedTools;
}

async function getSystemPrompt({
  isAnonymous,
  chatId,
}: {
  isAnonymous: boolean;
  chatId: string;
}): Promise<string> {
  let system = systemPrompt();
  if (!isAnonymous) {
    const currentChat = await getChatById({ id: chatId });
    if (currentChat?.projectId) {
      const project = await getProjectById({ id: currentChat.projectId });
      if (project?.instructions) {
        system = `${system}\n\nProject instructions:\n${project.instructions}`;
      }
    }
  }
  return system;
}

async function createChatStream({
  messageId,
  chatId,
  userMessage,
  previousMessages,
  selectedModelId,
  explicitlyRequestedTools,
  userId,
  allowedTools,
  abortController,
  isAnonymous,
  isNewChat,
  timeoutId,
  mcpConnectors,
  streamId,
  onChunk,
}: {
  messageId: string;
  chatId: string;
  userMessage: ChatMessage;
  previousMessages: ChatMessage[];
  selectedModelId: AppModelId;
  explicitlyRequestedTools: ToolName[] | null;
  userId: string | null;
  allowedTools: ToolName[];
  abortController: AbortController;
  isAnonymous: boolean;
  isNewChat: boolean;
  timeoutId: NodeJS.Timeout;
  mcpConnectors: McpConnector[];
  streamId: string;
  onChunk?: () => void;
}) {
  const log = createModuleLogger("api:chat:stream");
  const system = await getSystemPrompt({ isAnonymous, chatId });

  // Create cost accumulator to track all LLM and API costs
  const costAccumulator = new CostAccumulator();

  // Build the data stream that will emit tokens
  const stream = createUIMessageStream<ChatMessage>({
    execute: async ({ writer: dataStream }) => {
      // Confirm chat persistence on first message (chat + user message are persisted before streaming begins)
      if (isNewChat) {
        dataStream.write({
          id: generateUUID(),
          type: "data-chatConfirmed",
          data: { chatId },
          transient: true,
        });
      }

      const { result, contextForLLM } = await createCoreChatAgent({
        system,
        userMessage,
        previousMessages,
        selectedModelId,
        explicitlyRequestedTools,
        userId,
        budgetAllowedTools: allowedTools,
        abortSignal: abortController.signal,
        messageId,
        dataStream,
        onError: (error) => {
          log.error({ error }, "streamText error");
        },
        onChunk,
        mcpConnectors,
        costAccumulator,
      });

      const initialMetadata: ChatMessage["metadata"] = {
        createdAt: new Date(),
        parentMessageId: userMessage.id,
        selectedModel: selectedModelId,
        activeStreamId: isAnonymous ? null : streamId,
      };

      dataStream.merge(
        result.toUIMessageStream({
          sendReasoning: true,
          messageMetadata: ({ part }) => {
            // send custom information to the client on start:
            if (part.type === "start") {
              return initialMetadata;
            }

            // when the message is finished, send additional information:
            if (part.type === "finish") {
              // Add main stream LLM usage to accumulator
              if (part.totalUsage) {
                costAccumulator.addLLMCost(
                  selectedModelId,
                  part.totalUsage,
                  "main-chat"
                );
              }
              return {
                ...initialMetadata,
                usage: part.totalUsage,
                activeStreamId: null,
              };
            }
          },
        })
      );
      await result.consumeStream();

      const response = await result.response;
      const responseMessages = response.messages;

      // Generate and stream follow-up suggestions
      const followupSuggestionsResult = generateFollowupSuggestions([
        ...contextForLLM,
        ...responseMessages,
      ]);
      await streamFollowupSuggestions({
        followupSuggestionsResult,
        writer: dataStream,
      });
    },
    generateId: () => messageId,
    onFinish: async ({ messages }) => {
      clearTimeout(timeoutId);
      await finalizeMessageAndCredits({
        messages,
        userId,
        isAnonymous,
        chatId,
        costAccumulator,
      });
    },
    onError: (error) => {
      clearTimeout(timeoutId);
      // If the stream fails, ensure the placeholder assistant message is no longer marked resumable.
      // Otherwise the client will try to resume a stream that no longer exists and we end up with a
      // stuck partial placeholder on reload.
      if (!isAnonymous) {
        runInBackground(() =>
          updateMessageActiveStreamId({ id: messageId, activeStreamId: null })
            .catch((dbError) => {
            log.error(
              { error: dbError },
              "Failed to clear activeStreamId on stream error"
            );
          })
        );
      }

      log.error({ error }, "onError");
      return "Oops, an error occured!";
    },
  });

  return stream;
}

async function executeChatRequest({
  chatId,
  userMessage,
  previousMessages,
  selectedModelId,
  explicitlyRequestedTools,
  userId,
  isAnonymous,
  isNewChat,
  allowedTools,
  abortController,
  timeoutId,
  mcpConnectors,
}: {
  chatId: string;
  userMessage: ChatMessage;
  previousMessages: ChatMessage[];
  selectedModelId: AppModelId;
  explicitlyRequestedTools: ToolName[] | null;
  userId: string | null;
  isAnonymous: boolean;
  isNewChat: boolean;
  allowedTools: ToolName[];
  abortController: AbortController;
  timeoutId: NodeJS.Timeout;
  mcpConnectors: McpConnector[];
}): Promise<Response> {
  const messageId = generateUUID();
  const streamId = generateUUID();

  if (!isAnonymous) {
    // Save placeholder assistant message immediately (needed for document creation)
    await saveMessage({
      id: messageId,
      chatId,
      message: {
        id: messageId,
        role: "assistant",
        parts: [],
        metadata: {
          createdAt: new Date(),
          parentMessageId: userMessage.id,
          selectedModel: selectedModelId,
          selectedTool: undefined,
          activeStreamId: streamId,
        },
      },
    });
  }

  // Create throttled cancel check (max once per second) for authenticated users
  const onChunk =
    !isAnonymous && userId
      ? throttle(async () => {
          const canceledAt = await getMessageCanceledAt({ messageId });
          if (canceledAt) {
            abortController.abort();
          }
        }, 1000)
      : undefined;

  // Build the data stream that will emit tokens
  const stream = await createChatStream({
    messageId,
    chatId,
    userMessage,
    previousMessages,
    selectedModelId,
    explicitlyRequestedTools,
    userId,
    allowedTools,
    abortController,
    isAnonymous,
    isNewChat,
    timeoutId,
    mcpConnectors,
    streamId,
    onChunk,
  });

  const sseHeaders = {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  } as const;

  const sseStream = stream.pipeThrough(new JsonToSseTransformStream());
  const streamBufferEnv = isAnonymous ? null : getStreamBufferBindings();

  if (streamBufferEnv) {
    const [clientStream, bufferStream] = sseStream.tee();
    runInBackground(() =>
      consumeStreamForBuffer({
        readable: bufferStream,
        streamId,
        streamBufferEnv,
      })
    );
    return new Response(clientStream, { headers: sseHeaders });
  }

  return new Response(sseStream, { headers: sseHeaders });
}

type SessionSetupResult =
  | { success: false; error: Response }
  | {
      success: true;
      userId: string | null;
      isAnonymous: boolean;
      anonymousSession: AnonymousSession | null;
      modelDefinition: AppModelDefinition;
    };

async function validateAndSetupSession({
  request,
  selectedModelId,
}: {
  request: Request;
  selectedModelId: AppModelId;
}): Promise<SessionSetupResult> {
  const log = createModuleLogger("api:chat:setup");

  const session = await auth.api.getSession({ headers: request.headers });
  const userId = session?.user?.id ?? null;
  const isAnonymous = userId === null;

  const existingAnonymousSession = getAnonymousSessionFromRequest(request);
  let anonymousSession: AnonymousSession | null = existingAnonymousSession;

  if (userId) {
    const user = await getUserById({ userId });
    if (!user) {
      log.warn("User not found");
      return {
        success: false,
        error: new Response("User not found", { status: 404 }),
      };
    }
  } else {
    const result = await handleAnonymousSession({
      request,
      existingSession: existingAnonymousSession,
      selectedModelId,
    });

    if (!result.success) {
      return result;
    }
    anonymousSession = result.session;
  }

  let modelDefinition: AppModelDefinition;
  try {
    modelDefinition = await getAppModelDefinition(selectedModelId);
  } catch {
    log.warn("Model not found");
    return {
      success: false,
      error: new Response("Model not found", { status: 404 }),
    };
  }

  return {
    success: true,
    userId,
    isAnonymous,
    anonymousSession,
    modelDefinition,
  };
}

async function prepareRequestContext({
  userMessage,
  chatId,
  isAnonymous,
  anonymousPreviousMessages,
  modelDefinition,
  explicitlyRequestedTools,
}: {
  userMessage: ChatMessage;
  chatId: string;
  isAnonymous: boolean;
  anonymousPreviousMessages: ChatMessage[];
  modelDefinition: AppModelDefinition;
  explicitlyRequestedTools: ToolName[] | null;
}): Promise<{
  previousMessages: ChatMessage[];
  allowedTools: ToolName[];
  error: Response | null;
}> {
  const log = createModuleLogger("api:chat:prepare");

  const allowedTools = determineAllowedTools({
    isAnonymous,
    modelDefinition,
    explicitlyRequestedTools,
  });

  // Validate input token limit (50k tokens for user message)
  const totalTokens = calculateMessagesTokens(
    await convertToModelMessages([userMessage])
  );

  if (totalTokens > MAX_INPUT_TOKENS) {
    log.warn({ totalTokens, MAX_INPUT_TOKENS }, "Token limit exceeded");
    const error = new ChatSDKError(
      "input_too_long:chat",
      `Message too long: ${totalTokens} tokens (max: ${MAX_INPUT_TOKENS})`
    );
    return {
      previousMessages: [],
      allowedTools: [],
      error: error.toResponse(),
    };
  }

  const messageThreadToParent = isAnonymous
    ? anonymousPreviousMessages
    : await getThreadUpToMessageId(
        chatId,
        userMessage.metadata.parentMessageId
      );

  const previousMessages = messageThreadToParent.slice(-5);
  log.debug({ allowedTools }, "allowed tools");

  return { previousMessages, allowedTools, error: null };
}

async function finalizeMessageAndCredits({
  messages,
  userId,
  isAnonymous,
  chatId,
  costAccumulator,
}: {
  messages: ChatMessage[];
  userId: string | null;
  isAnonymous: boolean;
  chatId: string;
  costAccumulator: CostAccumulator;
}): Promise<void> {
  const log = createModuleLogger("api:chat:finalize");

  try {
    const assistantMessage = messages.at(-1);

    if (!assistantMessage) {
      throw new Error("No assistant message found!");
    }

    if (!isAnonymous) {
      await updateMessage({
        id: assistantMessage.id,
        chatId,
        message: {
          ...assistantMessage,
          metadata: {
            ...assistantMessage.metadata,
            activeStreamId: null,
          },
        },
      });
    }

    // Get total cost from accumulator (includes all LLM calls + external API costs)
    const totalCost = await costAccumulator.getTotalCost();
    const entries = costAccumulator.getEntries();

    log.info({ entries }, "Cost accumulator entries");
    log.info({ totalCost }, "Cost accumulator total cost");

    // Deduct credits for authenticated users
    if (userId && !isAnonymous) {
      await deductCredits(userId, totalCost);
    }

    // Note: Anonymous credits are pre-deducted before streaming starts (cookies can't be set after response begins)
  } catch (error) {
    log.error({ error }, "Failed to save chat or finalize credits");
  }
}

function applySetCookieHeader(response: Response, cookieValue: string): Response {
  const headers = new Headers(response.headers);
  headers.append("Set-Cookie", cookieValue);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function POST(request: Request) {
  const log = createModuleLogger("api:chat");
  try {
    const {
      id: chatId,
      message: userMessage,
      prevMessages: anonymousPreviousMessages,
      projectId,
    }: {
      id: string;
      message: ChatMessage;
      prevMessages: ChatMessage[];
      projectId?: string;
    } = await request.json();

    if (!userMessage) {
      log.warn("No user message found");
      return new ChatSDKError("bad_request:api").toResponse();
    }

    // Extract selectedModel from user message metadata
    const selectedModelId = userMessage.metadata?.selectedModel as AppModelId;

    if (!selectedModelId) {
      log.warn("No selectedModel in user message metadata");
      return new ChatSDKError("bad_request:api").toResponse();
    }

    const sessionSetup = await validateAndSetupSession({
      request,
      selectedModelId,
    });

    if (!sessionSetup.success) {
      return sessionSetup.error;
    }

    const { userId, isAnonymous, anonymousSession, modelDefinition } =
      sessionSetup;

    const selectedTool = userMessage.metadata.selectedTool ?? null;

    const chatPreparationResult = await prepareChatForRequest({
      chatId,
      userId,
      userMessage,
      projectId,
      anonymousSession,
    });
    if (chatPreparationResult.error) {
      return chatPreparationResult.error;
    }
    const { isNewChat, updatedAnonymousSession } = chatPreparationResult;

    const explicitlyRequestedTools =
      determineExplicitlyRequestedTools(selectedTool);

    const contextResult = await prepareRequestContext({
      userMessage,
      chatId,
      isAnonymous,
      anonymousPreviousMessages,
      modelDefinition,
      explicitlyRequestedTools,
    });

    if (contextResult.error) {
      return contextResult.error;
    }

    const { previousMessages, allowedTools } = contextResult;

    // Fetch MCP connectors for authenticated users (only if MCP integration enabled)
    const mcpConnectors: McpConnector[] =
      config.integrations.mcp && userId && !isAnonymous
        ? await getMcpConnectorsByUserId({ userId })
        : [];

    // Create AbortController with timeout
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, 290_000); // 290 seconds

    const response = await executeChatRequest({
      chatId,
      userMessage,
      previousMessages,
      selectedModelId,
      explicitlyRequestedTools,
      userId,
      isAnonymous,
      isNewChat,
      allowedTools,
      abortController,
      timeoutId,
      mcpConnectors,
    });

    if (updatedAnonymousSession) {
      return applySetCookieHeader(
        response,
        serializeAnonymousSessionCookie(updatedAnonymousSession)
      );
    }

    return response;
  } catch (error) {
    log.error(
      {
        err:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : error,
      },
      "RESPONSE > POST /api/chat error"
    );
    return new Response("Internal Server Error", {
      status: 500,
    });
  }
}
