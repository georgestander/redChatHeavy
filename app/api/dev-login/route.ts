import { serializeSignedCookie } from "better-call";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { session, user } from "@/lib/db/schema";
import { env } from "@/lib/env";

export async function handleDevLoginRequest() {
  if (process.env.NODE_ENV !== "development") {
    return new Response("Not found", { status: 404 });
  }

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

  const headers = new Headers({ Location: "/" });
  headers.append("Set-Cookie", signedSessionCookie);

  return new Response(null, {
    status: 302,
    headers,
  });
}

export async function GET() {
  return await handleDevLoginRequest();
}
