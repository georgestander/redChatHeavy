"use server";

import { requestInfo } from "rwsdk/worker";
import { auth } from "@/lib/auth";
import {
  getUserModelPreferences,
  upsertUserModelPreference,
} from "@/lib/db/queries";
import { setModelEnabledInputSchema } from "@/lib/schemas/settings";

async function requireUserId() {
  const session = await auth.api.getSession({
    headers: requestInfo.request.headers,
  });
  const userId = session?.user?.id;
  if (!userId) {
    throw new Error("UNAUTHORIZED");
  }
  return userId;
}

function serializePreference<
  T extends { createdAt: unknown; updatedAt: unknown },
>(preference: T) {
  return {
    ...preference,
    createdAt:
      preference.createdAt instanceof Date
        ? preference.createdAt.toISOString()
        : preference.createdAt,
    updatedAt:
      preference.updatedAt instanceof Date
        ? preference.updatedAt.toISOString()
        : preference.updatedAt,
  };
}

export async function getModelPreferences() {
  const userId = await requireUserId();
  const preferences = await getUserModelPreferences({ userId });
  return preferences.map((preference) => serializePreference(preference));
}

export async function setModelEnabled(input: unknown) {
  const userId = await requireUserId();
  const parsed = setModelEnabledInputSchema.parse(input);

  await upsertUserModelPreference({
    userId,
    modelId: parsed.modelId,
    enabled: parsed.enabled,
  });

  return { success: true };
}
