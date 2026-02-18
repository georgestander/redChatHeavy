import { BLOB_FILE_PREFIX } from "./constants";

type R2HttpMetadata = {
  cacheControl?: string;
  contentDisposition?: string;
  contentEncoding?: string;
  contentLanguage?: string;
  contentType?: string;
  cacheExpiry?: Date;
};

type R2ObjectLike = {
  key: string;
  size: number;
  uploaded: Date;
  httpMetadata?: R2HttpMetadata;
};

type R2ListResultLike = {
  objects: R2ObjectLike[];
  truncated: boolean;
  cursor?: string;
};

type R2BucketLike = {
  put(
    key: string,
    value: ArrayBuffer | ArrayBufferView | Blob | ReadableStream | string,
    options?: {
      httpMetadata?: R2HttpMetadata;
    }
  ): Promise<void>;
  list(options?: {
    cursor?: string;
    limit?: number;
    prefix?: string;
  }): Promise<R2ListResultLike>;
  delete(keys: string[] | string): Promise<void>;
};

type PutBlobOptions = {
  cacheControl?: string;
  contentType?: string;
};

type BlobListItem = {
  contentType?: string;
  pathname: string;
  size: number;
  uploadedAt: string;
  url: string;
};

export type ListBlobResult = {
  blobs: BlobListItem[];
  cursor?: string;
  hasMore: boolean;
};

export type PutBlobResult = {
  contentDisposition?: string;
  contentType?: string;
  downloadUrl: string;
  pathname: string;
  url: string;
};

let r2BucketPromise: Promise<R2BucketLike | null> | null = null;

const DEFAULT_CACHE_CONTROL = "public, max-age=31536000, immutable";
const FILE_ROUTE_PREFIX = "/api/files/";

function normalizeFilename(filename: string): string {
  const trimmed = filename.trim().replaceAll("\\", "/");
  const basename = trimmed.split("/").at(-1)?.trim() ?? "";
  const safe = basename.replace(/[^a-zA-Z0-9._-]/g, "-");
  return safe.length > 0 ? safe : "file";
}

function buildObjectKey(filename: string): string {
  const cleanName = normalizeFilename(filename);
  const extensionIndex = cleanName.lastIndexOf(".");
  const hasExtension = extensionIndex > 0;
  const baseName = hasExtension
    ? cleanName.slice(0, extensionIndex)
    : cleanName;
  const extension = hasExtension ? cleanName.slice(extensionIndex) : "";
  const suffix = crypto.randomUUID().replaceAll("-", "");

  return `${BLOB_FILE_PREFIX}${baseName}-${suffix}${extension}`;
}

function inferContentType(
  filename: string,
  provided?: string
): string | undefined {
  if (provided?.trim()) {
    return provided;
  }

  const lowerFilename = filename.toLowerCase();
  if (lowerFilename.endsWith(".jpg") || lowerFilename.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (lowerFilename.endsWith(".png")) {
    return "image/png";
  }
  if (lowerFilename.endsWith(".gif")) {
    return "image/gif";
  }
  if (lowerFilename.endsWith(".webp")) {
    return "image/webp";
  }
  if (lowerFilename.endsWith(".pdf")) {
    return "application/pdf";
  }
  if (lowerFilename.endsWith(".svg")) {
    return "image/svg+xml";
  }

  return;
}

function buildFileUrl(objectKey: string): string {
  return `${FILE_ROUTE_PREFIX}${encodeURIComponent(objectKey)}`;
}

function keyFromFileRoutePath(pathname: string): string | null {
  if (!pathname.startsWith(FILE_ROUTE_PREFIX)) {
    return null;
  }

  const encodedKey = pathname.slice(FILE_ROUTE_PREFIX.length).split("?")[0];
  if (!encodedKey) {
    return null;
  }

  try {
    return decodeURIComponent(encodedKey);
  } catch {
    return null;
  }
}

function keyFromAnyUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith(FILE_ROUTE_PREFIX)) {
    return keyFromFileRoutePath(trimmed);
  }

  try {
    const parsed = new URL(trimmed);
    const keyFromPath = keyFromFileRoutePath(parsed.pathname);
    if (keyFromPath) {
      return keyFromPath;
    }

    const path = parsed.pathname;
    const prefixIndex = path.indexOf(BLOB_FILE_PREFIX);
    if (prefixIndex >= 0) {
      return decodeURIComponent(path.slice(prefixIndex));
    }

    return null;
  } catch {
    const prefixIndex = trimmed.indexOf(BLOB_FILE_PREFIX);
    if (prefixIndex >= 0) {
      return trimmed.slice(prefixIndex);
    }
    return null;
  }
}

