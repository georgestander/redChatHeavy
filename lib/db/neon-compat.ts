import { neon } from "@neondatabase/serverless";

type NeonClient = ReturnType<typeof neon>;
type NeonQueryOptions = Parameters<NeonClient["query"]>[2];

type NeonQueryLike = (
  query: string,
  params?: unknown[],
  queryOpts?: NeonQueryOptions
) => ReturnType<ReturnType<typeof neon>["query"]>;

/**
 * Drizzle neon-http currently calls the client as a regular function:
 * client("SELECT ...", [params], opts). Neon v1 requires sql.query(...) for that style.
 * This adapter preserves Drizzle's expected call shape while keeping Neon APIs.
 */
export function createNeonHttpCompatClient(databaseUrl: string) {
  const sql = neon(databaseUrl);

  const compatSql = Object.assign(
    ((query: string, params?: unknown[], queryOpts?: NeonQueryOptions) =>
      sql.query(query, params, queryOpts)) as NeonQueryLike,
    sql
  );

  return compatSql;
}
