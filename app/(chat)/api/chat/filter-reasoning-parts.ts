/**
 * Filters out reasoning parts from messages before sending to LLM.
 * Prevents cross-model compatibility issues.
 * https://github.com/vercel/ai/discussions/5480
 *
 * We also strip provider-specific metadata from retained parts/messages so
 * provider item references do not leak into follow-up requests (can break
 * OpenAI when reasoning items are omitted from history).
 *
 * Note: data-* parts are handled by convertToModelMessages({ convertDataPart: () => undefined })
 */
type SanitizedPart = Record<string, unknown> & { type: string };
function sanitizePart(part: Record<string, unknown>): SanitizedPart {
  const {
    providerMetadata: _providerMetadata,
    callProviderMetadata: _callProviderMetadata,
    ...rest
  } = part;
  return rest as SanitizedPart;
}

export function filterPartsForLLM<T extends { parts: any[] }>(messages: T[]): T[] {
  return messages.map((message) => ({
    ...((() => {
      const {
        providerMetadata: _providerMetadata,
        providerOptions: _providerOptions,
        ...restMessage
      } = message as Record<string, unknown>;
      return restMessage;
    })() as T),
    // Keep only content-bearing parts and drop provider-specific metadata.
    parts: message.parts
      .filter((part) => part.type !== "reasoning")
      .map((part) => sanitizePart(part as Record<string, unknown>)),
  })) as T[];
}
