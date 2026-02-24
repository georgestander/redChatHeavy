#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/docker-compose.local.yml"
SERVICE_NAME="postgres"

run_compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose -f "${COMPOSE_FILE}" "$@"
    return
  fi

  if command -v docker-compose >/dev/null 2>&1; then
    docker-compose -f "${COMPOSE_FILE}" "$@"
    return
  fi

  echo "ERROR: Docker Compose is required but was not found."
  echo "Install Docker Desktop (or docker-compose) and retry."
  exit 1
}

wait_for_postgres() {
  local max_attempts=60
  local attempt=1

  echo "Waiting for local Postgres to become ready..."
  while [ "${attempt}" -le "${max_attempts}" ]; do
    if run_compose exec -T "${SERVICE_NAME}" pg_isready -U postgres -d chatjs >/dev/null 2>&1; then
      echo "Local Postgres is ready."
      return 0
    fi

    if [ "${attempt}" -eq "${max_attempts}" ]; then
      echo "ERROR: Postgres did not become ready in time."
      run_compose logs "${SERVICE_NAME}" || true
      return 1
    fi

    attempt=$((attempt + 1))
    sleep 1
  done
}

command="${1:-}"

case "${command}" in
  up)
    run_compose up -d "${SERVICE_NAME}"
    wait_for_postgres
    ;;
  wait)
    wait_for_postgres
    ;;
  down)
    run_compose down
    ;;
  reset)
    run_compose down -v
    run_compose up -d "${SERVICE_NAME}"
    wait_for_postgres
    ;;
  logs)
    run_compose logs "${SERVICE_NAME}"
    ;;
  status)
    run_compose ps
    ;;
  *)
    echo "Usage: bash scripts/local-db.sh {up|wait|down|reset|logs|status}"
    exit 1
    ;;
esac
