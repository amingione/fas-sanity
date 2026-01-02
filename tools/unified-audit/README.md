# Unified Audit Tool

Commands (run from repo root):

```sh
audit run
audit schema
audit contracts
audit env
audit enforcement
audit functions
audit ci
```

Direct invocation (if `audit` is not on your PATH):

```sh
node tools/unified-audit/cli.mjs run
node tools/unified-audit/cli.mjs schema
node tools/unified-audit/cli.mjs contracts
node tools/unified-audit/cli.mjs env
node tools/unified-audit/cli.mjs enforcement
node tools/unified-audit/cli.mjs functions
node tools/unified-audit/cli.mjs ci
```

Environment setup example:

```sh
set -a
source .env
set +a
```

Outputs are written to:

```
tools/unified-audit/out/<STAMP>/
```

Codex prompts are generated under:

```
tools/unified-audit/out/<STAMP>/CODEX-PROMPTS/
```

Enforcement approval:

- After governance review, edit the relevant JSON output(s) to set
  `enforcementApproved: true` before running any enforcement workflow.

Webhook drift + API contracts (tightened rules):

- Webhook handlers are classified by path first (Netlify functions + Next API routes), then by handler + signature + event shape.
- Non-executable sources are excluded (schema/types/UI/tools/tests/lib paths).
- Idempotency findings only fire on verified webhook handlers with side-effects and no guard.
- Unsafe payload access only fires on verified webhook handlers when no validation precedes access.
- API contract checks validate required fields for EasyPost + Resend and report schema mismatches as INFO.

Phased enforcement:

- Webhook drift reports WARN during phase 1 (non-blocking).
- API contract violations remain FAIL (blocking).
- Verdict output includes `phasedEnforcement` to show active phase gates.
