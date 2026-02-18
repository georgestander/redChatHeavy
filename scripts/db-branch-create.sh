#!/bin/bash
set -e

BRANCH_NAME="${1:-dev-local}"

echo "🌱 Creating branch '$BRANCH_NAME'..."
pnpm dlx neonctl branches create --name "$BRANCH_NAME"

echo ""
echo "✓ Branch '$BRANCH_NAME' created"
echo ""
echo "To use it: pnpm db:branch:use $BRANCH_NAME"
