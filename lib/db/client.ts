import { drizzle as drizzleNeonHttp } from "drizzle-orm/neon-http";
import { env } from "@/lib/env";
import { createNeonHttpCompatClient } from "./neon-compat";
import * as schema from "./schema";

// Optionally, if not using email/pass login, you can
// use the Drizzle adapter for Auth.js / NextAuth
// https://authjs.dev/reference/adapter/drizzle
function isLocalTcpPostgresUrl(databaseUrl: string): boolean {
  try {
    const parsed = new URL(databaseUrl);
    const isPostgresProtocol =
      parsed.protocol === "postgres:" || parsed.protocol === "postgresql:";
    const isLocalHost =
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname === "localhost" ||
      parsed.hostname === "::1" ||
      parsed.hostname.endsWith(".hyperdrive.local") ||
      parsed.hostname === "hyperdrive.local";
    return isPostgresProtocol && isLocalHost;
  } catch {
    return false;
  }
}

const isForcedLocalDbRuntime =
  process.env.CHATJS_LOCAL_MODE === "1" ||
  (process.env.SKIP_ENV_VALIDATION === "1" &&
    process.env.NODE_ENV !== "production");
export const isLocalDbRuntime =
  isForcedLocalDbRuntime || isLocalTcpPostgresUrl(env.DATABASE_URL);

function describeDatabaseUrl(databaseUrl: string): string {
  try {
    const parsed = new URL(databaseUrl);
    return `${parsed.protocol}//${parsed.hostname}:${parsed.port || "(default)"}`;
  } catch {
    return "<invalid>";
  }
}

function createNeonDbClient() {
  const sql = createNeonHttpCompatClient(env.DATABASE_URL);
  return drizzleNeonHttp(sql, { schema });
}

type DbClient = ReturnType<typeof createNeonDbClient>;
const LOCAL_DB_MAX_RETRIES = 2;
const LOCAL_DB_QUERY_TIMEOUT_MS = 12_000;
const LOCAL_DB_STATEMENT_TIMEOUT_MS = 30_000;
const LOCAL_DB_CONNECTION_TIMEOUT_MS = 5_000;

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

function shouldRetryLocalConnection(error: unknown): boolean {
  const message = toError(error).message.toLowerCase();
  return (
    message.includes("timeout exceeded when trying to connect") ||
    message.includes("query read timeout") ||
    message.includes("timed out after") ||
    message.includes("cannot use a pool after calling end on the pool") ||
    message.includes("econnrefused") ||
    message.includes("econnreset") ||
    message.includes("connection terminated") ||
    message.includes("socket")
  );
}

async function withLocalTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string
): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

async function createLocalNodePgDbClient(): Promise<DbClient> {
  const globalState = globalThis as {
    __chatjsLocalDbClient?: DbClient;
  };
  if (globalState.__chatjsLocalDbClient) {
    return globalState.__chatjsLocalDbClient;
  }

  const { Client } = (await import("pg")) as {
    Client: new (config: {
      connectionString: string;
      connectionTimeoutMillis?: number;
      keepAlive?: boolean;
      application_name?: string;
      statement_timeout?: number;
    }) => {
      connect: () => Promise<void>;
      query: (...args: unknown[]) => Promise<unknown>;
      end: () => Promise<void>;
    };
  };
  const { drizzle } = (await import("drizzle-orm/node-postgres")) as {
    drizzle: (
      client: unknown,
      config?: { schema: typeof schema }
    ) => unknown;
  };

  const createClient = () =>
    new Client({
      connectionString: env.DATABASE_URL,
      connectionTimeoutMillis: LOCAL_DB_CONNECTION_TIMEOUT_MS,
      statement_timeout: LOCAL_DB_STATEMENT_TIMEOUT_MS,
      keepAlive: true,
      application_name: "chatjs-local-worker",
    });

  const resilientClient = {
    query: async (...args: unknown[]) => {
      let lastError: unknown;
      for (let attempt = 1; attempt <= LOCAL_DB_MAX_RETRIES; attempt += 1) {
        const client = createClient();
        try {
          await withLocalTimeout(
            client.connect(),
            LOCAL_DB_CONNECTION_TIMEOUT_MS,
            "local postgres connect"
          );
          return await withLocalTimeout(
            client.query(...args),
            LOCAL_DB_QUERY_TIMEOUT_MS,
            "local postgres query"
          );
        } catch (error) {
          lastError = error;
          if (
            attempt >= LOCAL_DB_MAX_RETRIES ||
            !shouldRetryLocalConnection(error)
          ) {
            throw error;
          }
          console.warn(
            "[db:local-pg] retrying query after transient error (attempt "
              + `${attempt + 1}/${LOCAL_DB_MAX_RETRIES})`,
            toError(error).message
          );
          await new Promise((resolve) => setTimeout(resolve, attempt * 100));
        } finally {
          await client.end().catch(() => undefined);
        }
      }

      throw toError(lastError);
    },
    connect: async () => {
      let lastError: unknown;
      for (let attempt = 1; attempt <= LOCAL_DB_MAX_RETRIES; attempt += 1) {
        const client = createClient();
        try {
          await withLocalTimeout(
            client.connect(),
            LOCAL_DB_CONNECTION_TIMEOUT_MS,
            "local postgres connect"
          );

          return {
            query: async (...args: unknown[]) =>
              await withLocalTimeout(
                client.query(...args),
                LOCAL_DB_QUERY_TIMEOUT_MS,
                "local postgres query"
              ),
            release: () => {
              void client.end().catch(() => undefined);
            },
          };
        } catch (error) {
          lastError = error;
          await client.end().catch(() => undefined);
          if (
            attempt >= LOCAL_DB_MAX_RETRIES ||
            !shouldRetryLocalConnection(error)
          ) {
            throw error;
          }
          console.warn(
            "[db:local-pg] retrying connect after transient error (attempt "
              + `${attempt + 1}/${LOCAL_DB_MAX_RETRIES})`,
            toError(error).message
          );
          await new Promise((resolve) => setTimeout(resolve, attempt * 100));
        }
      }

      throw toError(lastError);
    },
    end: async () => undefined,
    on: () => undefined,
  };

  try {
    const warmClient = createClient();
    await withLocalTimeout(
      warmClient.connect(),
      LOCAL_DB_CONNECTION_TIMEOUT_MS,
      "local postgres warm connect"
    );
    await withLocalTimeout(
      warmClient.query("select 1"),
      LOCAL_DB_QUERY_TIMEOUT_MS,
      "local postgres warm query"
    );
    await warmClient.end().catch(() => undefined);
    if (process.env.NODE_ENV === "development") {
      console.log("[db:init] local-pg warm connection ready");
    }
  } catch (error) {
    console.error("[db:init] local-pg warm connection failed", error);
  }

  const dbClient = drizzle(resilientClient, { schema }) as DbClient;
  globalState.__chatjsLocalDbClient = dbClient;
  return dbClient;
}

async function createDbClient(): Promise<DbClient> {
  if (process.env.NODE_ENV === "development") {
    console.log(
      `[db:init] runtime=${isLocalDbRuntime ? "local-pg" : "neon-http"} url=${describeDatabaseUrl(env.DATABASE_URL)}`
    );
  }
  if (isLocalDbRuntime) {
    return await createLocalNodePgDbClient();
  }

  return createNeonDbClient();
}

export const db: DbClient = await createDbClient();
