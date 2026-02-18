"use client";
import Image from "@/components/image";
import { cn } from "@/lib/utils";

export const ModelSelectorLogo = ({
  provider,
  className,
}: {
  provider: string;
  className?: string;
}) => (
  <Image
    alt={`${provider} logo`}
    className={cn("size-4 brightness-0 dark:invert", className)}
    height={16}
    src={`https://models.dev/logos/${provider}.svg`}
    width={16}
  />
);
