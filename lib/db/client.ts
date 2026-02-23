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
      parsed.hostname === "::1";
    return isPostgresProtocol && isLocalHost;
  } catch {
    return false;
  }
}

export const isLocalDbRuntime = isLocalTcpPostgresUrl(env.DATABASE_URL);

function createNeonDbClient() {
  const sql = createNeonHttpCompatClient(env.DATABASE_URL);
  return drizzleNeonHttp(sql, { schema });
}

type DbClient = ReturnType<typeof createNeonDbClient>;

async function createLocalNodePgDbClient(): Promise<DbClient> {
  const { Pool } = (await import("pg")) as {
    Pool: new (config: {
      connectionString: string;
      connectionTimeoutMillis?: number;
      idleTimeoutMillis?: number;
      keepAlive?: boolean;
      max?: number;
      query_timeout?: number;
      statement_timeout?: number;
    }) => {
      on: (event: "error", listener: (error: unknown) => void) => void;
      connect: () => Promise<{
        query: (...args: unknown[]) => Promise<unknown>;
        release: (destroy?: boolean) => void;
      }>;
      query: (...args: unknown[]) => Promise<unknown>;
    };
  };
  const { drizzle } = (await import("drizzle-orm/node-postgres")) as {
    drizzle: (
      client: unknown,
      config?: { schema: typeof schema }
    ) => unknown;
  };

  // Workers + local TCP Postgres is sensitive to connection churn.
  // Keep one persistent socket and fail fast instead of hanging forever.
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    keepAlive: true,
    statement_timeout: 15_000,
    query_timeout: 12_000,
  });
  pool.on("error", (error) => {
    console.error("[db:local-pg] pool error", error);
  });

  const shouldRetryLocalQuery = (error: unknown): boolean => {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : "";
    return (
      message.includes("Query read timeout") ||
      message.includes("Connection terminated unexpectedly") ||
      message.includes("Client has encountered a connection error")
    );
  };

  const queryWithRetry = async (...args: unknown[]): Promise<unknown> => {
    const maxAttempts = 3;
    let attempt = 0;

    while (true) {
      const client = await pool.connect();
      let released = false;
      try {
        return await client.query(...args);
      } catch (error) {
        client.release(true);
        released = true;

        if (shouldRetryLocalQuery(error) && attempt < maxAttempts - 1) {
          attempt += 1;
          console.warn(
            `[db:local-pg] retrying query after transient error (attempt ${attempt + 1}/${maxAttempts})`,
            error
          );
          await new Promise((resolve) => setTimeout(resolve, attempt * 75));
          continue;
        }

        throw error;
      } finally {
        if (!released) {
          client.release();
        }
      }
    }
  };

  pool.query = queryWithRetry;
  return drizzle(pool, { schema }) as DbClient;
}

async function createDbClient(): Promise<DbClient> {
  if (isLocalDbRuntime) {
    return await createLocalNodePgDbClient();
  }

  return createNeonDbClient();
}

export const db: DbClient = await createDbClient();
