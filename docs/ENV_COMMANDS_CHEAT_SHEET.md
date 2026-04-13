# Env Commands Cheat Sheet

Last updated: 2026-04-13
Scope: fas-sanity + cross-repo env tooling

## Prerequisites

- `~/.zshrc` includes:
  - `FAS_REPOS_ROOT`
  - `env-audit`, `env-ack`
  - `env-sync`, `env-sync-apply`
  - `fasenv`
- Scripts are executable:
  - `scripts/dotenvx-env-audit.sh`
  - `scripts/sync-env-local-to-prod.sh`

## Daily Commands

| Command | What it does |
|---|---|
| `env-audit` | Audits `.env.local` vs encrypted `.env.production` and reports missing/drifted keys. |
| `env-ack` | Same audit with acknowledgment mode (`--ack`) for audit workflow logging. |
| `env-sync` | Dry-run sync helper: compares local -> prod with repo-specific skip keys. No write apply by default. |
| `env-sync-apply` | Applies sync from local -> encrypted prod using repo-specific skip keys. |

## fas-sanity `env:*` Scripts

Run via helper:

```bash
fasenv <script>
```

| Command | What it does |
|---|---|
| `fasenv env:encrypt:prod` | Encrypts `.env.production` in-place via dotenvx. |
| `fasenv env:decrypt:stdout:prod` | Decrypts `.env.production` to stdout (no file write). |
| `fasenv env:check:prod` | Decrypt check smoke test for `.env.production` (requires private key in shell). |
| `fasenv env:run:prod -- <cmd>` | Runs a command with env injected from `.env.production`. |

Examples:

```bash
fasenv env:check:prod
fasenv env:decrypt:stdout:prod
fasenv env:run:prod -- node -e "console.log(process.env.SANITY_PROJECT_ID)"
```

## `secret-link` Helper

| Command | What it does |
|---|---|
| `secret-link` | Links repo `.env` to matching `~/.local_secrets/<repo-name>`. |
| `secret-link fas-sanity fas-sanity` | Explicitly links fas-sanity secret into repo. |

Notes:
- Current team rule: use `secret-link` for `.env.local` workflows.
- Existing alias/function behavior depends on your shell profile setup.

## Repo-Specific `env-sync` Skip Keys

These are automatically applied by `env-sync`/`env-sync-apply` based on current repo directory name:

- `fas-medusa`: `DATABASE_URL,REDIS_URL,AHREFS_COUNTRY,AHREFS_MAX_KD,AHREFS_MIN_VOLUME`
- `fas-sanity`: `GMC_SERVICE_ACCOUNT_KEY_FILE`
- `fas-dash`: `VERCEL_URL`
- `fas-cms-fresh`: none

## Recommended Safe Flow

1. `env-audit`
2. `env-sync` (dry-run review)
3. `env-sync-apply` (apply when ready)
4. `fasenv env:encrypt:prod` (if staging edits were made)
5. `fasenv env:check:prod`

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `MISSING_PRIVATE_KEY` on decrypt/check | `DOTENV_PRIVATE_KEY_PRODUCTION` not loaded in shell | Load key in shell/session, then rerun. |
| `env-sync: command not found` | `~/.zshrc` not reloaded | `source ~/.zshrc` |
| Script permission denied | Missing executable bit | `chmod +x scripts/<name>.sh` |

