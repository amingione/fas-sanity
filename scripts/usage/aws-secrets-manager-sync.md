# AWS USAGE

---

# ---------------- CONFIG ----------------

AWS_REGION="us-east-2"
SITE="fas-sanity"
ENVIRONMENT="prod"

SECRET_NAME="netlify/${SITE}/${ENVIRONMENT}/env"
ENV_FILE=".env"

# ----------------------------------------


print_usage() {
  cat <<EOF

# Usage:
    ```bash
    ./scripts/migrate-secrets-to-aws.sh [--dry-run] [--remove]
    ```


# **Options:**

```bash
  --dry-run  # Print intended actions without writing to AWS.
  --remove   # Delete the configured AWS Secrets Manager secret.
  -h, --help # Show this help message.
```

EOF
}

````

```bash
./scripts/migrate-secrets-to-aws.sh
```

```bash
./scripts/migrate-secrets-to-aws.sh  --dry-run
```

```bash
./scripts/migrate-secrets-to-aws.sh  --dry-run --remove
```

```bash
./scripts/migrate-secrets-to-aws.sh  --remove
```

```bash
./scripts/migrate-secrets-to-aws.sh  --help
```

---

```bash
# → Live sync, no prune (not bulk remove).
npm run sync:env:aws -- --secret-id <fas-sanity-secret-id> --env-file .env
```

```bash
# → Live sync with prune/remove (this is the bulk-prune behavior), not dry run.
npm run sync:env:aws -- --secret-id <fas-sanity-secret-id> --env-file .env --remove
```

```bash
# Sync local .env to AWS Secrets Manager (DRY-RUN **NOT LIVE** with bulk prune)
npm run sync:env:aws:dry-run -- --secret-id <fas-sanity-secret-id> --env-file .env
```

## DEFINITION OF BULK PRUNE: In the context of syncing environment variables to AWS Secrets Manager:

**“bulk prune” usually means removing many stale or unmanaged secrets in one pass instead of deleting them individually.**

    - For an AWS Secrets Manager sync workflow, it typically targets secrets that no longer match the current source-of-truth (for example, a config file, environment manifest, or naming pattern).

    - A bulk prune step is generally a cleanup/synchronization operation: it compares what should exist versus what currently exists, then schedules deletion for extras. In AWS Secrets Manager, deletion is often a soft-delete with a recovery window, so prune does not always mean immediate permanent removal.

    - The main caution is scope: bulk prune can affect production secrets if filters are too broad. It is usually safest to run a dry-run preview first, verify the candidate list, and then execute prune with explicit environment/path constraints.

---

**MODIFICATIONS**
2-20-26

---

1.  **Implemented --remove in migrate-secrets-to-aws.sh.** - What changed in migrate-secrets-to-aws.sh:\*\*

        - Added CLI argument parsing.
        - Added --remove mode to delete the configured secret ($SECRET_NAME)    from AWS Secrets Manager.
        - Added -h / --help.
        - Added unknown-argument handling with usage output.
        - Ensured --remove exits before .env validation/serialization.

## Usage:

```bash
# To remove secrets from AWS Secrets Manager:
./scripts/migrate-secrets-to-aws.sh --remove
```

1. Checks whether the secret exists.
   If it exists, calls:

```bash
# Terminal Output Example
aws secretsmanager delete-secret --recovery-window-in-days 7 ...
```

2. If it does not exist, prints a no-op message and exits successfully.
   Validation run:

---

# Terminal Output Examples

```bash
# Terminal Output Example - Secret Exists
migrate-secrets-to-aws.sh passed.
migrate-secrets-to-aws.sh --help prints expected usage.
```

---

## Note from codex

- **I did not execute live --remove against AWS.**

**Review**
scripts/migrate-secrets-to-aws.sh

2.  Implemented a Netlify-style env sync script for AWS Secrets Manager, including bulk --remove.

Changed files:

[sync-env-to-aws-secrets-manager.js](../sync-env-to-aws-secrets-manager.js) (line 1)
[package.json](../../package.json) (line 25)

---

**What it does:**

- Reads env vars from .env (or --env-file).
- Syncs them to one AWS Secrets Manager secret as a JSON object.
- --remove deletes keys from AWS that are no longer in your env file.
- --dry-run previews changes without writing.
- Creates the secret if it doesn’t exist yet.

### Usage:

_Run it:_

**Dry run:**

```bash
npm run sync:env:aws:dry-run -- --secret-id <fas-sanity-secret-id> --env-file .env
```

**Live sync:**

```bash
npm run sync:env:aws -- --secret-id <fas-sanity-secret-id> --env-file .env
```

**Live sync with bulk prune:**

```bash
npm run sync:env:aws -- --secret-id <fas-sanity-secret-id> --env-file .env --remove
```

## Notes:

    - Requires AWS CLI auth/config (aws command, profile/region as needed).
    -I validated script CLI/help locally, but didn’t run a live AWS write from here.
````
