const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);
const SCHEME_REGEX = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

type SanitizeUrlOptions = {
  allowDataImages?: boolean;
};

export function sanitizeUrl(
  url: string | null | undefined,
  { allowDataImages = false }: SanitizeUrlOptions = {}
): string | undefined {
  if (!url) {
    return;
  }

  const trimmed = url.trim();
  if (!trimmed) {
    return;
  }

  if (!SCHEME_REGEX.test(trimmed)) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    if (SAFE_PROTOCOLS.has(parsed.protocol)) {
      return trimmed;
    }

    if (allowDataImages && parsed.protocol === "data:") {
      return /^data:image\//i.test(trimmed) ? trimmed : undefined;
    }
  } catch {
    return;
  }

  return;
}
