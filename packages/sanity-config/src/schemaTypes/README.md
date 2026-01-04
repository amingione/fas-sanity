# Schema Change Guardrails

- Schema changes must be evaluated against `.docs/reports/field-to-api-map.md`.
- Inline schema divergence must be justified and documented.
- Shared object schemas are preferred to reduce drift, but legacy inline shapes are not retroactively enforced.

This directory is governed by the schema ↔ API mapping contract in `.docs/CONTRACTS/schema-field-mapping.md`.
