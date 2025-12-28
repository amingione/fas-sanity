# Codex-Only Bootstrap Audit (fas-sanity)

Issue: codex-only-bootstrap
Repo: fas-sanity (authoritative governance + schemas)
Date: 2025-12-27

## Scope
- Inspect schema authority boundaries.
- Identify where fas-sanity must remain authoritative.
- Identify runtime assumptions leaking into schema logic.

## Sources inspected (read-only)
- packages/sanity-config/src/schemaTypes/index.ts
- packages/sanity-config/src/schemaTypes/documents/
- packages/sanity-config/src/schemaTypes/objects/
- packages/sanity-config/src/schemaTypes/documentActions/
- packages/sanity-config/src/runtimeEnvBootstrap.ts
- packages/sanity-config/src/server/stripe-analytics.ts
- packages/sanity-config/src/utils/

## Authority boundaries (must remain authoritative in fas-sanity)
- Schema type definitions in `packages/sanity-config/src/schemaTypes/**` define all document/object fields, types, and validation rules.
- `packages/sanity-config/src/schemaTypes/index.ts` is the canonical registry of schema types; downstream repos must not invent or mutate fields.
- Document actions in `packages/sanity-config/src/schemaTypes/documentActions/**` are part of the Studio contract and should remain owned by fas-sanity.
- Sanity Studio structure and utilities in `packages/sanity-config/src/structure/**` and `packages/sanity-config/src/utils/**` encode authoritative editor workflows tied to schemas.

## Runtime assumptions leaking into schema logic
- `packages/sanity-config/src/runtimeEnvBootstrap.ts` injects runtime env into global scope; this is runtime behavior inside the schema repo and should be treated as a boundary.
- `packages/sanity-config/src/server/stripe-analytics.ts` pulls Stripe data using runtime secrets; this is operational/runtime behavior co-located with schema logic.
- Document actions and utilities reference runtime env and external services (e.g., Netlify base resolution) which couples schema repo behavior to deployment/runtime state.

## Risks / observations
- Schema repo contains operational logic (Stripe analytics, Netlify helpers, env bootstrapping). These should be treated as runtime boundaries and excluded from consumer repo changes.
- Any downstream assumptions about schema fields in fas-cms must be validated against `packages/sanity-config/src/schemaTypes/**` as the source of truth.

## Audit outcome
- fas-sanity is authoritative for all schema definitions and Studio-side document actions/utilities.
- Runtime integrations found in fas-sanity are boundary-sensitive; they should not be altered by fas-cms and should only change under Codex governance.

## Next enforcement focus
- Enforce schema-first rule: consumer repo changes must align to `packages/sanity-config/src/schemaTypes/**`.
- Flag any runtime-only logic attempted in fas-sanity as a governance violation.
