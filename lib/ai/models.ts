import { unstable_cache } from "@/lib/cache/kv-cache";
import { createModuleLogger } from "@/lib/logger";
import {
  type AiGatewayModel,
  aiGatewayModelsResponseSchema,
} from "./ai-gateway-models-schemas";
import type { ModelData } from "./model-data";
import { models as fallbackModels } from "./models.generated";
import { toModelData } from "./to-model-data";

const log = createModuleLogger("ai/models");
const OPENAI_MODELS_URL = "https://api.openai.com/v1/models";
const AI_GATEWAY_MODELS_URL = "https://ai-gateway.vercel.sh/v1/models";
const DEFAULT_CONTEXT_WINDOW = 128_000;
const DEFAULT_MAX_TOKENS = 16_384;
const MODEL_CATALOG_REQUEST_TIMEOUT_MS = 8_000;

type OpenAiListModelItem = {
  id: string;
  object: "model";
  created?: number;
  owned_by?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, MODEL_CATALOG_REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseOpenAiListModelsResponse(
  value: unknown
): OpenAiListModelItem[] | null {
  if (!isRecord(value) || value.object !== "list" || !Array.isArray(value.data)) {
    return null;
  }

  const parsed: OpenAiListModelItem[] = [];
  for (const item of value.data) {
    if (!isRecord(item) || typeof item.id !== "string") {
      continue;
    }

    const object = item.object;
    if (object !== "model") {
      continue;
    }

    parsed.push({
      id: item.id,
      object: "model",
      created: typeof item.created === "number" ? item.created : undefined,
      owned_by: typeof item.owned_by === "string" ? item.owned_by : undefined,
    });
  }

  return parsed;
}

function normalizeOpenAiModelId(id: string): string {
  return id.startsWith("openai/") ? id.slice("openai/".length) : id;
}

function isOpenAiLanguageModelId(id: string): boolean {
  const modelId = id.toLowerCase();

  if (
    modelId.startsWith("text-embedding-") ||
    modelId.includes("embedding-") ||
    modelId.startsWith("gpt-image-") ||
    modelId.startsWith("dall-e-") ||
    modelId.startsWith("omni-moderation-") ||
    modelId.startsWith("whisper-") ||
    modelId.startsWith("tts-") ||
    modelId.includes("realtime") ||
    modelId.includes("audio") ||
    modelId.includes("tts") ||
    modelId.includes("transcribe") ||
    modelId.includes("image")
  ) {
    return false;
  }

  if (modelId.startsWith("gpt-") || modelId.startsWith("chatgpt-")) {
    return true;
  }

  if (/^o\d/.test(modelId) || modelId.startsWith("codex-")) {
    return true;
  }

  if (modelId.startsWith("ft:")) {
    return modelId.includes(":gpt-") || modelId.includes(":o");
  }

  return false;
}

function isLikelyReasoningModel(id: string): boolean {
  const modelId = id.toLowerCase();
  return (
    modelId.startsWith("gpt-5") ||
    /^o\d/.test(modelId) ||
    modelId.includes("reasoning") ||
    modelId.includes("thinking")
  );
}

function toFallbackOpenAiModel(
  model: OpenAiListModelItem,
  fallbackOpenAiById: Map<string, AiGatewayModel>
): AiGatewayModel | null {
  const rawId = normalizeOpenAiModelId(model.id);
  if (!isOpenAiLanguageModelId(rawId)) {
    return null;
  }

  const knownModel = fallbackOpenAiById.get(rawId);
  if (knownModel) {
    return knownModel;
  }

  const now = Math.floor(Date.now() / 1000);
  const tags: NonNullable<AiGatewayModel["tags"]> = [];
  if (isLikelyReasoningModel(rawId)) {
    tags.push("reasoning");
  }

  return {
    id: `openai/${rawId}`,
    object: "model",
    created: model.created ?? now,
    owned_by: "openai",
    name: rawId,
    description: `OpenAI model discovered via ${OPENAI_MODELS_URL}`,
    context_window: DEFAULT_CONTEXT_WINDOW,
    max_tokens: DEFAULT_MAX_TOKENS,
    type: "language",
    tags,
    pricing: {},
  } satisfies AiGatewayModel;
}

async function fetchOpenAiModelsRaw(
  apiKey: string
): Promise<AiGatewayModel[] | null> {
  log.info("OPENAI_API_KEY detected, fetching models from OpenAI API");

  try {
    const response = await fetchWithTimeout(OPENAI_MODELS_URL, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      next: { revalidate: 3600 },
    });

    if (!response.ok) {
      log.error(
        {
          status: response.status,
          statusText: response.statusText,
          url: OPENAI_MODELS_URL,
        },
        "OpenAI models endpoint returned non-OK response"
      );
      return null;
    }

    const bodyRaw = await response.json();
    const body = parseOpenAiListModelsResponse(bodyRaw);
    if (!body) {
      log.error(
        { url: OPENAI_MODELS_URL },
        "OpenAI models endpoint returned an unexpected payload"
      );
      return null;
    }

    const fallbackOpenAiById = new Map(
      (fallbackModels as unknown as AiGatewayModel[])
        .filter((model) => model.owned_by === "openai")
        .map((model) => [normalizeOpenAiModelId(model.id), model])
    );

    const models = body
      .map((model) => toFallbackOpenAiModel(model, fallbackOpenAiById))
      .filter((model): model is AiGatewayModel => model !== null);

    log.info(
      { modelCount: models.length },
      "Successfully fetched OpenAI models from /v1/models"
    );

    return models;
  } catch (error) {
    log.error(
      { err: error, url: OPENAI_MODELS_URL },
      "Error fetching OpenAI models"
    );
    return null;
  }
}

async function fetchModelsRaw(): Promise<AiGatewayModel[]> {
  const openAiApiKey = process.env.OPENAI_API_KEY;
  if (openAiApiKey) {
    const openAiModels = await fetchOpenAiModelsRaw(openAiApiKey);
    if (openAiModels && openAiModels.length > 0) {
      return openAiModels;
    }
    log.warn("Falling back to generated model snapshot after OpenAI fetch failed");
    return (fallbackModels as unknown as AiGatewayModel[]).filter(
      (model) => model.owned_by === "openai"
    );
  }

  const apiKey =
    process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;

  if (!apiKey) {
    log.warn("No AI gateway API key found, using fallback models");
    return fallbackModels as unknown as AiGatewayModel[];
  }

  const url = AI_GATEWAY_MODELS_URL;
  log.debug({ url }, "Fetching models from AI gateway");

  try {
    const response = await fetchWithTimeout(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      next: { revalidate: 3600 },
    });

    if (!response.ok) {
      log.error(
        {
          status: response.status,
          statusText: response.statusText,
          url,
        },
        "AI gateway returned non-OK response"
      );
      throw new Error(`Failed to fetch models: ${response.statusText}`);
    }

    const bodyRaw = await response.json();
    const body = aiGatewayModelsResponseSchema.parse(bodyRaw);
    const modelCount = body.data?.length ?? 0;

    log.info({ modelCount }, "Successfully fetched models from AI gateway");
    return body.data || [];
  } catch (error) {
    log.error(
      {
        err: error,
        url,
      },
      "Error fetching models from gateway, falling back to generated models"
    );
    return fallbackModels as unknown as AiGatewayModel[];
  }
}

export const fetchModels = unstable_cache(
  async (): Promise<ModelData[]> => {
    const models = await fetchModelsRaw();
    return models.map(toModelData);
  },
  ["ai-gateway-models"],
  {
    revalidate: 3600,
    tags: ["ai-gateway-models"],
  }
);
