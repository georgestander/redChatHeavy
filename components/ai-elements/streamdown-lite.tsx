"use client";

import type { ComponentProps } from "react";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";

type StreamdownLiteProps = Omit<ComponentProps<typeof ReactMarkdown>, "children"> & {
  children?: string;
  className?: string;
  isAnimating?: boolean;
  mode?: "static" | "streaming";
};

export function StreamdownLite({
  children,
  className,
  ...props
}: StreamdownLiteProps) {
  return (
    <div className={cn(className)}>
      <ReactMarkdown {...props}>{children ?? ""}</ReactMarkdown>
    </div>
  );
}
