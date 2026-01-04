# Schema Field Mapping Contract

This repository treats `.docs/reports/field-to-api-map.md` as the canonical, read-only source of truth for Sanity schema ↔ API field mappings.

## Contract Requirements
- All runtime mapping code (Stripe, EasyPost, webhooks, internal APIs) must explicitly reference the canonical map.
- Backfill scripts must explicitly reference the canonical map.
- Schema refactors or migrations must explicitly reference the canonical map.
- Intentional deviations must be documented with a drift acknowledgement.
- Silent drift is forbidden.

## Drift Acknowledgement Pattern
Use this comment when a mapping intentionally diverges from the contract:

```
/**
 * DRIFT ACKNOWLEDGEMENT
 * This mapping intentionally diverges from:
 *   .docs/reports/field-to-api-map.md
 *
 * Reason:
 * - <why the divergence exists>
 *
 * Approved by: <name>
 * Date: YYYY-MM-DD
 */
```

## Read-Only Rule
- Do not modify `.docs/reports/field-to-api-map.md` unless explicitly authorized.
- Runtime code must align to the contract, not the other way around.
