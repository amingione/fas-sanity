# Sanity <=> Medusa Test Plan

Testing checklist for Sanity/Medusa sync behavior.

## Product Sync

### Unit
- Run: `npm run contract:test:transforms`
- Expect: tests pass.
- Verifies: Sanity/Medusa/canonical transforms are correct.

### Integration
- Run: `npm run sync:products:dry`
- Expect: dry-run output with proposed changes.
- Verifies: end-to-end product sync pipeline.

## Customer Sync
- Tests pending.

## Orders + Fulfillment Sync
- Tests pending.
