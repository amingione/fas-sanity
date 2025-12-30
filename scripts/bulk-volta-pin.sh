#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
ROOT_PKG="$ROOT_DIR/package.json"

if [ ! -f "$ROOT_PKG" ]; then
  echo "Missing $ROOT_PKG"
  exit 1
fi

NODE_VERSION=$(python3 - <<'PY' "$ROOT_PKG"
import json
import sys

path = sys.argv[1]
with open(path, "r", encoding="utf-8") as handle:
    data = json.load(handle)

print(data.get("volta", {}).get("node", ""))
PY
)

if [ -z "$NODE_VERSION" ]; then
  echo "Missing volta.node in $ROOT_PKG"
  exit 1
fi

if ! command -v volta >/dev/null 2>&1; then
  echo "volta not found. Install Volta before running this script."
  exit 1
fi

mapfile -d '' PACKAGE_FILES < <(
  find "$ROOT_DIR" -name package.json -print0 \
    -not -path "*/node_modules/*" \
    -not -path "*/dist/*" \
    -not -path "*/.git/*" \
    -not -path "*/archive/*"
)

for package_file in "${PACKAGE_FILES[@]}"; do
  package_dir=$(dirname "$package_file")
  (cd "$package_dir" && volta pin "node@$NODE_VERSION")
done

echo "Pinned node@$NODE_VERSION in ${#PACKAGE_FILES[@]} package.json files."
