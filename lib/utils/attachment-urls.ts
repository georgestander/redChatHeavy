import { getBaseUrl } from "@/lib/url";

const BLOB_STORAGE_HOST = "blob.vercel-storage.com";

function isBlobStorageHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === BLOB_STORAGE_HOST ||
    normalized.endsWith(`.${BLOB_STORAGE_HOST}`)
  );
}

function getBaseOrigin(baseUrl?: string): string | null {
  try {
    return new URL(baseUrl ?? getBaseUrl()).origin;
  } catch {
    return null;
  }
}

export function isManagedAttachmentUrl(
  value: string,
  baseUrl?: string
): boolean {
  if (!value) {
    return false;
  }

  if (value.startsWith("/api/files/")) {
    return true;
  }

  try {
    const baseOrigin = getBaseOrigin(baseUrl);
    const url = new URL(value, baseOrigin ?? undefined);
    const hostname = url.hostname.toLowerCase();
    if (isBlobStorageHost(hostname)) {
      return true;
    }

    if (baseOrigin && url.origin === baseOrigin) {
      return url.pathname.startsWith("/api/files/");
    }
  } catch {
    return false;
  }

  return false;
}

export function toManagedAttachmentUrl(
  value: unknown,
  baseUrl?: string
): URL | null {
  if (value instanceof URL) {
    if (value.protocol !== "http:" && value.protocol !== "https:") {
      return null;
    }
    return isManagedAttachmentUrl(value.toString(), baseUrl) ? value : null;
  }

  if (typeof value === "string") {
    const baseOrigin = getBaseOrigin(baseUrl);
    try {
      const url = new URL(value, baseOrigin ?? undefined);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        return null;
      }
      return isManagedAttachmentUrl(url.toString(), baseUrl) ? url : null;
    } catch {
      return null;
    }
  }

  return null;
}
