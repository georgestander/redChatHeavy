import { env as workersEnv } from "cloudflare:workers";
import { layout, prefix, render, route } from "rwsdk/router";
import { defineApp } from "rwsdk/worker";

import { handleChatStreamRequest } from "@/app/(chat)/api/chat/[id]/stream/route";
import { POST as handleChatRoute } from "@/app/(chat)/api/chat/route";
import { handleChatModelRequest } from "@/app/api/chat-model/route";
import { handleDevLoginRequest } from "@/app/api/dev-login/route";
import { handleMcpOAuthCallbackRequest } from "@/app/api/mcp/oauth/callback/route";
import { Document } from "@/app/document";
import ChatRoutePage from "@/app/pages/chat";
import DocsPage from "@/app/pages/docs";
import HomePage from "@/app/pages/home";
import { ChatLayout } from "@/app/pages/layouts/chat-layout";
import { SettingsLayout } from "@/app/pages/layouts/settings-layout";
import LoginPage from "@/app/pages/login";
import PrivacyPage from "@/app/pages/privacy";
import ProjectRoutePage from "@/app/pages/project";
import ProjectChatRoutePage from "@/app/pages/project-chat";
import RegisterPage from "@/app/pages/register";
import SettingsIndexPage from "@/app/pages/settings";
import { SettingsConnectorDetailsPage } from "@/app/pages/settings/connector-details";
import SettingsConnectorsPage from "@/app/pages/settings/connectors";
import SettingsModelsPage from "@/app/pages/settings/models";
import { SharePage } from "@/app/pages/share";
import TermsPage from "@/app/pages/terms";
import { StreamBufferDO as StreamBufferDOClass } from "@/durable-objects/stream-buffer-do";
import { auth } from "@/lib/auth";
import {
  deleteFilesByUrls,
  extractFilenameFromUrl,
  listFiles,
  uploadFile,
} from "@/lib/blob";
import { config } from "@/lib/config";
import { canAccessAttachmentUrl, getAllAttachmentUrls } from "@/lib/db/queries";
import type { AppRequestInfo } from "@/lib/request-info";
import { getBaseUrl } from "@/lib/url";

const STATIC_ASSET_REGEX =
  /\.(?:svg|png|jpg|jpeg|gif|webp|ico|json|webmanifest|css|js|map|woff2?|ttf|eot|otf)$/i;

function isStaticAsset(pathname: string): boolean {
  return STATIC_ASSET_REGEX.test(pathname);
}

function isPublicApiRoute(pathname: string): boolean {
  return (
    pathname.startsWith("/api/auth") ||
    pathname === "/api/chat" ||
    pathname.startsWith("/api/chat/") ||
    pathname === "/api/chat-model" ||
    pathname === "/api/mcp/oauth/callback" ||
    pathname === "/api/dev-login" ||
    pathname.startsWith("/api/files/") ||
    pathname === "/api/cron/cleanup"
  );
}

function isMetadataRoute(pathname: string): boolean {
  return (
    pathname === "/sitemap.xml" ||
    pathname === "/robots.txt" ||
    pathname === "/manifest.webmanifest"
  );
}

function isPublicPage(pathname: string): boolean {
  if (pathname === "/") {
    return true;
  }

  return (
    pathname.startsWith("/models") ||
    pathname.startsWith("/compare") ||
    pathname.startsWith("/share/") ||
    pathname.startsWith("/privacy") ||
    pathname.startsWith("/terms") ||
    pathname.startsWith("/docs")
  );
}

function isAuthPage(pathname: string): boolean {
  return pathname.startsWith("/login") || pathname.startsWith("/register");
}

function redirectTo(pathname: string, request: Request): Response {
  return Response.redirect(new URL(pathname, request.url), 302);
}

function methodNotAllowed(): Response {
  return new Response("Method Not Allowed", { status: 405 });
}

type R2HttpMetadata = {
  cacheControl?: string;
  contentDisposition?: string;
  contentEncoding?: string;
  contentLanguage?: string;
  contentType?: string;
};

type R2Range = {
  length?: number;
  offset?: number;
  suffix?: number;
};

