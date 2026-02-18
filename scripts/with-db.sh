#!/bin/bash
# Wrapper that uses branch DATABASE_URL if .neon-branch exists, otherwise uses .env.local
set -e

BRANCH_FILE=".neon-branch"

if [ -f "$BRANCH_FILE" ]; then
  BRANCH_NAME=$(cat "$BRANCH_FILE")
  
  # Get branch connection string (filter out package manager output)
  BRANCH_URL=$(pnpm dlx neonctl connection-string "$BRANCH_NAME" 2>/dev/null | grep -E '^postgresql://') || {
    echo "❌ Failed to get connection string for branch '$BRANCH_NAME'"
    echo "$BRANCH_URL"
    echo ""
    echo "Run: pnpm db:branch:use main  (to switch back to main)"
    exit 1
  }
  
  MASKED_URL=$(echo "$BRANCH_URL" | sed 's/:[^:@]*@/:****@/')
  echo "🔀 Using branch '$BRANCH_NAME': $MASKED_URL"
  
  DATABASE_URL="$BRANCH_URL" exec "$@"
else
  exec "$@"
fi
