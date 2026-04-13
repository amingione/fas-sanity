# FAS Env Recovery Report — 2026-04-13

## What happened

OpenAI Codex created a branch `codex/fix-commerce-api-sanitation` in fas-dash that deleted `.env.production`, removed `.gitignore` safeguards (`!.env.production`, `.env.keys`), and replaced the encrypted secrets with a plain `.env` file containing manually-typed values — some of which were wrong. That branch was merged into main. A computer crash compounded the damage by losing the local backup.

The `.env.production` files have since been restored and re-encrypted. Five consecutive auth-fix commits were needed to repair the fas-dash → Medusa connection. The current state is mostly recovered but has cleanup needed.

## Current state audit

### Production URLs (all verified via dotenvx decrypt)

| Variable               | fas-medusa                                    | fas-dash                       | fas-cms-fresh                  |
| ---------------------- | --------------------------------------------- | ------------------------------ | ------------------------------ |
| MEDUSA_BACKEND_URL     | https://api.fasmotorsports.com                | https://api.fasmotorsports.com | https://api.fasmotorsports.com |
| SANITY_PROJECT_ID      | r4og35qd                                      | r4og35qd                       | r4og35qd                       |
| SANITY_DATASET         | production                                    | production                     | production                     |
| MEDUSA_PUBLISHABLE_KEY | —                                             | pk_dcb89b24...e95              | pk_dcb89b24...e95              |
| MEDUSA_REGION_ID       | —                                             | reg_01KJ9Y...V2TB              | reg_01KJ9Y...V2TB              |
| AUTH_URL (dash)        | —                                             | https://www.fasmotorsports.io  | —                              |
| FAS_DASH_WEBHOOK_URL   | https://fasmotorsports.io/api/webhooks/medusa | —                              | —                              |

All cross-repo shared values are **consistent**.

### Webhook secrets

| Pair                                                            | Status |
| --------------------------------------------------------------- | ------ |
| medusa `FAS_DASH_WEBHOOK_SECRET` ↔ dash `MEDUSA_WEBHOOK_SECRET` | MATCH  |

### Symlink state

| Repo          | `.env` (should NOT exist)  | `.env.local` (symlink)              |
| ------------- | -------------------------- | ----------------------------------- |
| fas-medusa    | absent (correct)           | `-> ~/.local_secrets/fas-medusa`    |
| fas-dash      | **stale symlink** (remove) | `-> ~/.local_secrets/fas-dash`      |
| fas-cms-fresh | **stale symlink** (remove) | `-> ~/.local_secrets/fas-cms-fresh` |
| fas-sanity    | **stale symlink** (remove) | `-> ~/.local_secrets/fas-sanity`    |

### Codex branch contamination

| Repo          | Codex branches                          | Merged | Unmerged |
| ------------- | --------------------------------------- | ------ | -------- |
| fas-dash      | 1 (`codex/fix-commerce-api-sanitation`) | 1      | 0        |
| fas-sanity    | 80+                                     | 46     | 34       |
| fas-medusa    | 0                                       | 0      | 0        |
| fas-cms-fresh | 0                                       | 0      | 0        |

## Fix commands (run in your terminal)

### 1. Remove stale `.env` symlinks

```bash
cd ~/LocalStorm/Workspace/DevProjects/GitHub
rm fas-dash/.env fas-cms-fresh/.env fas-sanity/.env
```

### 2. Delete the merged Codex branch from fas-dash

```bash
cd fas-dash
git push origin --delete codex/fix-commerce-api-sanitation
```

### 3. Prune Codex branches from fas-sanity (dry-run first)

```bash
cd ../fas-sanity

# Preview what will be deleted
git branch -r | grep 'origin/codex/' | sed 's|origin/||' | while read b; do echo "Would delete: $b"; done

# Actually delete (uncomment when ready)
# git branch -r | grep 'origin/codex/' | sed 's|origin/||' | xargs -I {} git push origin --delete {}

# Clean up local tracking refs
git remote prune origin
```

### 4. Run the env audit to confirm everything syncs

```bash
cd ~/LocalStorm/Workspace/DevProjects/GitHub
bash scripts/dotenvx-env-audit.sh
```

### 5. Run the cross-repo preflight check

```bash
node scripts/fas-cross-repo-preflight.mjs
```

## .env.example drift (informational)

The `.env.example` files have drifted from `.env.production` over time. This is expected — `.env.example` documents ALL possible vars (including dev-only and script-only), while `.env.production` only contains runtime production secrets. Key drift counts:

| Repo          | Example-only keys    | Production-only keys   |
| ------------- | -------------------- | ---------------------- |
| fas-medusa    | 55 (dev/script vars) | 36 (prod infra vars)   |
| fas-dash      | 35 (local dev vars)  | 22 (Sentry/LogDrain)   |
| fas-cms-fresh | 98 (GMC/Google/dev)  | 6 (Mapbox, Anthropic)  |
| fas-sanity    | 99 (Google Ads/meta) | 50+ (S3, OTEL, Shippo) |

**Recommendation:** Update `.env.example` files to include production-only keys that are missing (like OTEL, Sentry, LogDrain vars) so the sync script can validate the full key set.
