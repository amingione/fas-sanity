# Codex-Only Bootstrap Contract Decisions (fas-sanity)

Issue: codex-only-bootstrap
Repo: fas-sanity
Date: 2025-12-27

## Authority statement
- fas-sanity is the authoritative source of schema truth and Studio governance.
- Codex is the sole agent authorized to produce governance artifacts and enforcement changes for this issue.

## Allowed change scope (future enforcement)
- Schema definitions and registries under `packages/sanity-config/src/schemaTypes/**` and `packages/sanity-config/src/schemaTypes/index.ts`.
- Studio-only presentation/structure under `packages/sanity-config/src/structure/**` when it reflects schema truth.
- Documentation and governance artifacts under `docs/ai-governance/**`, `docs/prompts/**`, `docs/reports/**`.

## Forbidden changes
- Any runtime/business logic outside schema definition boundaries, including server integrations and analytics logic.
- Any changes to fas-cms or any consumer runtime code.
- Any schema changes driven by runtime assumptions from fas-cms.
- Any new dependencies or tooling changes not explicitly approved.

## File boundaries (contract)
- Authoritative schema boundary: `packages/sanity-config/src/schemaTypes/**`.
- Studio structure boundary: `packages/sanity-config/src/structure/**`.
- Runtime boundary (no changes without explicit approval): `packages/sanity-config/src/server/**`, `packages/sanity-config/src/utils/**`, `packages/sanity-config/src/runtimeEnvBootstrap.ts`.
- Governance artifacts: `docs/ai-governance/**`, `docs/prompts/**`, `docs/reports/**`.

## Codex authority rules
- Codex-only execution; no Gemini/Claude involvement for audits, decisions, or enforcement.
- Any enforcement must start from the latest audit and contract decision artifacts in `docs/reports/`.
- Cross-repo changes require dual-repo audits and contract decisions before modifications.
- If a change crosses the runtime boundary in fas-sanity, stop and request explicit approval.
