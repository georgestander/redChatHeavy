import { drizzle } from "drizzle-orm/neon-http";
import { env } from "@/lib/env";
import { createNeonHttpCompatClient } from "./neon-compat";

// Optionally, if not using email/pass login, you can
// use the Drizzle adapter for Auth.js / NextAuth
// https://authjs.dev/reference/adapter/drizzle
const sql = createNeonHttpCompatClient(env.DATABASE_URL);
export const db = drizzle(sql);
