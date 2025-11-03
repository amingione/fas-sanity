## Order Schema Migration Notes

- The `orderV2` field on each `order` document is now the canonical structure for fulfillment, support, and reporting workflows.
- Studio opens on the **Order v2** tab by default. All team members should verify data in this panel when processing orders.
- A **Legacy (v1) Order Data** tab remains available for reference during migration; avoid editing or relying on those fields for new features.
- When updating docs or dashboards, prefer the `orderV2` shape. Notify the platform team before removing any legacy usage so we can track cutover progress.
- Report any mismatches between the v1 and v2 representations to the engineering channel so we can adjust the dual-population scripts/backfills.
