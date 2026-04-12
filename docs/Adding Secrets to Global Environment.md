---
title:
  - adding secrets to global local env
tags:
  - env
  - productMapping
created: "[[02-11-26-]]"
updated: "[[4-11-26-]]"
UpdatedBy: Amber Min
status: active
---
# IMPORTANT UPDATE:
🚨 `secret-link` is now used for `.env.local` ONLY
🚨 `dotenvx-workflow` is your source of truth for 
> Add secrets by secret-link for repos

# From anywhere
```bash
secret-link fas-sanity fas-sanity
```

## Or from inside the fas-sanity repo
```bash
cd fas-sanity
secret-link
```
---

Setting up [[Global Local Storage]](Notes/GlobalLocalStorage)]

## Env Naming Update (2026-04-12)

Canonical keys now prefer non-`PUBLIC_` names:

- `SITE_URL`
- `VENDOR_PORTAL_URL`
- `STUDIO_URL`
- `COMPANY_NAME`

Compatibility:
- Runtime still falls back to `PUBLIC_SITE_URL`, `PUBLIC_VENDOR_PORTAL_URL`, `PUBLIC_STUDIO_URL`, and `PUBLIC_COMPANY_NAME` during migration.
