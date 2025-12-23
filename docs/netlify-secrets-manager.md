# Netlify Secrets Manager plugin

Netlify pulls oversized build secrets from AWS Secrets Manager via `@netlify/plugin-secrets-manager` (see `netlify.toml`). Use this when an environment variable is larger than Netlify's 4 KB limit (for example, a long `CORS_ALLOW` list).

## Prerequisites

- AWS Secrets Manager secret that contains a JSON object of the env vars you want to expose, e.g. `{"CORS_ALLOW":"https://a.com,https://b.com","ANOTHER_SECRET":"value"}`. Secrets Manager allows values up to 64 KB.
- IAM user or role with `secretsmanager:GetSecretValue`, `secretsmanager:DescribeSecret`, and `secretsmanager:ListSecrets` on the secrets you want to read.
- Add these to Netlify **environment variables** (UI or CLI):
  - `NETLIFY_AWS_ACCESS_KEY_ID`
  - `NETLIFY_AWS_SECRET_ACCESS_KEY`
  - Optional: `NETLIFY_AWS_DEFAULT_REGION` (defaults to `us-east-1`)
  - Optional: `NETLIFY_AWS_SECRET_PREFIX` to control the env var prefix (defaults to `NETLIFY_AWS_SECRET_`)

> Keep AWS credentials out of `.env` files in the repo; set them in Netlify.

## How it works

- On `onPreBuild`, the plugin lists AWS secrets, reads each secret's JSON payload, and injects every key/value as an environment variable with the prefix from `NETLIFY_AWS_SECRET_PREFIX` (default `NETLIFY_AWS_SECRET_`).
- Tags: add a tag `NETLIFY_CONTEXT=<production|deploy-preview|branch-deploy|branch-name>` to scope a secret to specific deploy contexts or branches.
- The injected variables are available during the build and in Netlify Functions (e.g. `process.env.NETLIFY_AWS_SECRET_CORS_ALLOW` if your secret JSON contained `CORS_ALLOW`).
- A small shim (`scripts/aws-secrets-shim.cjs`, loaded via `NODE_OPTIONS`) copies any `NETLIFY_AWS_SECRET_*` values into unprefixed env vars when those are missing, so existing code can keep using names like `CORS_ALLOW`.

## Usage notes

1. Create/update your AWS secret with the JSON payload for the big env var(s).
2. Ensure the Netlify site has the AWS credentials (and optional region/prefix) set.
3. Redeploy; the build output will log which secrets were injected.
4. Update app code to read the prefixed env var names or set a custom prefix via `NETLIFY_AWS_SECRET_PREFIX` to match your naming convention.

Local sanity check (requires valid AWS creds in your shell):

```sh
NETLIFY_AWS_ACCESS_KEY_ID=xxx \
NETLIFY_AWS_SECRET_ACCESS_KEY=yyy \
pnpm exec netlify build
```

This triggers the plugin locally and shows which secrets were made available.
