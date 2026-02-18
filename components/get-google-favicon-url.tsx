// @ts-expect-error - psl types not properly exported
import psl from "psl";

/**
 * Gets a favicon URL via Google's favicon service for any URL/hostname
 */

export function getGoogleFaviconUrl(urlOrHostname: string, size = 128): string {
  try {
    const hostname = urlOrHostname.includes("://")
      ? new URL(urlOrHostname).hostname
      : urlOrHostname;
    const parsed = psl.parse(hostname);
    const domain = parsed.error ? hostname : (parsed.domain ?? hostname);
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=${size}`;
  } catch {
    return "";
  }
}
