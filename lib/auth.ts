import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { env } from "@/lib/env";
import { db } from "./db/client";
import { schema, user as userTable } from "./db/schema";

const baseURL =
  env.APP_URL ?? (env.VERCEL_URL ? `https://${env.VERCEL_URL}` : undefined);
export const DEV_LOCAL_USER_COOKIE_NAME = "chatjs.dev_user_id";
export const DEV_LOCAL_EMAIL = "local-dev-user@localhost";
export const DEV_LOCAL_DEFAULT_USER_ID = "local-dev-user";
let ensureDevLocalUserPromise: Promise<void> | null = null;
const DEV_LOCAL_USER_MAX_RETRIES = 3;

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

function isDevLocalSessionFallbackEnabled(): boolean {
  if (process.env.NODE_ENV === "production") {
    return false;
  }

  return (
    process.env.CHATJS_LOCAL_MODE === "1" ||
    (process.env.SKIP_ENV_VALIDATION === "1" &&
      process.env.NODE_ENV !== "production") ||
    isLocalTcpPostgresUrl(env.DATABASE_URL)
  );
}

export function isDevLocalAuthRuntime(): boolean {
  return isDevLocalSessionFallbackEnabled();
}

async function ensureDevLocalUserExists(): Promise<void> {
  if (!isDevLocalSessionFallbackEnabled()) {
    return;
  }

  if (!ensureDevLocalUserPromise) {
    ensureDevLocalUserPromise = (async () => {
      let lastError: unknown;
      for (let attempt = 1; attempt <= DEV_LOCAL_USER_MAX_RETRIES; attempt += 1) {
        try {
          await db
            .insert(userTable)
            .values({
              id: DEV_LOCAL_DEFAULT_USER_ID,
              email: DEV_LOCAL_EMAIL,
              name: "Dev User",
              emailVerified: true,
            })
            .onConflictDoUpdate({
              target: userTable.id,
              set: {
                email: DEV_LOCAL_EMAIL,
                name: "Dev User",
                emailVerified: true,
                updatedAt: new Date(),
              },
            });
          return;
        } catch (error) {
          lastError = error;
          if (attempt < DEV_LOCAL_USER_MAX_RETRIES) {
            await new Promise((resolve) => {
              setTimeout(resolve, 150 * attempt);
            });
          }
        }
      }

      throw (
        lastError ??
        new Error("Failed to ensure local dev user record in database")
      );
    })().catch((error) => {
      ensureDevLocalUserPromise = null;
      console.warn("[auth] failed to ensure local dev user record", error);
      throw error;
    });
  }

  await ensureDevLocalUserPromise;
}

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  ...(baseURL ? { baseURL } : {}),
  trustedOrigins: () => {
    const origins = new Set<string>([
      "http://localhost:5173",
      "http://127.0.0.1:5173",
    ]);

    if (env.APP_URL) {
      origins.add(new URL(env.APP_URL).origin);
    }
    if (env.VERCEL_URL) {
      origins.add(new URL(`https://${env.VERCEL_URL}`).origin);
    }

    return Array.from(origins);
  },
  secret: env.AUTH_SECRET,

  session: {
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // 5 minutes - reduces database queries for session validation
    },
  },

  socialProviders: (() => {
    const googleId = env.AUTH_GOOGLE_ID;
    const googleSecret = env.AUTH_GOOGLE_SECRET;
    const githubId = env.AUTH_GITHUB_ID;
    const githubSecret = env.AUTH_GITHUB_SECRET;
    const vercelId = env.VERCEL_APP_CLIENT_ID;
    const vercelSecret = env.VERCEL_APP_CLIENT_SECRET;

    const google =
      typeof googleId === "string" &&
      googleId.length > 0 &&
      typeof googleSecret === "string" &&
      googleSecret.length > 0
        ? { clientId: googleId, clientSecret: googleSecret }
        : undefined;

    const github =
      typeof githubId === "string" &&
      githubId.length > 0 &&
      typeof githubSecret === "string" &&
      githubSecret.length > 0
        ? { clientId: githubId, clientSecret: githubSecret }
        : undefined;

    const vercel =
      typeof vercelId === "string" &&
      vercelId.length > 0 &&
      typeof vercelSecret === "string" &&
      vercelSecret.length > 0
        ? { clientId: vercelId, clientSecret: vercelSecret }
        : undefined;

    return { google, github, vercel } as const;
  })(),
});

// Infer session type from the auth instance for type safety
export type Session = typeof auth.$Infer.Session;

function createDevLocalSession(userId: string): Session {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  return {
    session: {
      id: `dev-session-${userId}`,
      token: `dev-token-${userId}`,
      userId,
      expiresAt,
      createdAt: now,
      updatedAt: now,
      ipAddress: null,
      userAgent: null,
    },
    user: {
      id: userId,
      name: "Dev User",
      email: DEV_LOCAL_EMAIL,
      emailVerified: true,
      image: null,
      createdAt: now,
      updatedAt: now,
    },
  };
}

export function getDevLocalSessionFromHeaders(_headers: Headers): Session | null {
  if (!isDevLocalSessionFallbackEnabled()) {
    return null;
  }

  return createDevLocalSession(DEV_LOCAL_DEFAULT_USER_ID);
}

export async function getServerSession(headers: Headers): Promise<Session | null> {
  if (isDevLocalSessionFallbackEnabled()) {
    try {
      await ensureDevLocalUserExists();
    } catch (error) {
      console.warn(
        "[auth] continuing with dev local session after user ensure failure",
        error
      );
    }
    return createDevLocalSession(DEV_LOCAL_DEFAULT_USER_ID);
  }

  return await auth.api.getSession({ headers });
}
