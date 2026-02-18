import { copyFile, readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { redwood } from "rwsdk/vite";
import { defineConfig } from "vite";

const useClientDirectiveRegex =
  /^\s*(?:\/\*[\s\S]*?\*\/\s*|\/\/[^\n]*\n\s*)*(?:(?:"[^"]*"|'[^']*')\s*;?\s*\n)*["']use client["']\s*;?/;

function hasUseClientDirective(code: string): boolean {
  return useClientDirectiveRegex.test(code.slice(0, 512));
}

async function collectForceClientPaths(): Promise<string[]> {
  const includeDirs = ["app", "components", "providers", "hooks", "src"];
  const skipDirNames = new Set(["node_modules", ".next", "dist", ".wrangler"]);
  const sourceExtensions = new Set([
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".mjs",
    ".mts",
    ".cjs",
    ".cts",
  ]);

  async function walk(dir: string): Promise<string[]> {
    const absoluteDir = join(process.cwd(), dir);
    const entries = await readdir(absoluteDir, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
      if (skipDirNames.has(entry.name)) {
        continue;
      }

      const relativePath = join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await walk(relativePath)));
        continue;
      }

      const extension = entry.name.slice(entry.name.lastIndexOf("."));
      if (sourceExtensions.has(extension)) {
        files.push(relativePath);
      }
    }

    return files;
  }

  const candidateBatches = await Promise.all(
    includeDirs.map(async (dir) => {
      try {
        return await walk(dir);
      } catch {
        return [] as string[];
      }
    })
  );
  const candidates = candidateBatches.flat();

  const useClientPaths: string[] = [];

  await Promise.all(
    candidates.map(async (filepath) => {
      const content = await readFile(filepath, "utf8");
      if (hasUseClientDirective(content)) {
        useClientPaths.push(filepath);
      }
    })
  );

  return Array.from(new Set(useClientPaths)).sort();
}

export default defineConfig(async () => {
  const forceClientPaths = await collectForceClientPaths();

  return {
    optimizeDeps: {
      exclude: ["antd", "antd/es/mentions"],
    },
    environments: {
      worker: {
        optimizeDeps: {
          exclude: ["antd", "antd/es/mentions"],
        },
      },
      ssr: {
        optimizeDeps: {
          exclude: ["antd", "antd/es/mentions"],
        },
      },
    },
    plugins: [
      cloudflare({
        viteEnvironment: { name: "worker" },
      }),
      redwood({
        entry: {
          worker: "./src/worker.tsx",
        },
        forceClientPaths,
      }),
      {
        name: "rwsdk-ssr-bridge-extension-alias",
        enforce: "pre",
        apply: "build",
        resolveId(source) {
          const bridgePath =
            "/rwsdk/dist/__intermediate_builds/ssr/ssr_bridge.js";
          if (source.includes(bridgePath)) {
            return source.replace("ssr_bridge.js", "ssr_bridge.mjs");
          }
        },
        async closeBundle() {
          if (process.env.RWSDK_BUILD_PASS !== "worker") {
            return;
          }

          const indexMjsPath = resolve(
            process.cwd(),
            "dist",
            "worker",
            "index.mjs"
          );
          const indexJsPath = resolve(
            process.cwd(),
            "dist",
            "worker",
            "index.js"
          );

          try {
            await copyFile(indexMjsPath, indexJsPath);
          } catch {
            // Best-effort compatibility shim for RedwoodSDK linker pass.
          }
        },
      },
      tailwindcss(),
    ],
  };
});
