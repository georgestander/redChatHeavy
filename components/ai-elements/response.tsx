"use client";

import { cn } from "@/lib/utils";
import { type ComponentProps, memo } from "react";
import { StreamdownLite as Streamdown } from "@/components/ai-elements/streamdown-lite";

type ResponseProps = ComponentProps<typeof Streamdown>;

export const Response = memo(
  ({ className, ...props }: ResponseProps) => (
    <Streamdown
      className={cn(
        "prose prose-neutral size-full max-w-none text-[15px] leading-7 dark:prose-invert prose-pre:overflow-x-auto prose-pre:rounded-md prose-pre:border prose-pre:border-border prose-pre:bg-muted/40 prose-pre:p-4 prose-code:font-mono prose-code:before:content-none prose-code:after:content-none prose-blockquote:border-border/70 prose-blockquote:bg-muted/40 prose-blockquote:px-4 prose-blockquote:py-2 prose-table:text-sm [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        className
      )}
      {...props}
    />
  ),
  (prevProps, nextProps) => prevProps.children === nextProps.children
);

Response.displayName = "Response";
