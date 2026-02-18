import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { env } from "@/lib/env";
import { db } from "./db/client";
import { schema } from "./db/schema";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
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
