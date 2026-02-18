import type { Sitemap } from "next";
import { getBaseUrl } from "@/lib/url";

export default function sitemap(): Sitemap {
  const baseUrl = getBaseUrl();
  const now = new Date();

  const staticEntries: Sitemap = [
    {
      url: `${baseUrl}/`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
  ];

  return staticEntries;
}
