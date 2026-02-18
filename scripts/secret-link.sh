#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 1 ] || [ "$#" -gt 3 ]; then
  echo "Usage: $0 <secret-name> [repo-dir] [target-file]" >&2
  echo "Example: $0 fas-dash . .env" >&2
  exit 1
fi

SECRET_NAME="$1"
REPO_DIR="${2:-.}"
TARGET_FILE="${3:-.env}"
SECRET_PATH="$HOME/.local_secrets/$SECRET_NAME"
TARGET_PATH="$REPO_DIR/$TARGET_FILE"

if [ ! -f "$SECRET_PATH" ]; then
  echo "Missing secret file: $SECRET_PATH" >&2
  exit 1
fi

mkdir -p "$(dirname "$TARGET_PATH")"

if [ -L "$TARGET_PATH" ]; then
  CURRENT_LINK="$(readlink "$TARGET_PATH")"
  if [ "$CURRENT_LINK" = "$SECRET_PATH" ]; then
    echo "Already linked: $TARGET_PATH -> $SECRET_PATH"
    exit 0
  fi
fi

if [ -e "$TARGET_PATH" ] && [ ! -L "$TARGET_PATH" ]; then
  BACKUP_PATH="${TARGET_PATH}.bak.$(date +%Y%m%d-%H%M%S)"
  mv "$TARGET_PATH" "$BACKUP_PATH"
  echo "Backed up existing file to: $BACKUP_PATH"
fi

ln -sfn "$SECRET_PATH" "$TARGET_PATH"
echo "Linked: $TARGET_PATH -> $SECRET_PATH"
