#!/bin/sh
set -eu

fail=0

files=$(find . -type f \( -name 'Makefile' -o -name '*.mk' \) \
  -not -path './node_modules/*' \
  -not -path './dist/*' \
  -not -path './archive/*')

for file in $files; do
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
 done

if [ "$fail" -ne 0 ]; then
  echo "Codex must be run interactively from a real terminal."
  exit 1
fi
