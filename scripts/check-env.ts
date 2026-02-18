#!/usr/bin/env tsx
/**
 * Build-time config validation script.
 * Validates that enabled features in config have their required env vars.
 * Run via `pnpm run check-env` or automatically in prebuild.
 */
import "dotenv/config";
import { config } from "../lib/config";

type ValidationError = { feature: string; missing: string[] };

function getMissingEnvVars(vars: [string, string | undefined][]): string[] {
  return vars.filter(([, value]) => !value).map(([name]) => name);
}

function validateSandbox(env: NodeJS.ProcessEnv): ValidationError | null {
  if (!config.integrations.sandbox) {
    return null;
  }
  const hasOidc = !!env.VERCEL_OIDC_TOKEN;
  const hasTokenAuth =
    env.VERCEL_TEAM_ID && env.VERCEL_PROJECT_ID && env.VERCEL_TOKEN;
  if (hasOidc || hasTokenAuth) {
    return null;
  }
  return {
    feature: "integrations.sandbox",
    missing: [
      "VERCEL_OIDC_TOKEN (auto on Vercel) or VERCEL_TEAM_ID + VERCEL_PROJECT_ID + VERCEL_TOKEN",
    ],
  };
}

function validateIntegrations(env: NodeJS.ProcessEnv): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!(env.AI_GATEWAY_API_KEY || env.VERCEL_OIDC_TOKEN)) {
    errors.push({
      feature: "aiGateway",
      missing: ["AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN"],
    });
  }

  if (
    config.integrations.webSearch &&
    !(env.TAVILY_API_KEY || env.FIRECRAWL_API_KEY)
  ) {
    errors.push({
      feature: "integrations.webSearch",
      missing: ["TAVILY_API_KEY or FIRECRAWL_API_KEY"],
    });
  }

  if (config.integrations.urlRetrieval && !env.FIRECRAWL_API_KEY) {
    errors.push({
      feature: "integrations.urlRetrieval",
      missing: ["FIRECRAWL_API_KEY"],
    });
  }

  if (config.integrations.mcp && !env.MCP_ENCRYPTION_KEY) {
    errors.push({
      feature: "integrations.mcp",
      missing: ["MCP_ENCRYPTION_KEY"],
    });
  }

  const sandboxError = validateSandbox(env);
  if (sandboxError) {
    errors.push(sandboxError);
  }

  if (config.integrations.imageGeneration && !env.BLOB_READ_WRITE_TOKEN) {
    errors.push({
      feature: "integrations.imageGeneration",
      missing: ["BLOB_READ_WRITE_TOKEN"],
    });
  }

  if (config.integrations.attachments && !env.BLOB_READ_WRITE_TOKEN) {
    errors.push({
      feature: "integrations.attachments",
      missing: ["BLOB_READ_WRITE_TOKEN"],
    });
  }

  return errors;
}

function validateAuthentication(env: NodeJS.ProcessEnv): ValidationError[] {
  const errors: ValidationError[] = [];

  if (
    config.authentication.google &&
    !(env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET)
  ) {
    const missing = getMissingEnvVars([
      ["AUTH_GOOGLE_ID", env.AUTH_GOOGLE_ID],
      ["AUTH_GOOGLE_SECRET", env.AUTH_GOOGLE_SECRET],
    ]);
    errors.push({ feature: "authentication.google", missing });
  }

  if (
    config.authentication.github &&
    !(env.AUTH_GITHUB_ID && env.AUTH_GITHUB_SECRET)
  ) {
    const missing = getMissingEnvVars([
      ["AUTH_GITHUB_ID", env.AUTH_GITHUB_ID],
      ["AUTH_GITHUB_SECRET", env.AUTH_GITHUB_SECRET],
    ]);
    errors.push({ feature: "authentication.github", missing });
  }

  if (
    config.authentication.vercel &&
    !(env.VERCEL_APP_CLIENT_ID && env.VERCEL_APP_CLIENT_SECRET)
  ) {
    const missing = getMissingEnvVars([
      ["VERCEL_APP_CLIENT_ID", env.VERCEL_APP_CLIENT_ID],
      ["VERCEL_APP_CLIENT_SECRET", env.VERCEL_APP_CLIENT_SECRET],
    ]);
    errors.push({ feature: "authentication.vercel", missing });
  }

  const hasAuth =
    (config.authentication.google &&
      env.AUTH_GOOGLE_ID &&
      env.AUTH_GOOGLE_SECRET) ||
    (config.authentication.github &&
      env.AUTH_GITHUB_ID &&
      env.AUTH_GITHUB_SECRET) ||
    (config.authentication.vercel &&
      env.VERCEL_APP_CLIENT_ID &&
      env.VERCEL_APP_CLIENT_SECRET);

  if (!hasAuth) {
    errors.push({
      feature: "authentication",
      missing: ["At least one auth provider must be enabled and configured"],
    });
  }

  return errors;
}

function validateBaseUrl(env: NodeJS.ProcessEnv): ValidationError | null {
  const isProduction = env.NODE_ENV === "production" || env.VERCEL === "1";
  if (!isProduction) {
    return null;
  }

  const hasBaseUrl = !!(env.APP_URL || env.VERCEL_URL);
  if (hasBaseUrl) {
    return null;
  }

  return {
    feature: "baseUrl",
    missing: [
      "APP_URL (for non-Vercel deployments) or VERCEL_URL (auto on Vercel)",
    ],
  };
}

function isCiEnvironment(env: NodeJS.ProcessEnv): boolean {
  return env.CI === "1" || env.CI === "true";
}

function isProductionEnvironment(env: NodeJS.ProcessEnv): boolean {
  return (
    env.NODE_ENV === "production" ||
    env.VERCEL === "1" ||
    env.VERCEL_ENV === "production"
  );
}

function shouldSkipValidation(env: NodeJS.ProcessEnv): boolean {
  if (env.SKIP_ENV_VALIDATION !== "1") {
    return false;
  }

  if (isCiEnvironment(env) || isProductionEnvironment(env)) {
    console.warn(
      "⚠️ Ignoring SKIP_ENV_VALIDATION=1 because env validation cannot be bypassed in CI/production."
    );
    return false;
  }

  console.warn(
    "⚠️ SKIP_ENV_VALIDATION=1 set. Skipping env validation for local verification."
  );
  return true;
}

function checkEnv(): void {
  const env = process.env;
  if (shouldSkipValidation(env)) {
    return;
  }

  const baseUrlError = validateBaseUrl(env);
  const errors = [
    ...(baseUrlError ? [baseUrlError] : []),
    ...validateIntegrations(env),
    ...validateAuthentication(env),
  ];

  if (errors.length > 0) {
    const message = errors
      .map((e) => `  - ${e.feature}: ${e.missing.join(", ")}`)
      .join("\n");

    console.error(
      `❌ Environment validation failed:\n${message}\n\nEither set the env vars or disable the feature in chat.config.ts`
    );
    process.exit(1);
  }

  console.log("✅ Environment validation passed");
}

checkEnv();
