import { z } from "zod";
import type { ArtifactKind } from "@/lib/artifacts/artifact-kind";

export const documentIdInputSchema = z.object({ id: z.string() });

export const saveDocumentInputSchema = z.object({
  id: z.string(),
  content: z.string(),
  title: z.string(),
  kind: z.custom<ArtifactKind>(),
});
