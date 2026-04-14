---
sticker: emoji//1f511
---
The `--plain` flag means the value will be stored **unencrypted** (in plain text) in your .env file, rather than encrypted.

## Example:

bash

```bash
dotenvx set LOG_LEVEL DEBUG --plain
```

This will add `LOG_LEVEL=DEBUG` to your .env file **without encryption**.

## More Examples:

bash

```bash
# Non-sensitive config that doesn't need encryption
dotenvx set NODE_ENV production --plain

# Application name or version
dotenvx set APP_NAME "My App" --plain

# Public API endpoint
dotenvx set API_BASE_URL "https://api.example.com" --plain

# Feature toggle
dotenvx set ENABLE_ANALYTICS true --plain
```

## When to Use `--plain`:

Use `--plain` for values that are:

- **Not sensitive** (public URLs, environment names, feature flags)
- **Configuration values** that don't need security
- **Already public** information

## Without `--plain` (Encrypted - Default):

bash

```bash
dotenvx set DATABASE_PASSWORD "super-secret-123"
```

This encrypts the value automatically, so it's secure.

---

**In short:** `--plain` = no encryption, good for non-sensitive config. Without it = encrypted, good for secrets.