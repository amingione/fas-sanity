# FAS Sanity (`fas-sanity`)

DOCS_VERSION: v2026.03.07  
Role: Content system

## Purpose
`fas-sanity` is the content/editorial platform for FAS.

It owns:
- marketing and editorial content
- SEO copy and media content structures
- content workflows, templates, and internal documentation content
- optional passive mirrors/annotations that explicitly defer to Medusa

## System boundaries
- `fas-medusa` = commerce source of truth
- `fas-dash` = internal operations/admin UI
- `fas-cms-fresh` = storefront UI
- Stripe = payment processor only
- Sanity = content only

## Non-negotiable rules
Sanity must not be described or implemented as authority for:
- products/variants
- pricing/inventory
- cart/checkout/orders
- shipping execution

## Legacy template note
This repository originated from template material that referenced Shopify-centric assumptions.
Those assumptions are superseded and archived; active docs must follow the Medusa-authoritative model.

## Canonical docs
- `docs/governance/checkout-architecture-governance.md`
- `docs/governance/commerce-authority-checklist.md`
- `docs/architecture/canonical-commerce-architecture.md`
- `docs/architecture/migration-status.md`

## Commands
Use existing scripts in `package.json`.

Common checks:
- `node ../scripts/docs-drift-check.mjs --repo fas-sanity`
- `pnpm build`

Content exports:
- `pnpm env:run:prod pnpm export:products -- --mode content --out exports/products.csv`

## Env Workflow (Canonical)

If you use cross-repo env tooling from your shell profile, add this to `~/.zshrc`:

```bash
# FAS repo root for cross-repo tools
export FAS_REPOS_ROOT="/Users/ambermin/LocalStorm/Workspace/DevProjects/GitHub"

# Audit shortcuts
alias env-audit='bash "$FAS_REPOS_ROOT/scripts/dotenvx-env-audit.sh"'
alias env-ack='bash "$FAS_REPOS_ROOT/scripts/dotenvx-env-audit.sh" --ack'

# -- env-sync: per-repo skip-keys auto-wired ---------------------------------
_ENV_SYNC_SCRIPT="$FAS_REPOS_ROOT/scripts/sync-env-local-to-prod.sh"

_env_sync_skip_keys() {
  case "$(basename "$PWD")" in
    fas-medusa)    echo "DATABASE_URL,REDIS_URL,AHREFS_COUNTRY,AHREFS_MAX_KD,AHREFS_MIN_VOLUME" ;;
    fas-sanity)    echo "GMC_SERVICE_ACCOUNT_KEY_FILE" ;;
    fas-dash)      echo "VERCEL_URL" ;;
    fas-cms-fresh) echo "" ;;
    *)             echo "" ;;
  esac
}

env-sync() {
  local skip
  skip="$(_env_sync_skip_keys)"
  if [[ -n "$skip" ]]; then
    bash "$_ENV_SYNC_SCRIPT" --skip-keys "$skip" "$@"
  else
    bash "$_ENV_SYNC_SCRIPT" "$@"
  fi
}

env-sync-apply() {
  local skip
  skip="$(_env_sync_skip_keys)"
  if [[ -n "$skip" ]]; then
    bash "$_ENV_SYNC_SCRIPT" --apply --skip-keys "$skip" "$@"
  else
    bash "$_ENV_SYNC_SCRIPT" --apply "$@"
  fi
}
# ---------------------------------------------------------------------------

# Run fas-sanity package.json env:* scripts from anywhere
fasenv() {
  local repo="$FAS_REPOS_ROOT/fas-sanity"
  cd "$repo" || return 1
  pnpm run "$@"
}
```

Then reload:

```bash
source ~/.zshrc
```

Examples:

```bash
fasenv env:check:prod
fasenv env:decrypt:stdout:prod
fasenv env:run:prod node -e "console.log(process.env.SANITY_PROJECT_ID)"
```
