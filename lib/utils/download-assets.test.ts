import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type { ModelMessage } from "ai";
import { replaceFilePartUrlByBinaryDataInMessages } from "./download-assets";

describe("replaceFilePartUrlByBinaryDataInMessages", () => {
  it("downloads only managed attachment urls and skips external urls", async () => {
    const originalAppUrl = process.env.APP_URL;
    process.env.APP_URL = "https://chat.example.com";

    try {
      const downloadedUrls: string[] = [];
      const messages = [
        {
          role: "user",
          content: [
            {
              type: "file",
              mediaType: "image/png",
              data: "/api/files/local-upload.png",
            },
            {
              type: "file",
              mediaType: "image/png",
              data: "https://evil.example.com/steal.png",
            },
          ],
        },
      ] as ModelMessage[];

      const result = await replaceFilePartUrlByBinaryDataInMessages(
        messages,
        async ({ url }) => {
          downloadedUrls.push(url.toString());
          return {
            mediaType: "image/png",
            data: new Uint8Array([1, 2, 3]),
          };
        }
      );

      assert.deepEqual(downloadedUrls, [
        "https://chat.example.com/api/files/local-upload.png",
      ]);

      const parts = result[0].content as Array<{ type: string; data?: unknown }>;
      assert(parts[0].data instanceof Uint8Array);
      assert.equal(parts[1].data, "https://evil.example.com/steal.png");
    } finally {
      process.env.APP_URL = originalAppUrl;
    }
  });

  it("rejects lookalike vercel blob domains", async () => {
    const messages = [
      {
        role: "user",
        content: [
          {
            type: "image",
            mediaType: "image/png",
            image: "https://blob.vercel-storage.com.evil.com/payload.png",
          },
        ],
      },
    ] as ModelMessage[];

    const result = await replaceFilePartUrlByBinaryDataInMessages(
      messages,
      async () => ({
        mediaType: "image/png",
        data: new Uint8Array([9]),
      })
    );

    const parts = result[0].content as Array<{ type: string; image?: unknown }>;
    assert.equal(
      parts[0].image,
      "https://blob.vercel-storage.com.evil.com/payload.png"
    );
  });
});
