\*\*Below is everything you asked for, packaged cleanly and ready to drop into Step 2 of your AI-gated system.

This assumes Step 1 is already in place (runner + rollback scaffolding) and that Option A is active (existing codex, gemini, claude CLIs).

Nothing here auto-runs.
Everything is human-approved, auditable, rollback-safe.\*\*

⸻

✅ STEP 2 — CODEX PROMPT

Apply + Test + Deploy (AI-Gated, Contract-Enforced)

Purpose:
Allow Codex to apply fixes only after approval, run tests, deploy to autoTest/<task>, and record a full AI stack trace.

⸻

📄 FILE: docs/ai-gated/step-2-codex-prompt.md

# CODEX PROMPT — STEP 2: APPLY, TEST, DEPLOY (AI-GATED)

Mode: PATCH  
Scope: Contract-approved fixes only  
Repo: fas-sanity  
Branch: autoTest/<task>

---

## TEMPORARY ROLE & RULESET (STEP 2 ONLY)

You are acting as **AI Change Executor**.

You MUST:

- Apply only fixes explicitly approved by the human
- Follow the approved contract verbatim
- Run tests after changes
- Abort on failure
- Record everything

You MUST NOT:

- Invent new fixes
- Expand scope
- Modify schemas unless explicitly approved
- Silence warnings or failures
- Auto-approve anything

---

## INPUTS (REQUIRED)

You will receive:

1. Approved contract file:
   `.ai-stack-trace/<task>/contract/APPROVED`

2. Audit + plan artifacts:
   - `.ai-stack-trace/<task>/codex/audit/*.md`
   - `.ai-stack-trace/<task>/claude/review/*.md`
   - `.ai-stack-trace/<task>/gemini/audit/*.md`

3. Canonical mapping contract:
   `.docs/reports/field-to-api-map.md`

---

## EXECUTION PHASES

### Phase 1 — Verify Approval

- Confirm APPROVED file exists
- Confirm task name and base SHA match
- If mismatch → ABORT

---

### Phase 2 — Apply Fixes

- Apply **only** changes listed in approved contract
- All changes must:
  - Reference `.docs/reports/field-to-api-map.md`
  - Respect drift acknowledgements
- No silent schema drift
- No runtime shortcuts

Log:

.ai-stack-trace//logs/apply.log

---

### Phase 3 — Run Tests

Run, in order:

````bash
pnpm test || exit 1
pnpm run lint || exit 1
pnpm exec node scripts/check-schema-drift.mjs || true

Notes:
	•	Drift check is WARN-only
	•	Any test failure → abort and rollback eligible

Log:

.ai-stack-trace/<task>/logs/tests.log


⸻

Phase 4 — Deploy

If and only if tests pass:
	•	Push branch autoTest/<task>
	•	Deploy to autoTest environment
	•	Do NOT merge to main

Log:

.ai-stack-trace/<task>/logs/deploy.log


⸻

Phase 5 — Final Report

Write:

.ai-stack-trace/<task>/final/status.json

Including:
	•	files changed
	•	tests run
	•	warnings
	•	deploy URL
	•	commit SHA

⸻

FAILURE HANDLING

On ANY failure:
	•	Stop immediately
	•	Do not retry
	•	Leave rollback available
	•	Write failure reason to:
.ai-stack-trace/<task>/final/FAILED.md

⸻

STOP CONDITION

After final report:
	•	STOP
	•	Do not continue
	•	Wait for human instruction

⸻

END OF STEP 2 PROMPT

---

# 📜 STANDARD APPROVAL CONTRACT TEMPLATE

## 📄 FILE:
`.ai-stack-trace/<task>/contract/approval.md`

```md
# AI CHANGE APPROVAL CONTRACT

Task: <task-name>
Repository: fas-sanity
Base SHA: <sha>
Date: YYYY-MM-DD

---

## APPROVED SCOPE

The following changes are explicitly approved:

- [ ] Schema changes:
  - (list or NONE)

- [ ] Runtime code changes:
  - (list files + intent)

- [ ] Backfill scripts:
  - (list or NONE)

- [ ] Documentation-only changes:
  - (list)

---

## EXPLICITLY NOT APPROVED

- Any schema changes not listed above
- Any new fields or mappings not documented in:
  `.docs/reports/field-to-api-map.md`
- Any new vendor capabilities
- Any authentication bypasses

---

## DRIFT ACKNOWLEDGEMENTS

(List any intentional drift and justification)

---

## HUMAN APPROVAL

I approve the above scope and authorize Codex to apply changes.

Name: ____________________
Signature: _______________
Date: ____________________

---

## MACHINE GATE FILE

Create a file named:

APPROVED

With contents:

APPROVED::

This file is required for execution.


⸻

📁 “AI STACK TRACE” README

📄 FILE: .ai-stack-trace/README.md

# AI Stack Trace System

This directory records **everything** an AI did during a gated task.

It is:
- Not committed to git
- Human-triggered
- Fully auditable
- Rollback-safe

---

## DIRECTORY STRUCTURE

.ai-stack-trace//
plan/            # Human prompt + scope
gemini/audit/    # Structural & consistency audit
claude/review/   # Risk, reasoning, validation
codex/audit/     # Fix planning
codex/apply/     # Applied diffs (logs)
contract/        # Approval artifacts
enforce/         # Mapping assertions
logs/            # Execution logs
snapshots/       # Git + env snapshots
final/           # Status & outcome

---

## WHAT GOES HERE

- Prompts sent to AI tools
- AI outputs
- Decisions
- Applied changes
- Test results
- Deployment info
- Failures

---

## WHY THIS EXISTS

- Trace regressions
- Audit AI behavior
- Prove intent vs execution
- Enable safe automation
- Prevent silent drift

---

## NEVER EDIT HISTORY

Each task is append-only.
Do not modify past stack traces.


⸻

🔐 THREAT MODEL — AI-APPLIED PATCHES

📄 FILE: docs/ai-gated/threat-model.md

# Threat Model: AI-Applied Patches

This document defines risks and mitigations for AI-driven code changes.

---

## PRIMARY RISKS

### 1. Silent Schema Drift
AI adds or modifies schema fields without visibility.

Mitigation:
- Read-only schema mapping contract
- Drift detection
- Approval gate

---

### 2. Overreach / Scope Creep
AI fixes “related” issues beyond the task.

Mitigation:
- Explicit approval contract
- Scoped prompts
- Abort-on-violation rule

---

### 3. Regression Introduction
AI changes break unrelated functionality.

Mitigation:
- Mandatory tests
- autoTest deployment
- Rollback snapshot

---

### 4. Credential or Token Exposure
AI logs secrets or mishandles credentials.

Mitigation:
- No secret echoing
- No env mutation
- CI secret scanning remains enabled

---

### 5. Non-Deterministic Output
AI output varies between runs.

Mitigation:
- Single-run per approval
- Immutable logs
- Human checkpoint

---

## ACCEPTED RISKS

- WARN-only drift during early enforcement
- Test data inconsistencies
- Non-blocking schema warnings

---

## HARD STOPS

Any of the following immediately abort execution:
- Missing approval
- Schema change without approval
- Test failure
- Mapping contract violation
- Unhandled exception

---

## CONCLUSION

AI is treated as a **power tool**, not an authority.
Humans retain final control.


⸻

✅ WHAT YOU NOW HAVE

You now have:

✔ Step 2 Codex apply/test/deploy prompt
✔ Approval contract template
✔ AI stack trace documentation
✔ Formal threat model
✔ Rollback-safe, human-controlled automation

This is enterprise-grade AI change management.

````
