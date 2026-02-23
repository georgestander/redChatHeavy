import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { env } from "@/lib/env";
import { db } from "./db/client";
import { schema } from "./db/schema";

const baseURL =
  env.APP_URL ?? (env.VERCEL_URL ? `https://${env.VERCEL_URL}` : undefined);
export const DEV_LOCAL_USER_COOKIE_NAME = "chatjs.dev_user_id";

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

function isDevLocalSessionFallbackEnabled(): boolean {
  return isLocalTcpPostgresUrl(env.DATABASE_URL);
}

export function isDevLocalAuthRuntime(): boolean {
  return isDevLocalSessionFallbackEnabled();
}

function getCookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) {
    return null;
  }

  const cookie = cookieHeader
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${name}=`));

  if (!cookie) {
    return null;
  }

  const rawValue = cookie.slice(name.length + 1);
  try {
    return decodeURIComponent(rawValue);
  } catch {
    return rawValue;
  }
}

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  ...(baseURL ? { baseURL } : {}),
  trustedOrigins: (request) => {
    const baseOrigins = [
      "http://localhost:5173",
      ...(env.APP_URL ? [env.APP_URL] : []),
    ];

    if (!request) {
      return baseOrigins;
    }

    const requestOrigin = new URL(request.url).origin;
    return Array.from(new Set([...baseOrigins, requestOrigin]));
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
      email: "dev@localhost",
      emailVerified: true,
      image: null,
      createdAt: now,
      updatedAt: now,
    },
  };
}

export function getDevLocalSessionFromHeaders(headers: Headers): Session | null {
  if (!isDevLocalSessionFallbackEnabled()) {
    return null;
  }

  const userId = getCookieValue(headers.get("cookie"), DEV_LOCAL_USER_COOKIE_NAME);
  if (!userId) {
    return null;
  }

  return createDevLocalSession(userId);
}

export async function getServerSession(headers: Headers): Promise<Session | null> {
  const devSession = getDevLocalSessionFromHeaders(headers);
  if (devSession) {
    return devSession;
  }
  try {
    const session = await auth.api.getSession({ headers });
    return session;
  } catch (error) {
    if (isDevLocalSessionFallbackEnabled()) {
      console.warn(
        "[auth] getSession failed in local runtime; treating as signed-out",
        error
      );
      return null;
    }
    throw error;
  }
}
