# ARCHIVED DOCUMENT

This file is superseded by the canonical architecture package:

- docs/governance/checkout-architecture-governance.md
- docs/governance/commerce-authority-checklist.md
- docs/architecture/canonical-commerce-architecture.md

Do not use this file as implementation authority.

---

# Global Local Secrets Setup (Canonical)

This is the current reference workflow for syncing repo env files to `~/.local_secrets`.

## 1) Create/refresh vault files

Create one file per repo:

- `~/.local_secrets/fas-medusa`
- `~/.local_secrets/fas-dash`
- `~/.local_secrets/fas-sanity`
- `~/.local_secrets/fas-cms-fresh`

## 2) Link each repo to the vault file

From workspace root (`~/LocalStorm/Workspace/DevProjects/GitHub`):

```bash
bash fas-medusa/scripts/secret-link.sh fas-medusa fas-medusa .env
bash fas-dash/scripts/secret-link.sh fas-dash fas-dash .env
bash fas-cms-fresh/scripts/secret-link.sh fas-cms-fresh fas-cms-fresh .env
bash fas-sanity/scripts/secret-link.sh fas-sanity fas-sanity .env.local
```

Optional for Sanity development profile:

```bash
bash fas-sanity/scripts/secret-link.sh fas-sanity fas-sanity .env.development.local
```

## 3) Verify links

```bash
ls -l fas-medusa/.env
ls -l fas-dash/.env
ls -l fas-cms-fresh/.env
ls -l fas-sanity/.env.local
```

Expected: each points to `~/.local_secrets/<repo-name>`.

## Notes

- Do not use `fas-admin-dashboard`; current repo is `fas-dash`.
- Sanity runtime loads `.env.local` first; linking only `fas-sanity/.env` is not sufficient.
- Keep `.env`/`.env.*` ignored in git for each repo.
- `scripts/secret-link.sh` safely backs up existing non-symlink files before linking.
