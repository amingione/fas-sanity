# Unified Audit Tool

Commands (run from repo root):

```sh
audit run
audit schema
audit contracts
audit env
audit enforcement
audit ci
```

Direct invocation (if `audit` is not on your PATH):

```sh
node tools/unified-audit/cli.mjs run
node tools/unified-audit/cli.mjs schema
node tools/unified-audit/cli.mjs contracts
node tools/unified-audit/cli.mjs env
node tools/unified-audit/cli.mjs enforcement
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
