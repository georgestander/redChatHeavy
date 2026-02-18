import { pathToFileURL } from "node:url";
import { and, eq, inArray, like } from "drizzle-orm";
import type { ChatMessage } from "../../lib/ai/types";
import { db } from "../../lib/db/client";
import { saveDocuments, saveMessage } from "../../lib/db/queries";
import { chat, project, user } from "../../lib/db/schema";
import {
  SMOKE_IMAGE_DATA_URL,
  SMOKE_PRIVATE_ASSISTANT_MESSAGE_ID,
  SMOKE_PRIVATE_CHAT_ID,
  SMOKE_PRIVATE_USER_MESSAGE_ID,
  SMOKE_PUBLIC_ASSISTANT_MESSAGE_ID,
  SMOKE_PUBLIC_CHAT_ID,
  SMOKE_PUBLIC_USER_MESSAGE_ID,
  SMOKE_TEXT_DOCUMENT_ID,
  SMOKE_TITLE_PREFIX,
  SMOKE_TOOLS_ASSISTANT_MESSAGE_ID,
  SMOKE_TOOLS_CHAT_ID,
  SMOKE_TOOLS_USER_MESSAGE_ID,
  SMOKE_USER_EMAIL,
} from "./fixtures";

type SeedResult = {
  userId: string;
  chats: {
    private: string;
    public: string;
    tools: string;
  };
};

function buildMessage({
  id,
  role,
  parentMessageId,
  parts,
  createdAt,
}: {
  id: string;
  role: "assistant" | "user";
  parentMessageId: string | null;
  parts: ChatMessage["parts"];
  createdAt: Date;
}): ChatMessage {
  return {
    id,
    role,
    parts,
    metadata: {
      createdAt,
      parentMessageId,
      selectedModel: "openai/gpt-5-nano",
      activeStreamId: null,
    },
  };
}

async function ensureSmokeUser(): Promise<string> {
  const [existing] = await db
    .select()
    .from(user)
    .where(eq(user.email, SMOKE_USER_EMAIL))
    .limit(1);

  if (existing) {
    return existing.id;
  }

  const id = crypto.randomUUID();
  await db.insert(user).values({
    id,
    email: SMOKE_USER_EMAIL,
    name: "Dev User",
    emailVerified: true,
  });

  return id;
}

async function cleanupSmokeData(userId: string): Promise<void> {
  const smokeChats = await db
    .select({ id: chat.id })
    .from(chat)
    .where(and(eq(chat.userId, userId), like(chat.title, `${SMOKE_TITLE_PREFIX}%`)));

  if (smokeChats.length > 0) {
    await db
      .delete(chat)
      .where(inArray(chat.id, smokeChats.map((c) => c.id)));
  }

  const smokeProjects = await db
    .select({ id: project.id })
    .from(project)
    .where(
      and(
        eq(project.userId, userId),
        like(project.name, `${SMOKE_TITLE_PREFIX}%`)
      )
    );

  if (smokeProjects.length > 0) {
    await db
      .delete(project)
      .where(inArray(project.id, smokeProjects.map((p) => p.id)));
  }
}

