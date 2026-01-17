PHASE 3: EXECUTION (WITH FULL GOVERNANCE)
ONLY IF approval-contract.md EXISTS AND IS VERIFIED:

CREATE SNAPSHOT

{repo}/codex/snapshots/pre-{task-id}.json

- Git commit hash
- All affected file checksums
- Current schema state
- API mapping state

RUN AUDIT

{repo}/codex/audit/ → generate detailed pre-execution audit

- File integrity checks
- Schema validity
- Guard rule checks
- Cross-repo impact simulation

RUN GUARDS

{repo}/docs/ai-governance/guards/\*.md

- no-easypost-in-storefront.md
- no-parcelcraft-in-sanity.md
- [all relevant guards]

If ANY guard fails → STOP, do not proceed

EXECUTE CHANGES

Make the exact changes in the approval contract

- No additions
- No "optimizations"
- No schema "cleanups"
- Exactly as planned

GENERATE DIFF

{repo}/codex/apply/changes.diff

- Exact git diff of all changes
- Line-by-line accountability

RUN POST-EXECUTION TESTS

{repo}/codex/apply/

- Run lint: pnpm run lint
- Run types: pnpm run type-check
- Run tests: pnpm run test

All must pass. If any fail → STOP before logging

LOG EVERYTHING

{repo}/codex/logs/{task-id}.log

- apply.log
- audit.log
- enforce.log
- test.log

Include:

- Start time
- Every file touched
- Every schema change
- Every guard rule checked
- All test results
- End time
- Status: SUCCESS or FAILED

CREATE FINAL REPORT

{repo}/codex/final/output.md

- Summary of all changes
- Before/after state
- Verification checklist results
- All logs linked
- Confirmation: "All governance rules enforced"
