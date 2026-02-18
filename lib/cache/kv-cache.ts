import { config } from "@/lib/config";
import { createModuleLogger } from "@/lib/logger";
import {
  revalidateTag as runtimeRevalidateTag,
  unstable_cache as runtimeUnstableCache,
} from "./runtime-cache";

type CacheOptions = {
  revalidate?: number | false;
  tags?: string[];
};

type KvNamespaceLike = {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    options?: {
      expirationTtl?: number;
    }
  ): Promise<void>;
  delete(key: string): Promise<void>;
};

type CacheEnvelope<Result> = {
  value: Result;
};

const log = createModuleLogger("kv-cache");
const TAG_KEY_TTL_BUFFER_SECONDS = 60;

let kvCacheBindingPromise: Promise<KvNamespaceLike | null> | null = null;

function loadKvCacheBinding(): Promise<KvNamespaceLike | null> {
  if (kvCacheBindingPromise) {
    return kvCacheBindingPromise;
  }

  kvCacheBindingPromise = (async () => {
    const globalBindings = globalThis as typeof globalThis & {
      KV_CACHE?: KvNamespaceLike;
    };

    if (globalBindings.KV_CACHE) {
      return globalBindings.KV_CACHE;
    }

    try {
      const moduleName = "cloudflare:workers";
      const workersModule = (await import(moduleName)) as {
        env?: { KV_CACHE?: KvNamespaceLike };
      };
      return workersModule.env?.KV_CACHE ?? null;
    } catch {
      return null;
    }
  })();

  return kvCacheBindingPromise;
}

function getCacheKey(
  keyParts: readonly string[],
  args: readonly unknown[]
): string {
  let keySuffix: string;
  try {
    keySuffix = JSON.stringify([keyParts, args]);
  } catch {
    keySuffix = `${keyParts.join("|")}::${args.map(String).join("|")}`;
  }

  return `${config.appPrefix}:kv-cache:${keySuffix}`;
}

function getTagKey(tag: string): string {
  return `${config.appPrefix}:kv-cache:tag:${tag}`;
}

async function addCacheKeyToTag({
  kv,
  tag,
  cacheKey,
  ttlSeconds,
}: {
  kv: KvNamespaceLike;
  tag: string;
  cacheKey: string;
  ttlSeconds: number;
}): Promise<void> {
  const tagKey = getTagKey(tag);
  const existingRaw = await kv.get(tagKey);
  const existingKeys = existingRaw ? JSON.parse(existingRaw) : [];

  if (!Array.isArray(existingKeys)) {
    await kv.put(tagKey, JSON.stringify([cacheKey]), {
      expirationTtl: ttlSeconds + TAG_KEY_TTL_BUFFER_SECONDS,
    });
    return;
  }

  if (existingKeys.includes(cacheKey)) {
    return;
  }

  existingKeys.push(cacheKey);
  await kv.put(tagKey, JSON.stringify(existingKeys), {
    expirationTtl: ttlSeconds + TAG_KEY_TTL_BUFFER_SECONDS,
  });
}

async function invalidateTagFromKv({
  kv,
  tag,
}: {
  kv: KvNamespaceLike;
  tag: string;
}): Promise<void> {
  const tagKey = getTagKey(tag);
  const existingRaw = await kv.get(tagKey);
  if (!existingRaw) {
    return;
  }

  const keys = JSON.parse(existingRaw);
  if (Array.isArray(keys)) {
    for (const key of keys) {
      if (typeof key !== "string") {
        continue;
      }

      await kv.delete(key);
    }
  }

  await kv.delete(tagKey);
}

export function unstable_cache<Args extends readonly unknown[], Result>(
  callback: (...args: Args) => Promise<Result>,
  keyParts: readonly string[] = [],
  options: CacheOptions = {}
): (...args: Args) => Promise<Result> {
  const runtimeFallback = runtimeUnstableCache(callback, keyParts, options);
  const ttlSeconds =
    typeof options.revalidate === "number" && options.revalidate > 0
      ? options.revalidate
      : null;
  const inflight = new Map<string, Promise<Result>>();

  return async (...args: Args): Promise<Result> => {
    const kv = await loadKvCacheBinding();
    if (!(kv && ttlSeconds)) {
      return runtimeFallback(...args);
    }

    const cacheKey = getCacheKey(keyParts, args);
    const existingInflight = inflight.get(cacheKey);
    if (existingInflight) {
      return existingInflight;
    }

    const nextPromise = (async () => {
      try {
        const cachedValueRaw = await kv.get(cacheKey);
        if (cachedValueRaw) {
          const cachedValue = JSON.parse(
            cachedValueRaw
          ) as CacheEnvelope<Result>;
          return cachedValue.value;
        }
      } catch (error) {
        log.warn(
          { error, cacheKey },
          "KV cache read failed, continuing with callback"
        );
      }

      const value = await callback(...args);

      try {
        await kv.put(
          cacheKey,
          JSON.stringify({ value } satisfies CacheEnvelope<Result>),
          {
            expirationTtl: ttlSeconds,
          }
        );

        const tags = options.tags ?? [];
        for (const tag of tags) {
          await addCacheKeyToTag({
            kv,
            tag,
            cacheKey,
            ttlSeconds,
          });
        }
      } catch (error) {
        log.warn({ error, cacheKey }, "KV cache write failed");
      }

      return value;
    })();

    inflight.set(cacheKey, nextPromise);

    try {
      return await nextPromise;
    } finally {
      inflight.delete(cacheKey);
    }
  };
}

export const unstableCache = unstable_cache;

export function revalidateTag(tag: string, profile?: string): void {
  loadKvCacheBinding()
    .then((kv) => {
      if (!kv) {
        return;
      }

      return invalidateTagFromKv({ kv, tag }).catch((error) => {
        log.warn({ error, tag }, "KV tag invalidation failed");
      });
    })
    .catch((error) => {
      log.warn({ error, tag }, "KV binding resolution failed");
    });

  runtimeRevalidateTag(tag, profile);
}
