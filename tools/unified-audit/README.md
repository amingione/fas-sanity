# Unified Mapping Audit Tool

Run from repo root:

```bash
audit run
audit schema
audit contracts
audit env
audit enforcement
audit ci
```

Environment loading example:

```bash
set -a
source .env
set +a
```

Outputs are written to:

```
tools/unified-audit/out/<STAMP>/
```

Enforcement approvals:
- Outputs default to `enforcementApproved: false`.
- After governance review, manually set `enforcementApproved: true` in the relevant JSON outputs.
- Enforcement prompts will STOP unless approval is present.
