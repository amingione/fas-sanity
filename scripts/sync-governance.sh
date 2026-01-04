#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CMS_DIR="$ROOT/../fas-cms-fresh"

echo "🔁 Syncing governance from fas-sanity → fas-cms"

# --- Safety checks ---
if [ ! -d "$CMS_DIR" ]; then
  echo "❌ fas-cms-fresh not found next to fas-sanity"
  exit 1
fi

# --- Directories ---
echo "📁 Syncing docs/ai-governance/"
rsync -av --ignore-existing \
  "$ROOT/docs/ai-governance/" \
  "$CMS_DIR/docs/ai-governance/"

echo "📁 Syncing docs/prompts/"
rsync -av --ignore-existing \
  "$ROOT/docs/prompts/" \
  "$CMS_DIR/docs/prompts/"

echo "📁 Syncing docs/reports/"
rsync -av --ignore-existing \
  "$ROOT/docs/reports/" \
  "$CMS_DIR/docs/reports/"

# --- Codex reference ---
echo "📄 Syncing codex.md (reference-only)"
cp "$ROOT/codex.md" "$CMS_DIR/codex.md"

# --- Governance Makefile block ---
echo "🧠 Syncing Makefile governance block"
sed -n '/# =========================================================/,$p' "$ROOT/Makefile" > /tmp/governance.mk
cat /tmp/governance.mk >> "$CMS_DIR/Makefile"

echo "🛡️ Enforcing Codex authority guard"
"$ROOT/scripts/enforce-codex-authority.sh" "$CMS_DIR"

echo "✅ Governance sync complete."