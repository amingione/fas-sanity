#!/usr/bin/env bash
set -euo pipefail

TARGET="$1"

if [ ! -d "$TARGET/docs" ]; then
  echo "❌ Target repo docs/ directory not found"
  exit 1
fi

# Find RULES outside templates directory
VIOLATIONS=$(grep -R "RULES:" "$TARGET/docs" \
  | grep -v "/docs/ai-governance/templates/" \
  || true)

if [ -n "$VIOLATIONS" ]; then
  echo "❌ Codex rule redefinition detected outside templates:"
  echo ""
  echo "$VIOLATIONS"
  echo ""
  echo "fas-cms must reference Codex authority, not redefine it."
  exit 1
fi

echo "✔ Codex authority intact."