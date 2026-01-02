# Mapping Tool Notes

This folder houses the mapping tool prompts and audit guidance used by the unified audit scanner.

Webhook + contract scanner summary:

- Webhook handlers are identified by strict path + handler/signature/event shape checks.
- Schema/types/UI/tools/scripts/lib paths are excluded to avoid false positives.
- Idempotency is only flagged for webhook handlers with side-effects and no guard.
- Unsafe payload access is only flagged when payload usage precedes validation.
- EasyPost and Resend API calls are checked for required fields; schema mismatches are INFO only.

Outputs:

- `tools/unified-audit/out/<STAMP>/webhook-drift-report.json`
- `tools/unified-audit/out/<STAMP>/api-contract-violations.json`

See `docs/mappingTool/claudePrompt/codex-mapping-tighten.md` for the full implementation guide.
