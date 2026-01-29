#!/usr/bin/env bash
set -euo pipefail

PHASE="${1:-all}"
BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CMS_DIR="/Users/ambermin/LocalStorm/Workspace/DevProjects/GitHub/fas-cms-fresh"
DEPRECATED_PATTERN="${DEPRECATED_PROVIDER_PATTERN:-}"

step() {
  printf '\n==> %s\n' "$1"
}

run_checks() {
  step "Search for deprecated provider references (case-insensitive)"
  if [ -z "$DEPRECATED_PATTERN" ]; then
    echo "DEPRECATED_PROVIDER_PATTERN is not set; skipping text search."
    return 0
  fi
  rg -n -i "$DEPRECATED_PATTERN" "$BASE_DIR" || true
  if [ -d "$CMS_DIR" ]; then
    rg -n -i "$DEPRECATED_PATTERN" "$CMS_DIR" || true
  else
    echo "CMS repo not found at $CMS_DIR (skipping)."
  fi
}

phase_a() {
  step "Phase A: Freeze runtime usage (no schema changes)"
  cat << NOTES
- Disable deprecated provider routes (rates, labels, webhooks) with explicit 410 responses.
- Remove runtime SDK imports from handler entrypoints.
- Prevent label creation paths in Studio/Netlify from firing.
NOTES
}

phase_b() {
  step "Phase B: Schema cleanup (requires approval phrase: SCHEMA CHANGE APPROVED)"
  cat << NOTES
- Remove provider-specific fields and types from schemas.
- Replace with provider-agnostic fields (shippo_object_id, shippo_transaction_id, tracking_number, carrier, service_level).
- Update schema-driven types and Studio UI to match.
NOTES
}

phase_c() {
  step "Phase C: Code removal"
  cat << NOTES
- Delete SDK clients, helpers, webhooks, rate mappers, tests, and docs.
- Remove env var references and sample config entries.
- Remove any marketplace metadata and mock fixtures.
NOTES
}

case "$PHASE" in
  all)
    phase_a
    phase_b
    phase_c
    run_checks
    ;;
  A|a)
    phase_a
    run_checks
    ;;
  B|b)
    phase_b
    run_checks
    ;;
  C|c)
    phase_c
    run_checks
    ;;
  *)
    echo "Usage: $(basename "$0") [all|A|B|C]" >&2
    exit 1
    ;;
esac

step "Done"
