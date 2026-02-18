import { existsSync } from "node:fs";
import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({
  path: ".env.local",
});

const schemaPath = existsSync("./src/lib/db/schema.ts")
  ? "./src/lib/db/schema.ts"
  : "./lib/db/schema.ts";

const migrationsPath = existsSync("./src/lib/db/migrations")
  ? "./src/lib/db/migrations"
  : "./lib/db/migrations";

export default defineConfig({
  schema: schemaPath,
  out: migrationsPath,
  dialect: "postgresql",
  dbCredentials: {
    // biome-ignore lint: Forbidden non-null assertion.
    url: process.env.DATABASE_URL!,
  },
});