function getR2BucketBinding(): Promise<R2BucketLike | null> {
  if (r2BucketPromise) {
    return r2BucketPromise;
  }

  r2BucketPromise = (async () => {
    const globalBindings = globalThis as typeof globalThis & {
      R2_ATTACHMENTS?: R2BucketLike;
    };
    if (globalBindings.R2_ATTACHMENTS) {
      return globalBindings.R2_ATTACHMENTS;
    }

    try {
      const moduleName = "cloudflare:workers";
      const workersModule = (await import(moduleName)) as {
        env?: {
          R2_ATTACHMENTS?: R2BucketLike;
        };
      };

      return workersModule.env?.R2_ATTACHMENTS ?? null;
    } catch {
      return null;
    }
  })();

  return r2BucketPromise;
}

async function requireR2BucketBinding(): Promise<R2BucketLike> {
  const bucket = await getR2BucketBinding();
  if (!bucket) {
    throw new Error("R2_ATTACHMENTS binding is not configured");
  }
  return bucket;
}

/**
 * Upload a file to R2 with consistent prefixing and URL shape.
 */
export async function uploadFile(
  filename: string,
  buffer: ArrayBuffer | ArrayBufferView | Blob | ReadableStream | string,
  options: PutBlobOptions = {}
): Promise<PutBlobResult> {
  try {
    const bucket = await requireR2BucketBinding();
    const objectKey = buildObjectKey(filename);
    const normalizedFilename = normalizeFilename(filename);
    const contentType = inferContentType(
      normalizedFilename,
      options.contentType
    );
    const contentDisposition = `inline; filename="${normalizedFilename}"`;

    await bucket.put(objectKey, buffer, {
      httpMetadata: {
        cacheControl: options.cacheControl ?? DEFAULT_CACHE_CONTROL,
        contentDisposition,
        contentType,
      },
    });

    const url = buildFileUrl(objectKey);
    return {
      contentDisposition,
      contentType,
      downloadUrl: url,
      pathname: objectKey,
      url,
    };
  } catch (error) {
    throw new Error(
      `Failed to upload file ${filename}: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * List all files in R2 with the expected list shape.
 */
export async function listFiles(): Promise<ListBlobResult> {
  try {
    const bucket = await getR2BucketBinding();
    if (!bucket) {
      return { blobs: [], hasMore: false };
    }

    const blobs: BlobListItem[] = [];
    let cursor: string | undefined;

    while (true) {
      const result = await bucket.list({
        cursor,
        prefix: BLOB_FILE_PREFIX,
      });

      for (const object of result.objects) {
        blobs.push({
          contentType: object.httpMetadata?.contentType,
          pathname: object.key,
          size: object.size,
          uploadedAt: object.uploaded.toISOString(),
          url: buildFileUrl(object.key),
        });
      }

      if (!result.truncated) {
        return {
          blobs,
          hasMore: false,
        };
      }

      cursor = result.cursor;
      if (!cursor) {
        return {
          blobs,
          hasMore: true,
        };
      }
    }
  } catch (error) {
    throw new Error(
      `Failed to list files: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Delete multiple files by their API or legacy blob URLs.
 */
export async function deleteFilesByUrls(urls: string[]): Promise<void> {
  try {
    if (urls.length === 0) {
      return;
    }

    const bucket = await getR2BucketBinding();
    if (!bucket) {
      return;
    }

    const keys = urls
      .map((url) => keyFromAnyUrl(url))
      .filter((key): key is string => Boolean(key));

    if (keys.length === 0) {
      return;
    }

    await bucket.delete(keys);
  } catch (error) {
    throw new Error(
      `Failed to delete ${urls.length} files: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Extract a display filename from either API file URLs or object keys.
 */
export function extractFilenameFromUrl(url: string): string | null {
  try {
    const objectKey = keyFromAnyUrl(url) ?? url;
    const withoutPrefix = objectKey.startsWith(BLOB_FILE_PREFIX)
      ? objectKey.substring(BLOB_FILE_PREFIX.length)
      : objectKey;
    const decoded = decodeURIComponent(withoutPrefix);
    const filename = decoded.split("/").at(-1) ?? "";
    return filename.split("?")[0] || null;
  } catch {
    return null;
  }
}