type R2ObjectMetadataLike = {
  etag: string;
  httpEtag?: string;
  httpMetadata?: R2HttpMetadata;
  size: number;
  uploaded: Date;
};

type R2ObjectBodyLike = R2ObjectMetadataLike & {
  body: ReadableStream<Uint8Array> | null;
};

type R2BucketLike = {
  get(
    key: string,
    options?: { range?: R2Range }
  ): Promise<R2ObjectBodyLike | null>;
  head(key: string): Promise<R2ObjectMetadataLike | null>;
};

const FILE_API_PREFIX = "/api/files/";
const FILE_KEY_PREFIX = `${config.appPrefix}/files/`;
const BYTE_RANGE_REGEX = /^bytes=(\d*)-(\d*)$/;
const TRAILING_SLASH_REGEX = /\/$/;
const CLEANUP_CRON_EXPRESSION = "0 * * * *";
const ORPHANED_ATTACHMENTS_RETENTION_MS = 4 * 60 * 60 * 1000;
const EXTERNAL_DOCS_BASE_URL = "https://chatjs.mintlify.dev/docs";

function getR2Bucket(): R2BucketLike | null {
  const bindings = workersEnv as unknown as {
    R2_ATTACHMENTS?: R2BucketLike;
  };
  return bindings.R2_ATTACHMENTS ?? null;
}

function getFileKeyFromApiPath(pathname: string): string | null {
  if (!pathname.startsWith(FILE_API_PREFIX)) {
    return null;
  }

  const encodedKey = pathname.slice(FILE_API_PREFIX.length).split("?")[0];
  if (!encodedKey) {
    return null;
  }

  try {
    return decodeURIComponent(encodedKey);
  } catch {
    return null;
  }
}

type ParsedRange = {
  end: number;
  length: number;
  start: number;
};

function parseByteRange(
  rangeHeader: string | null,
  size: number
): ParsedRange | "invalid" | null {
  if (!rangeHeader) {
    return null;
  }

  const match = BYTE_RANGE_REGEX.exec(rangeHeader.trim());
  if (!match) {
    return "invalid";
  }

  const [, startRaw, endRaw] = match;
  if (!(startRaw || endRaw)) {
    return "invalid";
  }

  if (!startRaw && endRaw) {
    const suffixLength = Number.parseInt(endRaw, 10);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
      return "invalid";
    }
    const length = Math.min(suffixLength, size);
    return {
      end: size - 1,
      length,
      start: size - length,
    };
  }

  const start = Number.parseInt(startRaw, 10);
  if (!Number.isFinite(start) || start < 0 || start >= size) {
    return "invalid";
  }

  const end =
    endRaw.length > 0 ? Number.parseInt(endRaw, 10) : Math.max(size - 1, start);
  if (!Number.isFinite(end) || end < start) {
    return "invalid";
  }

  const boundedEnd = Math.min(end, size - 1);
  return {
    end: boundedEnd,
    length: boundedEnd - start + 1,
    start,
  };
}

function jsonError(status: number, error: string): Response {
  return Response.json({ error }, { status });
}

function isFileKey(value: string | null): value is string {
  return Boolean(value?.startsWith(FILE_KEY_PREFIX));
}

function buildFileResponseHeaders({
  metadata,
  parsedRange,
}: {
  metadata: R2ObjectMetadataLike;
  parsedRange: ParsedRange | null;
}): Headers {
  const headers = new Headers();
  headers.set("Accept-Ranges", "bytes");
  headers.set("ETag", metadata.httpEtag ?? metadata.etag);
  headers.set("Last-Modified", metadata.uploaded.toUTCString());
  headers.set("Content-Length", String(parsedRange?.length ?? metadata.size));
  // Attachment responses can include private chat content, so do not expose
  // long-lived public caching headers from object metadata.
  headers.set("Cache-Control", "private, no-store");
  headers.set("Vary", "Authorization, Cookie");
  if (metadata.httpMetadata?.contentDisposition) {
    headers.set(
      "Content-Disposition",
      metadata.httpMetadata.contentDisposition
    );
  }
  if (metadata.httpMetadata?.contentEncoding) {
    headers.set("Content-Encoding", metadata.httpMetadata.contentEncoding);
  }
  if (metadata.httpMetadata?.contentLanguage) {
    headers.set("Content-Language", metadata.httpMetadata.contentLanguage);
  }
  if (metadata.httpMetadata?.contentType) {
    headers.set("Content-Type", metadata.httpMetadata.contentType);
  }
  if (parsedRange) {
    headers.set(
      "Content-Range",
      `bytes ${parsedRange.start}-${parsedRange.end}/${metadata.size}`
    );
  }
  return headers;
}

