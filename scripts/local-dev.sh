#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

export CHATJS_LOCAL_MODE=1
export SKIP_ENV_VALIDATION=1
export DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:5432/chatjs}"
export AUTH_SECRET="${AUTH_SECRET:-chatjs-local-dev-auth-secret}"
export APP_URL="${APP_URL:-http://localhost:5173}"

echo "Starting ChatJS local mode (Postgres + no-signup dev auth)."
echo "DATABASE_URL=${DATABASE_URL}"

bash scripts/local-db.sh up

echo "Running database migrations..."
pnpm exec drizzle-kit migrate

echo "Starting dev server at http://localhost:5173"
pnpm run dev
