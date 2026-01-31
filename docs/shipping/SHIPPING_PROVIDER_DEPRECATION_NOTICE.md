# Shipping Provider Deprecation Notice

Date: 2026-01-29
Scope: fas-sanity and fas-cms-fresh
Status: Effective immediately

Decision
- Shipping provider of record: Shippo only
- Deprecated and forbidden: legacy provider (name removed by policy)
- Backend authority: fas-sanity (Medusa)

Why this exists
- Prevents conflicting shipping logic and schema ambiguity
- Avoids future automation re-enabling legacy paths
- Ensures audits detect a single shipping authority

Policy (Guardrail)
- The legacy provider is deprecated and forbidden.
- No files may reference it once removal is complete.
- Shippo is the sole shipping provider for rates, labels, tracking, and webhooks.

Temporary exception
- This notice and the removal checklist may reference the deprecated provider until cleanup is complete.
- After the final removal pass and verification, delete both documents to satisfy the zero-reference rule.

Owner
- Shipping platform owner: FAS Engineering
- Change authority: fas-sanity repository maintainers

Enforcement
- Any new references to the deprecated provider are a blocking violation.
- Code review must reject any reintroduction, including comments, tests, or docs.
