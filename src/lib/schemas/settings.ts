import { z } from "zod";

export const setModelEnabledInputSchema = z.object({
  modelId: z.string(),
  enabled: z.boolean(),
});
