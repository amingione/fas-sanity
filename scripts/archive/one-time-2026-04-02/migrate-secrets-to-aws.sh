#!/usr/bin/env bash
set -euo pipefail

# ---------------- CONFIG ----------------
AWS_REGION="us-east-2"
SITE="fas-sanity"
ENVIRONMENT="prod"

SECRET_NAME="netlify/${SITE}/${ENVIRONMENT}/env"
ENV_FILE=".env"
# ----------------------------------------

print_usage() {
  cat <<EOF
Usage: ./scripts/migrate-secrets-to-aws.sh [--dry-run] [--remove]

Options:
  --dry-run  Print intended actions without writing to AWS.
  --remove   Delete the configured AWS Secrets Manager secret.
  -h, --help Show this help message.
EOF
}

REMOVE_SECRET=false
DRY_RUN=false

for arg in "$@"; do
  case "$arg" in
    --dry-run)
      DRY_RUN=true
      ;;
    --remove)
      REMOVE_SECRET=true
      ;;
    -h|--help)
      print_usage
      exit 0
      ;;
    *)
      echo "❌ Unknown argument: $arg"
      print_usage
      exit 1
      ;;
  esac
done

if [[ "$REMOVE_SECRET" == "true" ]]; then
  echo "Checking if secret exists → $SECRET_NAME"

  if aws secretsmanager describe-secret \
    --secret-id "$SECRET_NAME" \
    --region "$AWS_REGION" >/dev/null 2>&1; then

    if [[ "$DRY_RUN" == "true" ]]; then
      echo "[DRY RUN] Would schedule secret deletion (7-day recovery window): $SECRET_NAME"
    else
      echo "Scheduling secret deletion (7-day recovery window)"
      aws secretsmanager delete-secret \
        --secret-id "$SECRET_NAME" \
        --recovery-window-in-days 7 \
        --region "$AWS_REGION"

      echo "✅ Secret scheduled for deletion: $SECRET_NAME"
    fi
  else
    echo "ℹ️ Secret not found, nothing to remove: $SECRET_NAME"
  fi

  exit 0
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "❌ .env file not found in repo root"
  exit 1
fi

echo "Parsing .env and building JSON payload…"

SECRET_JSON=$(pnpm exec tsx scripts/serialize-secrets.ts "$ENV_FILE")

if [[ "$SECRET_JSON" == "{}" ]]; then
  echo "❌ No environment variables found to migrate"
  exit 1
fi

echo "Checking if secret exists → $SECRET_NAME"

if aws secretsmanager describe-secret \
  --secret-id "$SECRET_NAME" \
  --region "$AWS_REGION" >/dev/null 2>&1; then

  if [[ "$DRY_RUN" == "true" ]]; then
    echo "[DRY RUN] Would update existing secret: $SECRET_NAME"
  else
    echo "Updating existing secret"
    aws secretsmanager put-secret-value \
      --secret-id "$SECRET_NAME" \
      --secret-string "$SECRET_JSON" \
      --region "$AWS_REGION"
  fi

else
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "[DRY RUN] Would create new secret: $SECRET_NAME"
  else
    echo "Creating new secret"
    aws secretsmanager create-secret \
      --name "$SECRET_NAME" \
      --secret-string "$SECRET_JSON" \
      --region "$AWS_REGION"
  fi
fi

if [[ "$DRY_RUN" == "true" ]]; then
  echo "✅ Dry run complete. No AWS changes were made."
else
  echo "✅ All .env keys migrated successfully to AWS Secrets Manager"
fi