async function fetchFileBody({
  bucket,
  key,
  parsedRange,
}: {
  bucket: R2BucketLike;
  key: string;
  parsedRange: ParsedRange | null;
}): Promise<R2ObjectBodyLike | null> {
  if (!parsedRange) {
    return await bucket.get(key);
  }

  return await bucket.get(key, {
    range: {
      length: parsedRange.length,
      offset: parsedRange.start,
    },
  });
}

async function handleFileUploadRoute({
  request,
  userId,
}: {
  request: Request;
  userId: string | null;
}): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  if (!config.integrations.attachments) {
    return jsonError(503, "File uploads are not available");
  }

  if (!userId) {
    return jsonError(401, "Unauthorized");
  }

  if (!request.body) {
    return new Response("Request body is empty", { status: 400 });
  }

  const formData = await request.formData();
  const value = formData.get("file");
  if (!(value instanceof Blob)) {
    return jsonError(400, "No file uploaded");
  }

  const file = value as Blob & { name?: string };
  const allowedTypes = new Set(Object.keys(config.attachments.acceptedTypes));
  if (file.size > config.attachments.maxBytes) {
    return jsonError(400, "File size should be less than 5MB");
  }
  if (!(file.type && allowedTypes.has(file.type))) {
    return jsonError(400, "Unsupported file type");
  }

  const filename =
    typeof file.name === "string" && file.name.length > 0 ? file.name : "file";

  try {
    const result = await uploadFile(filename, file.stream(), {
      contentType: file.type,
    });
    const cleanFilename = extractFilenameFromUrl(result.pathname);

    return Response.json({
      ...result,
      pathname: cleanFilename || filename,
    });
  } catch {
    return jsonError(500, "Upload failed");
  }
}

async function getSessionUserId(request: Request): Promise<string | null> {
  const session = await auth.api.getSession({ headers: request.headers });
  return session?.user?.id ?? null;
}

async function handleFileDownloadRoute({
  request,
  userId,
}: {
  request: Request;
  userId: string | null;
}): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const key = getFileKeyFromApiPath(new URL(request.url).pathname);
  if (!isFileKey(key)) {
    return new Response("Not Found", { status: 404 });
  }

  const attachmentUrl = `${FILE_API_PREFIX}${encodeURIComponent(key)}`;
  const canAccess = await canAccessAttachmentUrl({
    attachmentUrl,
    userId,
  });
  if (!canAccess) {
    return new Response("Forbidden", { status: 403 });
  }

  const bucket = getR2Bucket();
  if (!bucket) {
    return new Response("File storage unavailable", { status: 503 });
  }

  const metadata = await bucket.head(key);
  if (!metadata) {
    return new Response("Not Found", { status: 404 });
  }

  const parsedRange = parseByteRange(
    request.headers.get("range"),
    metadata.size
  );
  if (parsedRange === "invalid") {
    return new Response(null, {
      headers: {
        "Content-Range": `bytes */${metadata.size}`,
      },
      status: 416,
    });
  }

  const headers = buildFileResponseHeaders({ metadata, parsedRange });

  if (request.method === "HEAD") {
    return new Response(null, {
      headers,
      status: parsedRange ? 206 : 200,
    });
  }

  const bodyResponse = await fetchFileBody({
    bucket,
    key,
    parsedRange,
  });
  if (!bodyResponse?.body) {
    return new Response("Not Found", { status: 404 });
  }

  return new Response(bodyResponse.body, {
    headers,
    status: parsedRange ? 206 : 200,
  });
}

function getCronSecret(): string | null {
  const bindings = workersEnv as unknown as {
    CRON_SECRET?: string;
  };
  return bindings.CRON_SECRET?.trim() || null;
}

