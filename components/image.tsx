"use client";

import type { ImgHTMLAttributes, Ref } from "react";
import { cn } from "@/lib/utils";

export type ImageProps = Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  "alt" | "src"
> & {
  alt: string;
  fill?: boolean;
  ref?: Ref<HTMLImageElement>;
  src: string;
};

const Image = ({
  alt,
  className,
  fill = false,
  height,
  loading,
  ref,
  src,
  width,
  ...props
}: ImageProps) => (
  <img
    {...props}
    alt={alt}
    className={cn(fill && "absolute inset-0 h-full w-full", className)}
    decoding="async"
    height={fill ? undefined : height}
    loading={loading ?? "lazy"}
    ref={ref}
    src={src}
    width={fill ? undefined : width}
  />
);

export default Image;
