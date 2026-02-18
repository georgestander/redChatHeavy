import { env } from "@/lib/env";

/**
 * Returns the base URL for the application.
 * Priority: APP_URL > request origin > localhost
 */
export function getBaseUrl(request?: Request): string {
  if (env.APP_URL) {
    return env.APP_URL;
  }
  if (request) {
    return new URL(request.url).origin;
  }
  return "http://localhost:5173";
}
