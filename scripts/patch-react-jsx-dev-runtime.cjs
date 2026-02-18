#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

function findReactCjsFiles() {
  const reactPackageJson = require.resolve("react/package.json");
  const reactDir = path.dirname(reactPackageJson);
  const cjsDir = path.join(reactDir, "cjs");

  if (!fs.existsSync(cjsDir)) {
    return [];
  }

  return fs
    .readdirSync(cjsDir)
    .filter((entry) => entry.endsWith(".development.js"))
    .map((entry) => path.join(cjsDir, entry));
}

function findReactServerDomWebpackFiles() {
  try {
    const packageJsonPath = require.resolve("react-server-dom-webpack/package.json");
    const packageDir = path.dirname(packageJsonPath);
    const cjsDir = path.join(packageDir, "cjs");

    if (!fs.existsSync(cjsDir)) {
      return [];
    }

    return fs
      .readdirSync(cjsDir)
      .filter((entry) => entry.endsWith(".development.js"))
      .map((entry) => path.join(cjsDir, entry));
  } catch {
    return [];
  }
}

function findViteOptimizedSsrFiles() {
  const depsDir = path.join(process.cwd(), "node_modules", ".vite", "deps_ssr");
  if (!fs.existsSync(depsDir)) {
    return [];
  }

  return fs
    .readdirSync(depsDir)
    .filter((entry) => entry.endsWith(".js"))
    .map((entry) => path.join(depsDir, entry));
}

function patchContent(content) {
  let next = content;
  let changed = false;

  const createTaskFallbackPattern =
    /createTask\s*=\s*console\.createTask[\s\S]*?:\s*function\s*\(\)\s*\{\s*return null;\s*\};/gm;
  const createTaskFallbackReplacement = `createTask = function() {
      if ("function" !== typeof console.createTask) return null;
      try {
        return console.createTask.apply(console, arguments);
      } catch (x) {
        return null;
      }
    };`;

  const patchedCreateTaskFallback = next.replace(
    createTaskFallbackPattern,
    createTaskFallbackReplacement
  );
  if (patchedCreateTaskFallback !== next) {
    changed = true;
    next = patchedCreateTaskFallback;
  }

  const patchedSupportsCreateTask = next.replace(
    /supportsCreateTask\s*=\s*!!console\.createTask/gm,
    "supportsCreateTask = false"
  );
  if (patchedSupportsCreateTask !== next) {
    changed = true;
    next = patchedSupportsCreateTask;
  }

  const patchedDirectCreateTaskTernary = next.replace(
    /console\.createTask\s*\?\s*console\.createTask\([\s\S]*?\)\s*:\s*null/gm,
    "null"
  );
  if (patchedDirectCreateTaskTernary !== next) {
    changed = true;
    next = patchedDirectCreateTaskTernary;
  }

  return { changed, content: next };
}

function main() {
  try {
    const targets = [
      ...findReactCjsFiles(),
      ...findReactServerDomWebpackFiles(),
      ...findViteOptimizedSsrFiles(),
    ];

    let changedCount = 0;

    for (const filePath of targets) {
      if (!fs.existsSync(filePath)) {
        continue;
      }

      const original = fs.readFileSync(filePath, "utf8");
      const patched = patchContent(original);
      if (!patched.changed) {
        continue;
      }

      fs.writeFileSync(filePath, patched.content, "utf8");
      changedCount += 1;
      console.log(`patched createTask usage: ${filePath}`);
    }

    if (changedCount === 0) {
      console.log("react-jsx-dev-runtime patch not needed");
    }
  } catch (error) {
    console.warn(
      "warning: unable to patch react jsx dev runtime; continuing without patch"
    );
    if (error instanceof Error) {
      console.warn(error.message);
    }
  }
}

main();