function hasValidCleanupAuth(request: Request): boolean {
  const secret = getCronSecret();
  if (!secret) {
    return false;
  }

  return request.headers.get("authorization") === `Bearer ${secret}`;
}

type CleanupResult = {
  orphanedAttachments: {
    deletedCount: number;
    deletedUrls: string[];
    skipped?: boolean;
  };
};

async function cleanupOrphanedAttachments() {
  const { attachments, imageGeneration } = config.integrations;
  if (!(attachments || imageGeneration)) {
    return { deletedCount: 0, deletedUrls: [], skipped: true };
  }

  const cutoffDate = new Date(Date.now() - ORPHANED_ATTACHMENTS_RETENTION_MS);
  const usedAttachmentUrls = new Set(await getAllAttachmentUrls());
  const { blobs } = await listFiles();
  const orphanedUrls: string[] = [];

  for (const blob of blobs) {
    const uploadedAt = new Date(blob.uploadedAt);
    const isOld = uploadedAt < cutoffDate;
    const isUnused = !usedAttachmentUrls.has(blob.url);

    if (isOld && isUnused) {
      orphanedUrls.push(blob.url);
    }
  }

  if (orphanedUrls.length > 0) {
    await deleteFilesByUrls(orphanedUrls);
    console.log(
      `[TRACE] cleanup deleted ${orphanedUrls.length} orphaned files`
    );
  }

  return {
    deletedCount: orphanedUrls.length,
    deletedUrls: orphanedUrls,
  };
}

async function runCleanupTasks(): Promise<CleanupResult> {
  return {
    orphanedAttachments: await cleanupOrphanedAttachments(),
  };
}

async function handleCleanupRoute(request: Request): Promise<Response> {
  if (request.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  if (!hasValidCleanupAuth(request)) {
    return jsonError(401, "Unauthorized");
  }

  try {
    const results = await runCleanupTasks();
    return Response.json({
      results,
      success: true,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Cleanup cron job failed", error);
    return Response.json(
      {
        details: error instanceof Error ? error.message : "Unknown error",
        error: "Cleanup failed",
      },
      { status: 500 }
    );
  }
}

function sitemapResponse(request: Request): Response {
  const baseUrl = getBaseUrl(request);
  const now = new Date().toISOString();
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    "  <url>",
    `    <loc>${baseUrl}/</loc>`,
    `    <lastmod>${now}</lastmod>`,
    "    <changefreq>weekly</changefreq>",
    "    <priority>1.0</priority>",
    "  </url>",
    "</urlset>",
  ].join("\n");

  return new Response(body, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
    },
  });
}

function robotsResponse(request: Request): Response {
  const baseUrl = getBaseUrl(request);
  const body = [
    "User-agent: *",
    "Allow: /",
    `Sitemap: ${baseUrl}/sitemap.xml`,
  ].join("\n");

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
    },
  });
}

function manifestResponse(): Response {
  const body = JSON.stringify(
    {
      name: config.appName,
      short_name: config.appName,
      description: config.appDescription,
      start_url: "/",
      display: "standalone",
      background_color: "#fff",
      theme_color: "#fff",
      icons: [
        {
          src: "/icon.svg",
          sizes: "any",
          type: "image/svg+xml",
        },
      ],
    },
    null,
    2
  );

  return new Response(body, {
    headers: {
      "content-type": "application/manifest+json; charset=utf-8",
    },
  });
}

function getExternalDocsUrl(request: Request): string {
  const requestUrl = new URL(request.url);
  const docsUrl = new URL(EXTERNAL_DOCS_BASE_URL);
  const docsPrefix = "/docs";
  const suffixPath = requestUrl.pathname.startsWith(`${docsPrefix}/`)
    ? requestUrl.pathname.slice(docsPrefix.length)
    : "";
  docsUrl.pathname = `${docsUrl.pathname.replace(TRAILING_SLASH_REGEX, "")}${suffixPath}`;
  docsUrl.search = requestUrl.search;
  return docsUrl.toString();
}

function NotFoundPage() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="font-semibold text-3xl">Not Found</h1>
        <p className="mt-2 text-muted-foreground text-sm">
          The page you are looking for does not exist.
        </p>
      </div>
    </main>
  );
}

