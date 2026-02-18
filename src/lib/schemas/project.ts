import { z } from "zod";
import { PROJECT_COLOR_NAMES, PROJECT_ICONS } from "@/lib/project-icons";

export const projectCreateInputSchema = z.object({
  name: z.string().min(1),
  instructions: z.string().default(""),
  icon: z.enum(PROJECT_ICONS).optional(),
  iconColor: z.enum(PROJECT_COLOR_NAMES).optional(),
});

export const projectGetByIdInputSchema = z.object({ id: z.string().uuid() });

export const projectUpdateInputSchema = z.object({
  id: z.string().uuid(),
  updates: z.object({
    name: z.string().min(1).optional(),
    instructions: z.string().optional(),
    icon: z.enum(PROJECT_ICONS).optional(),
    iconColor: z.enum(PROJECT_COLOR_NAMES).optional(),
  }),
});

export const projectSetInstructionsInputSchema = z.object({
  id: z.string().uuid(),
  instructions: z.string(),
});

export const projectRemoveInputSchema = z.object({ id: z.string().uuid() });
