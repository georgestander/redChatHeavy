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

  // One of the AI Gateway API key or Vercel OIDC token must be configured
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
});

const isCiEnvironment = process.env.CI === "1" || process.env.CI === "true";
const isProductionEnvironment = process.env.NODE_ENV === "production";
const shouldUseLocalFallbacks = !(isCiEnvironment || isProductionEnvironment);

const envWithFallbacks = {
  ...workersEnv,
  DATABASE_URL:
    workersEnv.DATABASE_URL ??
    process.env.DATABASE_URL ??
    (shouldUseLocalFallbacks
      ? "postgresql://postgres:postgres@127.0.0.1:5432/chatjs"
      : undefined),
  AUTH_SECRET:
    workersEnv.AUTH_SECRET ??
    process.env.AUTH_SECRET ??
    (shouldUseLocalFallbacks ? "chatjs-local-dev-auth-secret" : undefined),
};

export const env = envSchema.parse(envWithFallbacks);