export async function seedSmokeData(): Promise<SeedResult> {
  const userId = await ensureSmokeUser();
  await cleanupSmokeData(userId);

  const now = Date.now();
  const createdAt = new Date(now - 5 * 60 * 1000);

  await db.insert(chat).values([
    {
      id: SMOKE_PRIVATE_CHAT_ID,
      userId,
      title: `${SMOKE_TITLE_PREFIX} Private Chat`,
      createdAt,
      updatedAt: createdAt,
      visibility: "private",
    },
    {
      id: SMOKE_PUBLIC_CHAT_ID,
      userId,
      title: `${SMOKE_TITLE_PREFIX} Public Chat`,
      createdAt,
      updatedAt: createdAt,
      visibility: "public",
    },
    {
      id: SMOKE_TOOLS_CHAT_ID,
      userId,
      title: `${SMOKE_TITLE_PREFIX} Tools Chat`,
      createdAt,
      updatedAt: createdAt,
      visibility: "private",
    },
  ]);

  const privateUserMessage = buildMessage({
    id: SMOKE_PRIVATE_USER_MESSAGE_ID,
    role: "user",
    parentMessageId: null,
    createdAt: new Date(now - 4 * 60 * 1000),
    parts: [
      {
        type: "file",
        filename: "smoke-spec.pdf",
        mediaType: "application/pdf",
        url: "https://example.com/smoke-spec.pdf",
      } as ChatMessage["parts"][number],
      {
        type: "text",
        text: `${SMOKE_TITLE_PREFIX} user question with attachment`,
      } as ChatMessage["parts"][number],
    ],
  });

  const privateAssistantMessage = buildMessage({
    id: SMOKE_PRIVATE_ASSISTANT_MESSAGE_ID,
    role: "assistant",
    parentMessageId: SMOKE_PRIVATE_USER_MESSAGE_ID,
    createdAt: new Date(now - 3 * 60 * 1000),
    parts: [
      {
        type: "text",
        text: `${SMOKE_TITLE_PREFIX} assistant reply for share + history scenarios`,
      } as ChatMessage["parts"][number],
    ],
  });

  const publicUserMessage = buildMessage({
    id: SMOKE_PUBLIC_USER_MESSAGE_ID,
    role: "user",
    parentMessageId: null,
    createdAt: new Date(now - 4 * 60 * 1000),
    parts: [
      {
        type: "text",
        text: `${SMOKE_TITLE_PREFIX} public chat source message`,
      } as ChatMessage["parts"][number],
    ],
  });

  const publicAssistantMessage = buildMessage({
    id: SMOKE_PUBLIC_ASSISTANT_MESSAGE_ID,
    role: "assistant",
    parentMessageId: SMOKE_PUBLIC_USER_MESSAGE_ID,
    createdAt: new Date(now - 3 * 60 * 1000),
    parts: [
      {
        type: "text",
        text: `${SMOKE_TITLE_PREFIX} public assistant response`,
      } as ChatMessage["parts"][number],
    ],
  });

  const toolsUserMessage = buildMessage({
    id: SMOKE_TOOLS_USER_MESSAGE_ID,
    role: "user",
    parentMessageId: null,
    createdAt: new Date(now - 2 * 60 * 1000),
    parts: [
      {
        type: "text",
        text: `${SMOKE_TITLE_PREFIX} render tool outputs and canvas preview`,
      } as ChatMessage["parts"][number],
    ],
  });

  const toolCallId = "smoke-web-search-call";
  const toolsAssistantMessage = buildMessage({
    id: SMOKE_TOOLS_ASSISTANT_MESSAGE_ID,
    role: "assistant",
    parentMessageId: SMOKE_TOOLS_USER_MESSAGE_ID,
    createdAt: new Date(now - 90_000),
    parts: [
      {
        type: "reasoning",
        text: `${SMOKE_TITLE_PREFIX} reasoning placeholder`,
      } as ChatMessage["parts"][number],
      {
        type: "text",
        text: `${SMOKE_TITLE_PREFIX} assistant response with tool outputs`,
      } as ChatMessage["parts"][number],
      {
        type: "data-researchUpdate",
        data: {
          type: "started",
          title: "Searching",
          toolCallId,
          timestamp: now - 80_000,
        },
      } as ChatMessage["parts"][number],
      {
        type: "data-researchUpdate",
        data: {
          type: "web",
          status: "completed",
          title: "Web search step",
          toolCallId,
          queries: ["chatjs smoke test"],
          results: [
            {
              url: "https://example.com/smoke",
              title: "Smoke Source",
              content: "Source content",
              source: "web",
            },
          ],
        },
      } as ChatMessage["parts"][number],
      {
        type: "data-researchUpdate",
        data: {
          type: "completed",
          title: "Search complete",
          toolCallId,
          timestamp: now - 75_000,
        },
      } as ChatMessage["parts"][number],
      {
        type: "tool-webSearch",
        toolCallId,
        state: "output-available",
        input: {
          search_queries: [{ query: "chatjs smoke test", maxResults: 1 }],
          topics: ["general"],
          searchDepth: "basic",
          exclude_domains: [],
        },
        output: {
          searches: [
            {
              query: { query: "chatjs smoke test", maxResults: 1 },
              results: [
                {
                  url: "https://example.com/smoke",
                  title: "Smoke Source",
                  content: "Source content",
                  source: "web",
                },
              ],
            },
          ],
        },
      } as ChatMessage["parts"][number],
      {
        type: "tool-deepResearch",
        toolCallId: "smoke-deep-research-call",
        state: "output-available",
        input: {},
        output: {
          format: "problem",
          answer: "Simulated deep research output",
        },
      } as ChatMessage["parts"][number],
      {
        type: "tool-generateImage",
        toolCallId: "smoke-generate-image-call",
        state: "output-available",
        input: { prompt: "Smoke image prompt" },
        output: {
          imageUrl: SMOKE_IMAGE_DATA_URL,
          prompt: "Smoke image prompt",
        },
      } as ChatMessage["parts"][number],
      {
        type: "tool-createTextDocument",
        toolCallId: "smoke-create-document-call",
        state: "output-available",
        input: {
          title: `${SMOKE_TITLE_PREFIX} Design Notes`,
          content: "# Smoke notes\n\nThis text document is for smoke testing.",
        },
        output: {
          status: "success",
          documentId: SMOKE_TEXT_DOCUMENT_ID,
          result: "Document created",
          date: new Date(now - 70_000).toISOString(),
        },
      } as ChatMessage["parts"][number],
      {
        type: "tool-codeExecution",
        toolCallId: "smoke-code-execution-call",
        state: "output-available",
        input: {
          title: `${SMOKE_TITLE_PREFIX} Python Check`,
          code: "print('smoke ok')",
          icon: "python",
        },
        output: {
          message: "smoke ok",
        },
      } as ChatMessage["parts"][number],
    ],
  });

  await saveMessage({
    id: privateUserMessage.id,
    chatId: SMOKE_PRIVATE_CHAT_ID,
    message: privateUserMessage,
  });
  await saveMessage({
    id: privateAssistantMessage.id,
    chatId: SMOKE_PRIVATE_CHAT_ID,
    message: privateAssistantMessage,
  });
  await saveMessage({
    id: publicUserMessage.id,
    chatId: SMOKE_PUBLIC_CHAT_ID,
    message: publicUserMessage,
  });
  await saveMessage({
    id: publicAssistantMessage.id,
    chatId: SMOKE_PUBLIC_CHAT_ID,
    message: publicAssistantMessage,
  });
  await saveMessage({
    id: toolsUserMessage.id,
    chatId: SMOKE_TOOLS_CHAT_ID,
    message: toolsUserMessage,
  });
  await saveMessage({
    id: toolsAssistantMessage.id,
    chatId: SMOKE_TOOLS_CHAT_ID,
    message: toolsAssistantMessage,
  });

  await saveDocuments({
    documents: [
      {
        id: SMOKE_TEXT_DOCUMENT_ID,
        title: `${SMOKE_TITLE_PREFIX} Design Notes`,
        kind: "text",
        content: "# Smoke notes\n\nThis text document is for smoke testing.",
        userId,
        messageId: SMOKE_TOOLS_ASSISTANT_MESSAGE_ID,
        createdAt: new Date(now - 70_000),
      },
    ],
  });

  return {
    userId,
    chats: {
      private: SMOKE_PRIVATE_CHAT_ID,
      public: SMOKE_PUBLIC_CHAT_ID,
      tools: SMOKE_TOOLS_CHAT_ID,
    },
  };
}

const isDirectRun =
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  seedSmokeData()
    .then((result) => {
      console.log("Seeded smoke data", result);
    })
    .catch((error) => {
      console.error("Failed to seed smoke data", error);
      process.exitCode = 1;
    });
}
