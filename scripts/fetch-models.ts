import { writeFileSync } from "node:fs";

async function fetchAndSaveModels() {
  const apiKey =
    process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;

  if (!apiKey) {
    throw new Error("No AI gateway API key found");
  }

  const response = await fetch("https://ai-gateway.vercel.sh/v1/models", {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch models: ${response.statusText}`);
  }

  const body = await response.json();
  if (!(body.data && Array.isArray(body.data))) {
    throw new Error("Invalid response structure: expected data array");
  }
  const models = body.data;

  const fileContent = `import type { AiGatewayModel } from "@/lib/ai/ai-gateway-models-schemas";

export const models = ${JSON.stringify(models, null, 2)} as const satisfies readonly AiGatewayModel[];
`;

  writeFileSync("lib/ai/models.generated.ts", fileContent);
  console.log(`Wrote ${models.length} models to lib/ai/models.generated.ts`);
}

fetchAndSaveModels();
