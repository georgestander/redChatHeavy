"use client";

import type { BundledLanguage } from "shiki";
import type { ComponentProps } from "react";
import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock, CodeBlockCopyButton } from "@/components/ai-elements/code-block";
import {
  createBranchTextHighlightsRehypePlugin,
  type BranchTextHighlight,
} from "@/lib/branching/text-highlights";
import { cn } from "@/lib/utils";

type StreamdownLiteProps = Omit<ComponentProps<typeof ReactMarkdown>, "children"> & {
  children?: string;
  className?: string;
  isAnimating?: boolean;
  mode?: "static" | "streaming";
  textHighlights?: BranchTextHighlight[];
};

function normalizeCollapsedPipeTables(markdown: string): string {
  if (!markdown.includes("|") || !markdown.includes("---")) {
    return markdown;
  }

  // Avoid transforming fenced code blocks.
  const segments = markdown.split(/(```[\s\S]*?```)/g);

  return segments
    .map((segment) => {
      if (segment.startsWith("```")) {
        return segment;
      }

      return segment.replace(/\|\s+\|/g, "|\n|");
    })
    .join("");
}

export function StreamdownLite({
  children,
  className,
  components,
  mode = "static",
  remarkPlugins,
  rehypePlugins,
  textHighlights,
  ...props
}: StreamdownLiteProps) {
  const markdownComponents = useMemo(() => {
    const defaultComponents: NonNullable<ComponentProps<typeof ReactMarkdown>["components"]> =
      {
        code({
          className: codeClassName,
          children: codeChildren,
          ...codeProps
        }) {
          const codeText = String(codeChildren ?? "").replace(/\n$/, "");
          const isBlock =
            (codeClassName?.includes("language-") ?? false) ||
            codeText.includes("\n");

          if (!isBlock) {
            return (
              <code
                className={cn(
                  "rounded bg-muted/50 px-1 py-0.5 font-mono text-[0.9em]",
                  codeClassName
                )}
                {...codeProps}
              >
                {codeChildren}
              </code>
            );
          }

          if (mode === "streaming") {
            return (
              <pre className="not-prose my-4 overflow-x-auto rounded-md border border-border bg-muted/40 p-4 text-sm text-foreground">
                <code className={cn("font-mono text-sm", codeClassName)} {...codeProps}>
                  {codeText}
                </code>
              </pre>
            );
          }

          const languageMatch = /language-([a-zA-Z0-9_-]+)/.exec(
            codeClassName ?? ""
          );
          const normalizedLanguage = (languageMatch?.[1] ?? "plaintext")
            .toLowerCase()
            .replace(/_/g, "-");

          const languageAliases: Record<string, BundledLanguage> = {
            js: "javascript",
            jsx: "jsx",
            ts: "typescript",
            tsx: "tsx",
            py: "python",
            rb: "ruby",
            sh: "bash",
            shell: "bash",
            zsh: "bash",
            yml: "yaml",
            md: "markdown",
          };

          const resolvedLanguage: BundledLanguage =
            languageAliases[normalizedLanguage] ??
            (normalizedLanguage as BundledLanguage);

          return (
            <div className="not-prose my-4 w-full">
              <CodeBlock code={codeText} language={resolvedLanguage}>
                <CodeBlockCopyButton
                  aria-label="Copy code"
                  className="h-7 w-7 rounded-md border border-border/70 bg-background/80 text-muted-foreground hover:bg-background hover:text-foreground"
                />
              </CodeBlock>
            </div>
          );
        },
      };

    return {
      ...defaultComponents,
      ...components,
    };
  }, [components, mode]);

  const mergedRemarkPlugins = useMemo(
    () => [remarkGfm, ...(remarkPlugins ?? [])],
    [remarkPlugins]
  );

  const mergedRehypePlugins = useMemo(() => {
    const plugins = [...(rehypePlugins ?? [])];

    if (textHighlights && textHighlights.length > 0) {
      plugins.push(createBranchTextHighlightsRehypePlugin(textHighlights));
    }

    return plugins;
  }, [rehypePlugins, textHighlights]);

  const normalizedChildren = useMemo(
    () => normalizeCollapsedPipeTables(children ?? ""),
    [children]
  );

  return (
    <div className={cn(className)}>
      <ReactMarkdown
        components={markdownComponents}
        rehypePlugins={mergedRehypePlugins}
        remarkPlugins={mergedRemarkPlugins}
        {...props}
      >
        {normalizedChildren}
      </ReactMarkdown>
    </div>
  );
}
