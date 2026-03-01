function tryParseUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

export function getDomainFromUrl(url: string) {
  return tryParseUrl(url)?.hostname.replace("www.", "") || "unknown";
}
export function getFaviconUrl(result: {
  title: string;
  source: "web" | "academic" | "x";
  url: string;
  content: string;
  tweetId?: string | undefined;
}) {
  const domain = tryParseUrl(result.url)?.hostname;
  if (!domain) {
    return "https://www.google.com/s2/favicons?sz=128";
  }
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
}
