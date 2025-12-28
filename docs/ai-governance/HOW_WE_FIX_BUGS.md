# How We Fix Bugs (AI-Governed)

## Principle

All fixes follow a strict, repeatable AI governance pipeline to prevent drift,
regressions, and undocumented behavior.

## The Pipeline

1. Gemini — Audit (read-only, facts only)
2. Claude — Decisions (authoritative contract)
3. Codex — Enforcement (execution-only)
4. Verification — Governance lock

## Rules

- No fixes without an audit
- No code without decisions
- No decisions without evidence
- Codex never decides

## File Flow

issue → audit → contract decisions → enforcement → verification

## Maker Commands

- make new-ai-cycle ISSUE=<issue>
- make gemini-<issue>-audit
- make codex-<issue>-fix
- make verify-enforcement
- make ai-pipeline
