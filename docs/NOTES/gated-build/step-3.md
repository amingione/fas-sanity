# Step 3: CI Hard Enforcement and Promotion Gate

In this step, we will implement a Continuous Integration (CI) pipeline that enforces AI-generated code quality checks as a hard requirement before merging changes. Additionally, we will set up a promotion gate to control the progression of code from development to production.

## Objectives

- Integrate AI code quality checks into the CI pipeline.
- Fail the CI build if AI checks do not pass.
- Implement a promotion gate to move code between branches/environments only if AI checks are successful.

## Implementation Details

1. **CI Integration**
   - Configure the CI system (e.g., GitHub Actions, Jenkins) to run AI code analysis on every pull request.
   - Use AI tools or scripts to evaluate code quality, style, and security.
   - Set the CI job to fail if AI checks detect issues.

2. **Promotion Gate**
   - Define branch protection rules that require passing CI checks before merging.
   - Automate promotion of code from development to staging/production branches only after successful AI validation.
   - Optionally, notify stakeholders upon promotion or failure.

## Example GitHub Actions Workflow Snippet

```yaml
name: AI Code Quality Check

on:
  pull_request:
    branches:
      - develop

jobs:
  ai-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Run AI Code Quality Analysis
        run: |
          # Run your AI code analysis script/tool here
          ./scripts/ai-code-check.sh
```

## Next Steps

- Customize AI checks based on your project's requirements.
- Monitor and iterate on AI enforcement policies.
- Extend promotion gates to include additional quality or security checks.

# Step 3: CI Hard Enforcement, Drift-as-Fail, and AI Provenance Gates

This step upgrades the AI-gated workflow from **soft enforcement** to **hard CI enforcement**.  
From this point forward, AI audits, schema contracts, and provenance artifacts are **mandatory** for merge and promotion.

This step is intentionally strict.

---

## Objectives

- Treat **schema/API drift as a CI failure**
- Require **AI provenance artifacts** for any AI-assisted change
- Enforce **promotion gates** (autoTest → main) backed by AI validation
- Prevent silent or manual bypass of AI-reviewed changes

---

## Enforcement Scope

This step applies to:

- Pull requests targeting `main`
- Pull requests targeting `release/*`
- Promotions from `autoTest/*` to `main`

It does **not** apply to:

- Documentation-only changes outside runtime paths
- Emergency hotfix branches (explicitly exempted by label)

---

## 1. Drift-as-Fail Logic (Hard Enforcement)

### Rule

Any detected drift between runtime code and the canonical mapping contract **FAILS CI**.

Canonical source of truth:

```
.docs/reports/field-to-api-map.md
```

### Drift Conditions That Fail CI

- New string fields not present in the contract
- Removed fields without acknowledgement
- Renamed field paths
- Runtime mapping to non-canonical schema paths
- Silent divergence without a DRIFT ACKNOWLEDGEMENT

### CI Command

```bash
pnpm exec node scripts/check-schema-drift.mjs --mode=ci
```

Expected behavior:

- Exit code `1` on any drift
- Output links to offending files and contract paths

---

## 2. AI Provenance Enforcement

### Rule

Any PR that modifies runtime code, schemas, or backfill scripts **must include AI provenance**.

### Required Artifacts

The following **must exist** in the PR context:

```
.ai-stack-trace/<task>/
  contract/APPROVED
  codex/audit/
  claude/review/
  gemini/audit/
  final/status.json
```

### Provenance Validation Checks

CI must verify:

- `APPROVED` exists and matches base SHA
- `final/status.json.status === "SUCCESS"`
- Files changed match the approved scope
- No additional files modified outside contract

If any check fails → CI FAILS.

---

## 3. AI Provenance Validator Script

Introduce (or extend):

```
scripts/ai-gated/verify-provenance.mjs
```

Responsibilities:

- Parse `.ai-stack-trace/<task>/final/status.json`
- Compare approved scope vs actual diff
- Assert mapping references to contract
- Emit structured failure output

---

## 4. Promotion Gate Logic

### Branch Flow

```
autoTest/<task>  →  main
```

### Promotion Requirements

Promotion is allowed **only if**:

- All CI checks pass
- Drift check passes
- AI provenance validator passes
- No unapproved changes detected
- No schema changes without explicit approval

Manual merges are disabled.

---

## 5. Example GitHub Actions Workflow (Hardened)

```yaml
name: AI Gated CI

on:
  pull_request:
    branches:
      - main

jobs:
  ai-gated-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install dependencies
        run: pnpm install

      - name: Verify AI Provenance
        run: pnpm exec node scripts/ai-gated/verify-provenance.mjs

      - name: Enforce Schema Contract (Drift = Fail)
        run: pnpm exec node scripts/check-schema-drift.mjs --mode=ci

      - name: Run Tests
        run: pnpm test
```

---

## 6. Human Override (Rare, Logged)

Overrides require:

- `override:ai-gated` label
- Signed justification comment
- CI artifact retention

Overrides are logged and auditable.

---

## 7. Failure Semantics

On failure:

- Merge is blocked
- No auto-promotion
- Rollback remains available
- `.ai-stack-trace` remains immutable

---

## Summary

At the end of Step 3:

- Drift is no longer tolerated
- AI-assisted changes are provable
- Promotions are gated by contracts
- Silent regression paths are closed

This step completes the transition from **AI-assisted development** to **AI-governed delivery**.

---
