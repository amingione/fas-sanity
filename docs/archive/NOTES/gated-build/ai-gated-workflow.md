PROMPT / INSTRUCTIONS (copy–paste ready)

# AI-GATED FLOW — MANUAL TEST INSTRUCTIONS (AUDIT-ONLY)

This document defines the exact steps to test the new AI-gated workflow **without allowing implementation, schema changes, or deployment**.

---

## GOAL

Validate that the AI-gated system:

- Runs audits correctly
- Produces traceable artifacts
- Stops before implementation
- Requires explicit human approval to proceed

This test is **audit-only**.

---

## PREREQUISITES

- You are on a clean branch (recommended: `ai-test/vendor-portal-polish`)
- No schema changes are approved
- No implementation is allowed
- pnpm is installed and active
- Codex, Gemini, and Claude CLIs are available

---

## STEP 1 — PREPARE PROMPT

Create the task prompt file:

docs/ai-gated/vendor-portal-polish/prompt.md

Content should describe:

- Dual-repo audit (fas-cms-fresh + fas-sanity)
- FASauth, email origination, vendor lifecycle
- Explicitly state **NO IMPLEMENTATION**
- Explicitly state **NO SCHEMA CHANGES**

---

## STEP 2 — RUN AUDIT-ONLY AI FLOW

From repo root:

```bash
pnpm run ai:gated --task vendor-portal-polish --prompt docs/ai-gated/vendor-portal-polish/prompt.md

Expected behavior:
	•	AI runs audits only
	•	No files outside docs change
	•	No schemas touched
	•	No tests executed
	•	No deploy triggered

⸻

STEP 3 — VERIFY ARTIFACTS

Confirm the following structure exists:

.ai-stack-trace/vendor-portal-polish/
  codex/audit/
  gemini/audit/
  claude/review/
  logs/
  final/status.json

Verify:
	•	status.json.status !== "APPLIED"
	•	Logs indicate audit-only
	•	No APPROVED contract exists yet

⸻

STEP 4 — VERIFY SAFETY STOPS

Confirm:
	•	Codex did not run apply logic
	•	Codex did not run tests
	•	Codex did not deploy
	•	Drift check ran in non-blocking mode
	•	CI did not fail

If any of the above occurred → STOP AND FIX FLOW

⸻

STEP 5 — HUMAN REVIEW

Manually review:
	•	Audit findings
	•	Sender Ownership Matrix
	•	Vendor auth findings
	•	Schema gaps (not applied)

Decide whether:
	•	To approve decisions
	•	To request revisions
	•	To abandon task

⸻

STEP 6 — DO NOT APPROVE YET

For this test:
	•	❌ Do NOT run pnpm run ai:approve
	•	❌ Do NOT run pnpm run ai:apply
	•	❌ Do NOT deploy

This confirms the gating works.

⸻

SUCCESS CRITERIA

This test passes if:
	•	AI produced audits and plans
	•	No code changed
	•	No schemas changed
	•	No tests ran
	•	No deploy ran
	•	All artifacts are logged and traceable

⸻

NEXT STEPS (AFTER TEST)

Only after successful audit-only test may you:
	1.	Approve decisions explicitly
	2.	Generate APPROVED contract
	3.	Allow Codex to apply changes
	4.	Run tests
	5.	Deploy to autoTest

⸻

IMPORTANT RULE

Audit ≠ Approval ≠ Implementation

Each phase must be explicitly triggered.


```
