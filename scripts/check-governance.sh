#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_root=$(CDPATH= cd -- "$script_dir/.." && pwd)
cd "$repo_root"

missing=0
for file in Makefile codex-enforce.mk governance-guards.mk; do
  if [ ! -f "$file" ]; then
    echo "Missing governance file: $file"
    missing=1
  fi
done

if [ "$missing" -ne 0 ]; then
  echo "Codex must be run interactively from a real terminal."
  exit 1
fi

if [ -d "docs/ai-governance/templates" ]; then
  for file in Makefile.template codex-enforce.mk governance-guards.mk; do
    if [ ! -f "docs/ai-governance/templates/$file" ]; then
      echo "Missing governance template: docs/ai-governance/templates/$file"
      missing=1
    fi
  done
fi

if [ "$missing" -ne 0 ]; then
  echo "Codex must be run interactively from a real terminal."
  exit 1
fi

fail=0

tmp_files=$(mktemp)
trap 'rm -f "$tmp_files"' EXIT HUP INT TERM

find . -type f \( -name 'Makefile' -o -name '*.mk' \) \
  -not -path './node_modules/*' \
  -not -path './dist/*' \
  -not -path './archive/*' > "$tmp_files"

while IFS= read -r file; do
  awk '
    BEGIN { bad = 0 }
    {
      line = $0
      if (line ~ /\|[[:space:]]*codex\b/) {
        printf "Unsafe codex pipe in %s:%d\n", FILENAME, NR
        bad = 1
      }
      if (line ~ /^\t/ && line ~ /\bcodex\b/) {
        if (line !~ /^\t@?(echo|printf)\b/) {
          printf "Unsafe codex invocation in %s:%d\n", FILENAME, NR
          bad = 1
        }
      }
    }
    END { if (bad) exit 1 }
  ' "$file" || fail=1
done < "$tmp_files"

if [ "$fail" -ne 0 ]; then
  echo "Governance guard failed: one or more unsafe codex invocations were found."
  echo "Codex must be run interactively from a real terminal."
  exit 1
fi
