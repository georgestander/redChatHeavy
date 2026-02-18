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

async function fetchModelsRaw(): Promise<AiGatewayModel[]> {
  const apiKey =
    process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;

  if (!apiKey) {
    log.warn("No AI gateway API key found, using fallback models");
    return fallbackModels as unknown as AiGatewayModel[];
  }

  const url = "https://ai-gateway.vercel.sh/v1/models";
  log.debug({ url }, "Fetching models from AI gateway");

  try {
    const response = await fetch(url, {
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