export default defineApp<AppRequestInfo>([
  async function sessionMiddleware({ request, ctx }) {
    ctx.session = await auth.api.getSession({ headers: request.headers });
  },
  function authGate({ request, ctx }) {
    const { pathname } = new URL(request.url);

    if (isStaticAsset(pathname)) {
      return;
    }

    if (isMetadataRoute(pathname)) {
      return;
    }

    const isLoggedIn = !!ctx.session?.user;

    if (pathname.startsWith("/api/")) {
      if (isPublicApiRoute(pathname)) {
        return;
      }

      if (!isLoggedIn) {
        return jsonError(401, "Unauthorized");
      }

      return;
    }

    if (isLoggedIn && isAuthPage(pathname)) {
      return redirectTo("/", request);
    }

    if (isAuthPage(pathname) || isPublicPage(pathname)) {
      return;
    }

    if (!isLoggedIn) {
      return redirectTo("/login", request);
    }
  },
  route("/api/auth/*", ({ request }) => auth.handler(request)),
  prefix("/api", [
    route("/chat", ({ request }) =>
      request.method === "POST" ? handleChatRoute(request) : methodNotAllowed()
    ),
    route("/chat/:id/stream", ({ params, request }) =>
      request.method === "GET"
        ? handleChatStreamRequest({ request, chatId: params.id })
        : methodNotAllowed()
    ),
    route("/files/upload", async ({ request }) =>
      handleFileUploadRoute({
        request,
        userId: await getSessionUserId(request),
      })
    ),
    route("/files/*", async ({ request }) =>
      handleFileDownloadRoute({
        request,
        userId: await getSessionUserId(request),
      })
    ),
    route("/chat-model", ({ request }) =>
      request.method === "POST"
        ? handleChatModelRequest(request)
        : methodNotAllowed()
    ),
    route("/mcp/oauth/callback", ({ request }) =>
      request.method === "GET"
        ? handleMcpOAuthCallbackRequest(request)
        : methodNotAllowed()
    ),
    route("/cron/cleanup", ({ request }) => handleCleanupRoute(request)),
    route("/dev-login", ({ request }) =>
      request.method === "GET" ? handleDevLoginRequest() : methodNotAllowed()
    ),
  ]),
  route("/sitemap.xml", ({ request }) => sitemapResponse(request)),
  route("/robots.txt", ({ request }) => robotsResponse(request)),
  route("/manifest.webmanifest", () => manifestResponse()),
  render<AppRequestInfo>(Document, [
    ...layout(ChatLayout, [
      route("/", HomePage),
      route("/chat/:id", ChatRoutePage),
      route("/share/:id", ({ params }) => <SharePage id={params.id} />),
      route("/project/:projectId", ({ params }) => (
        <ProjectRoutePage projectId={params.projectId} />
      )),
      route("/project/:projectId/chat/:chatId", ({ params }) => (
        <ProjectChatRoutePage projectId={params.projectId} />
      )),
    ]),
    ...layout(SettingsLayout, [
      route("/settings", SettingsIndexPage),
      route("/settings/models", SettingsModelsPage),
      route("/settings/connectors", SettingsConnectorsPage),
      route("/settings/connectors/:connectorId", ({ params }) => (
        <SettingsConnectorDetailsPage connectorId={params.connectorId} />
      )),
    ]),
    route("/login", LoginPage),
    route("/register", RegisterPage),
    route("/privacy", PrivacyPage),
    route("/terms", TermsPage),
    route("/docs", DocsPage),
    route("/docs/*", ({ request }) =>
      Response.redirect(getExternalDocsUrl(request), 302)
    ),
    route("/*", NotFoundPage),
  ]),
]);

export const scheduled = async (controller: { cron: string }) => {
  if (controller.cron !== CLEANUP_CRON_EXPRESSION) {
    return;
  }

  try {
    const results = await runCleanupTasks();
    console.log("[TRACE] scheduled cleanup complete", {
      cron: controller.cron,
      deletedCount: results.orphanedAttachments.deletedCount,
      skipped: Boolean(results.orphanedAttachments.skipped),
    });
  } catch (error) {
    console.error("[TRACE] scheduled cleanup failed", error);
    throw error;
  }
};

export const StreamBufferDO = StreamBufferDOClass;
