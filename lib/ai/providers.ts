import type { AnthropicProviderOptions } from "@ai-sdk/anthropic";
import { devToolsMiddleware } from "@ai-sdk/devtools";
import { gateway } from "@ai-sdk/gateway";
import type { GoogleGenerativeAIProviderOptions } from "@ai-sdk/google";
import { createOpenAI, type OpenAIResponsesProviderOptions } from "@ai-sdk/openai";
import { extractReasoningMiddleware, wrapLanguageModel } from "ai";
import type {
  ImageModelId,
  MultimodalImageModelId,
} from "../models/image-model-id";
import type { AppModelId, ModelId } from "./app-models";
import { getAppModelDefinition } from "./app-models";

const _telemetryConfig = {
  telemetry: {
    isEnabled: true,
    functionId: "get-language-model",
  },
};

const OPENAI_FALLBACK_MODEL_ID = "gpt-5-nano";
const ENABLE_AI_SDK_DEVTOOLS = process.env.AI_SDK_DEVTOOLS === "1";
const OPENAI_MODEL_ALIASES: Record<string, string> = {
  "codex-mini": "gpt-5-mini",
  "codex-mini-latest": "gpt-5-mini",
};

function hasOpenAIKey(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

function toOpenAIModelId(modelId: string): string {
  const normalized = modelId.startsWith("openai/")
    ? modelId.replace("openai/", "")
    : modelId;

  return OPENAI_MODEL_ALIASES[normalized] ?? normalized;
}

export const getLanguageModel = async (modelId: ModelId) => {
  const model = await getAppModelDefinition(modelId);
  const useDirectOpenAI = hasOpenAIKey();
  const languageProvider = useDirectOpenAI
    ? createOpenAI({ apiKey: process.env.OPENAI_API_KEY })(
        model.owned_by === "openai"
          ? toOpenAIModelId(model.id)
          : OPENAI_FALLBACK_MODEL_ID
      )
    : gateway(model.id);

  const middlewares: Parameters<typeof wrapLanguageModel>[0]["middleware"][] =
    [];

  // Add devtools middleware in development
  if (process.env.NODE_ENV === "development" && ENABLE_AI_SDK_DEVTOOLS) {
    middlewares.push(devToolsMiddleware());
  }

  // Add reasoning middleware if the model supports reasoning
  if (model.reasoning && model.owned_by === "xai") {
    console.log("Wrapping reasoning middleware for", model.id);
    middlewares.push(extractReasoningMiddleware({ tagName: "think" }));
  }

  if (middlewares.length === 0) {
    return languageProvider;
  }

  return wrapLanguageModel({
    model: languageProvider,
    // @ts-expect-error - Version of LanguageModel don't match
    middleware: middlewares,
  });
};

export const getImageModel = (modelId: ImageModelId) =>
  hasOpenAIKey()
    ? createOpenAI({ apiKey: process.env.OPENAI_API_KEY }).imageModel("gpt-image-1")
    : gateway.imageModel(modelId);

// Get a multimodal language model that can generate images via generateText
export const getMultimodalImageModel = (modelId: MultimodalImageModelId) =>
  hasOpenAIKey()
    ? createOpenAI({ apiKey: process.env.OPENAI_API_KEY })(
        modelId.startsWith("openai/")
          ? toOpenAIModelId(modelId)
          : OPENAI_FALLBACK_MODEL_ID
      )
    : gateway(modelId);

// Model aliases removed - use getLanguageModel directly with specific model IDs

export const getModelProviderOptions = async (
  providerModelId: AppModelId
): Promise<
  | {
      openai: OpenAIResponsesProviderOptions;
    }
  | {
      anthropic: AnthropicProviderOptions;
    }
  | {
      xai: Record<string, never>;
    }
  | {
      google: GoogleGenerativeAIProviderOptions;
    }
  | Record<string, never>
> => {
  const model = await getAppModelDefinition(providerModelId);
  const useDirectOpenAI = hasOpenAIKey();
  if (useDirectOpenAI && model.owned_by !== "openai") {
    return {};
  }

  if (model.owned_by === "openai") {
    if (model.reasoning) {
      return {
        openai: {
          reasoningSummary: "auto",
          ...(model.id === "openai/gpt-5" ||
          model.id === "openai/gpt-5-mini" ||
          model.id === "openai/gpt-5-nano"
            ? { reasoningEffort: "low" }
            : {}),
        } satisfies OpenAIResponsesProviderOptions,
      };
    }
    return { openai: {} };
  }
  if (model.owned_by === "anthropic") {
    if (model.reasoning) {
      return {
        anthropic: {
          thinking: {
            type: "enabled",
            budgetTokens: 4096,
          },
        } satisfies AnthropicProviderOptions,
      };
    }
    return { anthropic: {} };
  }
  if (model.owned_by === "xai") {
    return {
      xai: {},
    };
  }
  if (model.owned_by === "google") {
    if (model.reasoning) {
      return {
        google: {
          thinkingConfig: {
            thinkingBudget: 10_000,
          },
        },
      };
    }
    return { google: {} };
  }
  return {};
};
