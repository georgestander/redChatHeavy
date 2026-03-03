import type React from "react";
import { cn } from "@/lib/utils";
import { Favicon } from "./favicon";
import { getGoogleFaviconUrl } from "./get-google-favicon-url";

// Define a simpler interface for the sources needed by this component
type FaviconSource = {
  url: string;
  title?: string; // Title is optional, mainly for alt text
};

type FaviconGroupProps = {
  sources: FaviconSource[]; // Use the simpler interface
  maxVisible?: number;
  className?: string;
};

export const FaviconGroup: React.FC<FaviconGroupProps> = ({
  sources,
  maxVisible = 4,
  className,
}) => {
  const visibleSources = sources.slice(0, maxVisible);

  return (
    <div className={cn("flex items-center", className)}>
      {visibleSources.map((source, index) => {
        const hostname = getSafeHostname(source.url);
        return (
          <Favicon
            alt={`Favicon for ${source.title || hostname}`}
            className={cn(
              "h-5 w-5 rounded-full border-2 border-white dark:border-neutral-800", // Slightly thicker border for contrast
              index > 0 ? "-ml-2" : ""
            )}
            key={source.url || index}
            style={{ zIndex: maxVisible - index }}
            url={getGoogleFaviconUrl(source.url, 32)}
          />
        );
      })}
    </div>
  );
};

export function getSafeHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "unknown";
  }
}
