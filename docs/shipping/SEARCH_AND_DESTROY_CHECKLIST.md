# Search-and-Destroy Checklist (Deprecated Provider Removal)

Goal
- Ensure the deprecated shipping provider is fully removed from fas-sanity and fas-cms-fresh.

Hard stop condition
- No repository files contain references to the deprecated provider.

Phase A: Freeze (no schema changes)
- [ ] Disable runtime usage paths (rates, labels, webhooks, tracking) without deleting files.
- [ ] Prevent webhook routes from firing.
- [ ] Prevent label creation endpoints from being callable.
- [ ] Remove runtime imports of the deprecated SDKs where possible.

Phase B: Schema cleanup (requires explicit approval)
- [ ] Remove provider-specific schema fields and types.
- [ ] Replace provider-specific names with provider-agnostic fields.
- [ ] Update schema-driven types and Studio UI to match.

Phase C: Code removal
- [ ] Remove SDK imports, helpers, and services.
- [ ] Remove webhook handlers and rate mappers.
- [ ] Remove scripts, tests, fixtures, and docs.
- [ ] Remove env var references and sample config.

Verification commands
- fas-sanity:
  - `rg -n -i "$DEPRECATED_PROVIDER_PATTERN"`
- fas-cms-fresh:
  - `rg -n -i "$DEPRECATED_PROVIDER_PATTERN" /Users/ambermin/LocalStorm/Workspace/DevProjects/GitHub/fas-cms-fresh`

Post-cleanup
- [ ] Delete this checklist and the deprecation notice to satisfy the zero-reference rule.
- [ ] Re-run the verification commands to confirm 0 matches.
