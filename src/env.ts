import { env as workersEnv } from "cloudflare:workers";
import { z } from "zod";

const envSchema = z.object({
  // Required core
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(1),

  // Optional blob storage (enable in chat.config.ts)
  BLOB_READ_WRITE_TOKEN: z.string().optional(),

  // Authentication providers (enable in chat.config.ts)
  AUTH_GOOGLE_ID: z.string().optional(),
  AUTH_GOOGLE_SECRET: z.string().optional(),
  AUTH_GITHUB_ID: z.string().optional(),
  AUTH_GITHUB_SECRET: z.string().optional(),
  VERCEL_APP_CLIENT_ID: z.string().optional(),
  VERCEL_APP_CLIENT_SECRET: z.string().optional(),

  // Model provider credentials (set OPENAI_API_KEY for direct OpenAI,
  // or AI_GATEWAY_API_KEY / VERCEL_OIDC_TOKEN for Vercel AI Gateway)
  AI_GATEWAY_API_KEY: z.string().optional(),
  VERCEL_OIDC_TOKEN: z.string().optional(),

  // Optional cleanup cron job secret
  CRON_SECRET: z.string().optional(),

  // Optional features (enable in chat.config.ts)
  REDIS_URL: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  TAVILY_API_KEY: z.string().optional(),
  EXA_API_KEY: z.string().optional(),
  FIRECRAWL_API_KEY: z.string().optional(),
  MCP_ENCRYPTION_KEY: z
    .union([z.string().length(44), z.literal("")])
    .optional(),

  // Sandbox (for non-Vercel deployments)
  VERCEL_TEAM_ID: z.string().optional(),
  VERCEL_PROJECT_ID: z.string().optional(),
  VERCEL_TOKEN: z.string().optional(),
  VERCEL_SANDBOX_RUNTIME: z.string().optional(),

  // App URL (for non-Vercel deployments) - full URL including https://
  APP_URL: z.string().url().optional(),

  // Vercel platform (auto-set by Vercel)
  VERCEL_URL: z.string().optional(),

  // Local mode controls
  CHATJS_LOCAL_MODE: z.string().optional(),
  SKIP_ENV_VALIDATION: z.string().optional(),
  CHATJS_LOCAL_USE_HYPERDRIVE: z.string().optional(),
});

const isCiEnvironment = process.env.CI === "1" || process.env.CI === "true";
const isProductionEnvironment = process.env.NODE_ENV === "production";
const shouldUseLocalFallbacks = !(isCiEnvironment || isProductionEnvironment);
const workerProcessEnv = workersEnv as unknown as Record<string, unknown>;
const processLocalMode =
  process.env.CHATJS_LOCAL_MODE === "1" ||
  (process.env.SKIP_ENV_VALIDATION === "1" && !isProductionEnvironment);
const workerLocalMode =
  workerProcessEnv.CHATJS_LOCAL_MODE === "1" ||
  (workerProcessEnv.SKIP_ENV_VALIDATION === "1" && !isProductionEnvironment);
const isLocalMode =
  processLocalMode ||
  workerLocalMode ||
  (Boolean(
    (workersEnv as unknown as { HYPERDRIVE?: { connectionString?: string } })
      .HYPERDRIVE?.connectionString
  ) &&
    !isProductionEnvironment);
const hyperdriveConnectionString = (
  workersEnv as unknown as {
    HYPERDRIVE?: { connectionString?: string };
  }
).HYPERDRIVE?.connectionString;

const runtimeEnv = isLocalMode
  ? { ...workersEnv, ...process.env }
  : { ...process.env, ...workersEnv };
const defaultHyperdriveSetting =
  isLocalMode && runtimeEnv.DATABASE_URL ? "0" : "1";
const localUseHyperdriveSetting = String(
  runtimeEnv.CHATJS_LOCAL_USE_HYPERDRIVE ?? defaultHyperdriveSetting
).trim();
const shouldPreferHyperdrive =
  Boolean(hyperdriveConnectionString) &&
  localUseHyperdriveSetting !== "0" &&
  !isProductionEnvironment &&
  !isCiEnvironment;

const envWithFallbacks = {
  ...runtimeEnv,
  DATABASE_URL:
    (shouldPreferHyperdrive ? hyperdriveConnectionString : undefined) ??
    runtimeEnv.DATABASE_URL ??
    (shouldUseLocalFallbacks
      ? "postgresql://postgres:postgres@127.0.0.1:5432/chatjs"
      : undefined),
  AUTH_SECRET:
    runtimeEnv.AUTH_SECRET ??
    (shouldUseLocalFallbacks ? "chatjs-local-dev-auth-secret" : undefined),
};

if (process.env.NODE_ENV === "development") {
  const describe = (value: unknown) => {
    if (typeof value !== "string" || value.length === 0) {
      return "<unset>";
    }
    try {
      const parsed = new URL(value);
      return `${parsed.protocol}//${parsed.hostname}:${parsed.port || "(default)"}`;
    } catch {
      return "<invalid>";
    }
  };

  console.log("[env:init]", {
    isLocalMode,
    runtimeDatabaseUrl: describe(runtimeEnv.DATABASE_URL),
    hyperdriveConnectionString: describe(hyperdriveConnectionString),
    finalDatabaseUrl: describe(envWithFallbacks.DATABASE_URL),
  });
}

export const env = envSchema.parse(envWithFallbacks);
