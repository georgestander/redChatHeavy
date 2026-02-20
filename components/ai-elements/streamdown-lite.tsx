"use client";

import type { ComponentProps } from "react";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";
import { sanitizeUrl } from "@/lib/markdown";

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
  const components: NonNullable<StreamdownLiteProps["components"]> = {
    a: ({ href, rel, target, ...rest }) => {
      const safeHref = sanitizeUrl(href);
      if (!safeHref) {
        return <span>{rest.children}</span>;
      }

      const safeRel =
        target === "_blank"
          ? [rel, "noopener", "noreferrer"].filter(Boolean).join(" ")
          : rel;

      return <a href={safeHref} rel={safeRel} target={target} {...rest} />;
    },
    img: ({ src, alt, ...rest }) => {
      const safeSrc = sanitizeUrl(src, { allowDataImages: false });
      if (!safeSrc) {
        return null;
      }

      return <img alt={alt} src={safeSrc} {...rest} />;
    },
  };

  return (
    <div className={cn(className)}>
      <ReactMarkdown components={components} {...props}>
        {children ?? ""}
      </ReactMarkdown>
    </div>
  );
}
