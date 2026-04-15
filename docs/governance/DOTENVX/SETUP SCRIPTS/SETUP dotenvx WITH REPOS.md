---
sticker: emoji//1f511
---
## FAS Dotenvx Setup (Real Repo Version)

This project does **not** use template `.env`.  
FAS standard is:

- Encrypted runtime file: `.env.production` (committed)
- Private key file: `.env.keys` (never committed)
- Local dev override: `.env.local` (usually symlinked to `~/.local_secrets/<repo>`)

## Required tooling

Install dotenvx CLI locally:

```bash
brew install dotenvx/brew/dotenvx
dotenvx --version
```

## Repo dependency/runtime map (current FAS state)

| Repo            | How dotenvx is provided                                 | Where it runs                                   |
| --------------- | ------------------------------------------------------- | ----------------------------------------------- |
| `fas-dash`      | `@dotenvx/dotenvx` in `dependencies`                    | `npm run build`, Vercel runtime/instrumentation |
| `fas-cms-fresh` | `@dotenvx/dotenvx` in `devDependencies`                 | Netlify build + Netlify Functions runtime       |
| `fas-sanity`    | `@dotenvx/dotenvx` in `devDependencies`                 | Netlify build + Netlify Functions runtime       |
| `fas-medusa`    | Dockerfile global install (`npm i -g @dotenvx/dotenvx`) | Railway preDeploy/start + container runtime     |

## One-time setup per repo

From repo root:

```bash
# 1) Ensure file exists
ls -la .env.production .env.keys

# 2) Encrypt in place (or re-encrypt after edits)
dotenvx encrypt -f .env.production

# 3) Validate encrypted format (hard guard used by build/deploy)
node ./scripts/check-env-production-encrypted.mjs --file .env.production

# 4) Optional decrypt smoke test (no write)
dotenvx decrypt -f .env.production --stdout >/dev/null
```

## Team workflow

When changing secrets:

```bash
# Add/update key in encrypted production env
dotenvx set KEY_NAME "value" -f .env.production

# Verify encrypted file is still safe
node ./scripts/check-env-production-encrypted.mjs --file .env.production

# Commit encrypted env only
git add .env.production
git commit -m "Update encrypted production env"
git push
```

What to share:

- Share `.env.keys` securely out-of-band only (1Password, secure transfer, etc.).
- Do **not** commit `.env.keys`.

## Host-level required key

Each deployed environment must provide:

- `DOTENV_PRIVATE_KEY_PRODUCTION` (plaintext host env var)

Used by:

- Vercel (`fas-dash`)
- Netlify (`fas-cms-fresh`, `fas-sanity`)
- Railway (`fas-medusa`)

## Build/deploy behavior (current)

- `fas-dash`: `npm run build` and `deploy:vercel` guard `.env.production` encryption first.
- `fas-cms-fresh`: Netlify `build.command` runs encryption guard before `dotenvx run`.
- `fas-sanity`: Netlify `build.command` runs encryption guard before `dotenvx run`.
- `fas-medusa`: Railway predeploy/start and Docker build run encryption guard before boot/migrate.

If `.env.production` is plaintext, build/deploy now fails fast.

## Local dev note

Local development should use `.env.local` (symlinked secret files), not decrypted `.env.production`.
