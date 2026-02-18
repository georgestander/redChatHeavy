import { ANONYMOUS_SESSION_COOKIES_KEY } from "@/lib/constants";
import { ANONYMOUS_LIMITS, type AnonymousSession } from "@/lib/types/anonymous";

const COOKIE_SEPARATOR = ";";

function getCookieValue(
  cookieHeader: string | null,
  name: string
): string | null {
  if (!cookieHeader) {
    return null;
  }

  for (const part of cookieHeader.split(COOKIE_SEPARATOR)) {
    const trimmed = part.trim();
    if (!trimmed.startsWith(`${name}=`)) {
      continue;
    }

    const rawValue = trimmed.slice(name.length + 1);
    try {
      return decodeURIComponent(rawValue);
    } catch {
      return rawValue;
    }
  }

  return null;
}

export function getAnonymousSessionFromRequest(
  request: Request
): AnonymousSession | null {
  try {
    const cookieValue = getCookieValue(
      request.headers.get("cookie"),
      ANONYMOUS_SESSION_COOKIES_KEY
    );
    if (!cookieValue) {
      return null;
    }

    const session = JSON.parse(cookieValue) as AnonymousSession;
    if (typeof session.createdAt === "string") {
      session.createdAt = new Date(session.createdAt);
    }

    const isExpired =
      Date.now() - session.createdAt.getTime() >
      ANONYMOUS_LIMITS.SESSION_DURATION;

    return isExpired ? null : session;
  } catch (error) {
    console.error("Error parsing anonymous session cookie:", error);
    return null;
  }
}

export function serializeAnonymousSessionCookie(
  session: AnonymousSession
): string {
  const value = encodeURIComponent(JSON.stringify(session));
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${ANONYMOUS_SESSION_COOKIES_KEY}=${value}; Path=/; Max-Age=${ANONYMOUS_LIMITS.SESSION_DURATION}; SameSite=Lax${secure}`;
}
