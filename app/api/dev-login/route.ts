import { serializeCookie, serializeSignedCookie } from "better-call";
import { eq } from "drizzle-orm";
import { DEV_LOCAL_USER_COOKIE_NAME, isDevLocalAuthRuntime } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { session, user } from "@/lib/db/schema";
import { env } from "@/lib/env";

function resolveNextPath(request?: Request): string {
  if (!request) {
    return "/";
  }

  const next = new URL(request.url).searchParams.get("next");
  if (!next) {
    return "/";
  }

  if (!next.startsWith("/") || next.startsWith("//")) {
    return "/";
  }

  return next;
}

function decodeCookieValueForDev(cookie: string): string {
  const firstSeparatorIndex = cookie.indexOf(";");
  const pair =
    firstSeparatorIndex === -1 ? cookie : cookie.slice(0, firstSeparatorIndex);
  const attributes =
    firstSeparatorIndex === -1 ? "" : cookie.slice(firstSeparatorIndex);
  const equalsIndex = pair.indexOf("=");
  if (equalsIndex === -1) {
    return cookie;
  }

  const key = pair.slice(0, equalsIndex);
  const value = pair.slice(equalsIndex + 1);

  try {
    return `${key}=${decodeURIComponent(value)}${attributes}`;
  } catch {
    return cookie;
  }
}

export async function handleDevLoginRequest(request?: Request) {
  if (process.env.NODE_ENV !== "development") {
    return new Response("Not found", { status: 404 });
  }

  try {
    const devEmail = "dev@localhost";
    let [devUser] = await db.select().from(user).where(eq(user.email, devEmail));

    if (!devUser) {
      const id = crypto.randomUUID();
      [devUser] = await db
        .insert(user)
        .values({
          id,
          email: devEmail,
          name: "Dev User",
          emailVerified: true,
        })
        .returning();
    }

    const token = crypto.randomUUID();
    const now = new Date();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await db.insert(session).values({
      id: crypto.randomUUID(),
      userId: devUser.id,
      token,
      expiresAt,
      createdAt: now,
      updatedAt: now,
    });

    const signedSessionCookie = await serializeSignedCookie(
      "better-auth.session_token",
      token,
      env.AUTH_SECRET,
      {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        expires: expiresAt,
      }
    );
    const runtimeCompatibleSessionCookie =
      decodeCookieValueForDev(signedSessionCookie);
    const devUserCookie = serializeCookie(
      DEV_LOCAL_USER_COOKIE_NAME,
      devUser.id,
      {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        expires: expiresAt,
      }
    );

    const headers = new Headers({ Location: resolveNextPath(request) });
    headers.append("Set-Cookie", runtimeCompatibleSessionCookie);
    headers.append("Set-Cookie", devUserCookie);

    return new Response(null, {
      status: 302,
      headers,
    });
  } catch (error) {
    if (isDevLocalAuthRuntime()) {
      return Response.json(
        {
          error:
            "Local database is unavailable. Start Postgres and retry /api/dev-login.",
        },
        { status: 503 }
      );
    }

    throw error;
  }
}

export async function GET(request: Request) {
  return await handleDevLoginRequest(request);
}
