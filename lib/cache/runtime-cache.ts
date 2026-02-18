type CacheOptions = {
  revalidate?: number | false;
  tags?: string[];
};

type CacheEntry<T> = {
  value?: T;
  expiresAt: number;
  tags: string[];
  inflight?: Promise<T>;
};

type RuntimeCacheState = {
  entries: Map<string, CacheEntry<unknown>>;
  keysByTag: Map<string, Set<string>>;
};

const RUNTIME_CACHE_KEY = "__chatjs_runtime_cache__";

const globalCache = globalThis as typeof globalThis & {
  [RUNTIME_CACHE_KEY]?: RuntimeCacheState;
};

const existingRuntimeCache = globalCache[RUNTIME_CACHE_KEY];
const runtimeCache: RuntimeCacheState = existingRuntimeCache ?? {
  entries: new Map<string, CacheEntry<unknown>>(),
  keysByTag: new Map<string, Set<string>>(),
};

if (!existingRuntimeCache) {
  globalCache[RUNTIME_CACHE_KEY] = runtimeCache;
}

function getCacheKey(
  keyParts: readonly string[],
  args: readonly unknown[]
): string {
  try {
    return JSON.stringify([keyParts, args]);
  } catch {
    return `${keyParts.join("|")}::${args.map(String).join("|")}`;
  }
}

function getExpiresAt(revalidate?: number | false): number {
  if (revalidate === false || revalidate === undefined) {
    return Number.POSITIVE_INFINITY;
  }

  if (revalidate <= 0) {
    return Date.now();
  }

  return Date.now() + revalidate * 1000;
}

function removeEntry(key: string): void {
  const existing = runtimeCache.entries.get(key);
  if (!existing) {
    return;
  }

  runtimeCache.entries.delete(key);

  for (const tag of existing.tags) {
    const keys = runtimeCache.keysByTag.get(tag);
    if (!keys) {
      continue;
    }

    keys.delete(key);
    if (keys.size === 0) {
      runtimeCache.keysByTag.delete(tag);
    }
  }
}

function registerTags(key: string, tags: readonly string[]): void {
  for (const tag of tags) {
    const keys = runtimeCache.keysByTag.get(tag) ?? new Set<string>();
    keys.add(key);
    runtimeCache.keysByTag.set(tag, keys);
  }
}

export function unstable_cache<Args extends readonly unknown[], Result>(
  callback: (...args: Args) => Promise<Result>,
  keyParts: readonly string[] = [],
  options: CacheOptions = {}
): (...args: Args) => Promise<Result> {
  return (...args: Args): Promise<Result> => {
    const key = getCacheKey(keyParts, args);
    const existing = runtimeCache.entries.get(key) as
      | CacheEntry<Result>
      | undefined;

    if (
      existing &&
      existing.expiresAt > Date.now() &&
      existing.value !== undefined
    ) {
      return Promise.resolve(existing.value);
    }

    if (existing?.inflight) {
      return existing.inflight;
    }

    if (existing) {
      removeEntry(key);
    }

    const nextEntry: CacheEntry<Result> = {
      expiresAt: getExpiresAt(options.revalidate),
      tags: options.tags ? [...options.tags] : [],
    };

    const inflight = callback(...args)
      .then((result) => {
        nextEntry.value = result;
        nextEntry.inflight = undefined;
        nextEntry.expiresAt = getExpiresAt(options.revalidate);
        registerTags(key, nextEntry.tags);
        runtimeCache.entries.set(key, nextEntry as CacheEntry<unknown>);
        return result;
      })
      .catch((error) => {
        removeEntry(key);
        throw error;
      });

    nextEntry.inflight = inflight;
    runtimeCache.entries.set(key, nextEntry as CacheEntry<unknown>);

    return inflight;
  };
}

export const unstableCache = unstable_cache;

export function revalidateTag(tag: string, _profile?: string): void {
  const keys = runtimeCache.keysByTag.get(tag);
  if (!keys) {
    return;
  }

  for (const key of keys) {
    removeEntry(key);
  }

  runtimeCache.keysByTag.delete(tag);
}

export function clearRuntimeCache(): void {
  runtimeCache.entries.clear();
  runtimeCache.keysByTag.clear();
}
