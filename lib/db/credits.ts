import "server-only";
import { eq, sql } from "drizzle-orm";
import { env } from "@/lib/env";
import { db } from "./client";
import { userCredit } from "./schema";

const LOCAL_UNLIMITED_CREDITS = 100_000_000;

function isLocalTcpPostgresUrl(databaseUrl: string): boolean {
  try {
    const parsed = new URL(databaseUrl);
    const isPostgresProtocol =
      parsed.protocol === "postgres:" || parsed.protocol === "postgresql:";
    const isLocalHost =
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname === "localhost" ||
      parsed.hostname === "::1" ||
      parsed.hostname.endsWith(".hyperdrive.local") ||
      parsed.hostname === "hyperdrive.local";
    return isPostgresProtocol && isLocalHost;
  } catch {
    return false;
  }
}

function isLocalUnlimitedCreditsRuntime(): boolean {
  return (
    process.env.CHATJS_LOCAL_MODE === "1" ||
    process.env.SKIP_ENV_VALIDATION === "1" ||
    isLocalTcpPostgresUrl(env.DATABASE_URL)
  );
}

async function ensureUserCreditRow(userId: string) {
  await db.insert(userCredit).values({ userId }).onConflictDoNothing();
}

/**
 * Get user's current credit balance (in cents).
 */
export async function getCredits(userId: string): Promise<number> {
  if (isLocalUnlimitedCreditsRuntime()) {
    return LOCAL_UNLIMITED_CREDITS;
  }

  let rows = await db
    .select({ credits: userCredit.credits })
    .from(userCredit)
    .where(eq(userCredit.userId, userId))
    .limit(1);

  if (rows.length === 0) {
    await ensureUserCreditRow(userId);
    rows = await db
      .select({ credits: userCredit.credits })
      .from(userCredit)
      .where(eq(userCredit.userId, userId))
      .limit(1);
  }

  return rows[0]?.credits ?? 0;
}

/**
 * Check if user has positive credits (can spend).
 */
export async function canSpend(userId: string): Promise<boolean> {
  if (isLocalUnlimitedCreditsRuntime()) {
    return true;
  }

  const credits = await getCredits(userId);
  return credits > 0;
}

/**
 * Deduct credits from user. Allows going slightly negative for in-progress operations.
 */
export async function deductCredits(
  userId: string,
  amount: number
): Promise<void> {
  if (isLocalUnlimitedCreditsRuntime()) {
    return;
  }

  await ensureUserCreditRow(userId);
  await db
    .update(userCredit)
    .set({
      credits: sql`${userCredit.credits} - ${amount}`,
    })
    .where(eq(userCredit.userId, userId));
}

/**
 * Add credits to user (for purchases, refunds, etc).
 */
async function _addCredits(userId: string, amount: number): Promise<void> {
  await ensureUserCreditRow(userId);
  await db
    .update(userCredit)
    .set({
      credits: sql`${userCredit.credits} + ${amount}`,
    })
    .where(eq(userCredit.userId, userId));
}
