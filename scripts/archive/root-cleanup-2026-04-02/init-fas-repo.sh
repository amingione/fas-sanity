#!/usr/bin/env bash
set -e

# =========================================================
# init-fas-repo.sh
#
# One-command governance bootstrap for fas-* repositories
#
# This script:
# - Copies the canonical Makefile template
# - Installs codex-enforce.mk
# - Installs governance guards
# - Installs governance check script
# - Creates required directories
#
# Codex is NEVER executed by this script.
# =========================================================

if [ $# -lt 1 ]; then
  echo "❌ Missing target repo path."
  echo "Usage: ./init-fas-repo.sh /path/to/fas-<repo>"
  exit 1
fi

TARGET_DIR="$1"

if [ ! -d "$TARGET_DIR" ]; then
  echo "❌ Target repo not found: $TARGET_DIR"
  exit 1
fi

TARGET_DIR="$(cd "$TARGET_DIR" && pwd)"
REPO_NAME="$(basename "$TARGET_DIR")"

if [[ "$REPO_NAME" != fas-* ]]; then
  echo "❌ Target repo must be named fas-*"
  echo "Current directory: $REPO_NAME"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE_DIR="$SCRIPT_DIR/docs/ai-governance/templates"

for file in Makefile.template codex-enforce.mk governance-guards.mk; do
  if [ ! -f "$TEMPLATE_DIR/$file" ]; then
    echo "❌ Missing template: $TEMPLATE_DIR/$file"
    exit 1
  fi
done

if [ ! -f "$SCRIPT_DIR/scripts/check-governance.sh" ]; then
  echo "❌ Missing governance check script: $SCRIPT_DIR/scripts/check-governance.sh"
  exit 1
fi

echo "🔧 Initializing governance for $REPO_NAME..."

mkdir -p "$TARGET_DIR/docs/prompts" "$TARGET_DIR/docs/reports" "$TARGET_DIR/scripts"

echo "✔ Directories ensured"

if [ -f "$TARGET_DIR/Makefile" ]; then
  echo "⚠️  Makefile already exists — backing up to Makefile.bak"
  cp "$TARGET_DIR/Makefile" "$TARGET_DIR/Makefile.bak"
fi

cp "$TEMPLATE_DIR/Makefile.template" "$TARGET_DIR/Makefile"
cp "$TEMPLATE_DIR/codex-enforce.mk" "$TARGET_DIR/codex-enforce.mk"
cp "$TEMPLATE_DIR/governance-guards.mk" "$TARGET_DIR/governance-guards.mk"
cp "$SCRIPT_DIR/scripts/check-governance.sh" "$TARGET_DIR/scripts/check-governance.sh"
chmod +x "$TARGET_DIR/scripts/check-governance.sh"

echo "✔ Governance files installed"

echo ""
echo "🎉 Governance initialized successfully."
echo ""
echo "Next steps:"
echo "  make new-ai-cycle ISSUE=<issue>"
echo ""
echo "Codex MUST be run manually from a real terminal."
