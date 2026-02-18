"use server";

import { requestInfo } from "rwsdk/worker";
import { auth } from "@/lib/auth";
import { getCredits } from "@/lib/db/credits";

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

export async function getAvailableCredits() {
  const userId = await requireUserId();
  const credits = await getCredits(userId);
  return { credits };
}
