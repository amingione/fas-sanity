#!/usr/bin/env bash
set -euo pipefail

# ---------------- CONFIG ----------------
AWS_REGION="us-east-2"
SITE="fas-sanity"
ENVIRONMENT="prod"

SECRET_NAME="netlify/${SITE}/${ENVIRONMENT}/env"
ENV_FILE=".env"
# ----------------------------------------

if [[ ! -f "$ENV_FILE" ]]; then
  echo "❌ .env file not found in repo root"
  exit 1
fi

echo "Loading .env into shell (non-exported values ignored)…"
set -o allexport
source "$ENV_FILE"
set +o allexport

echo "Parsing .env and building JSON payload…"

SECRET_JSON=$(
  grep -v '^\s*#' "$ENV_FILE" \
  | grep -v '^\s*$' \
  | while IFS='=' read -r key value; do
      clean_key=$(echo "$key" | xargs)
      clean_val=$(printf '%s' "$value" | sed 's/^"\(.*\)"$/\1/' | sed "s/^'\(.*\)'$/\1/")
      printf '"%s":"%s"\n' "$clean_key" "$clean_val"
    done \
  | paste -sd, - \
  | sed 's/^/{/' \
  | sed 's/$/}/'
)

if [[ "$SECRET_JSON" == "{}" ]]; then
  echo "❌ No environment variables found to migrate"
  exit 1
fi

echo "Checking if secret exists → $SECRET_NAME"

if aws secretsmanager describe-secret \
  --secret-id "$SECRET_NAME" \
  --region "$AWS_REGION" >/dev/null 2>&1; then

  echo "Updating existing secret"
  aws secretsmanager put-secret-value \
    --secret-id "$SECRET_NAME" \
    --secret-string "$SECRET_JSON" \
    --region "$AWS_REGION"

else
  echo "Creating new secret"
  aws secretsmanager create-secret \
    --name "$SECRET_NAME" \
    --secret-string "$SECRET_JSON" \
    --region "$AWS_REGION"
fi

echo "✅ All .env keys migrated successfully to AWS Secrets Manager"