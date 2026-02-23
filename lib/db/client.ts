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
    }) => {
      on: (event: "error", listener: (error: unknown) => void) => void;
    };
  };
  const { drizzle } = (await import("drizzle-orm/node-postgres")) as {
    drizzle: (
      client: unknown,
      config?: { schema: typeof schema }
    ) => unknown;
  };

  // Keep conservative local defaults and avoid client-side query read timeouts.
  // Query timeouts in this runtime can fire under transient local load and
  // incorrectly surface as auth/session failures.
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    keepAlive: true,
  });
  pool.on("error", (error) => {
    console.error("[db:local-pg] pool error", error);
  });
  return drizzle(pool, { schema }) as DbClient;
}

async function createDbClient(): Promise<DbClient> {
  if (isLocalDbRuntime) {
    return await createLocalNodePgDbClient();
  }

  return createNeonDbClient();
}

export const db: DbClient = await createDbClient();
