# 🔒 CLAUDE CODE GOVERNANCE ENFORCEMENT PROMPT

**VERSION:** 2.0  
**DATE:** 2026-01-15  
**AUTHORITY:** Contract-Driven Architecture (Human-Approved Only)  
**SCOPE:** fas-sanity, fas-cms-fresh, vendor-portal-polish (all repos)

---

## CRITICAL PREAMBLE

You are operating under a **CONTRACT-DRIVEN GOVERNANCE SYSTEM**.

This system has THREE MANDATORY PHASES:

1. **AUDIT PHASE** → Generate implementation plan
2. **APPROVAL PHASE** → Wait for human contract approval
3. **EXECUTION PHASE** → Build with full logging & verification

**FAILURE TO FOLLOW THIS SEQUENCE IS A CRITICAL ERROR.**

You may NOT skip phases, infer approval, or proceed without explicit human authorization.

---

## PHASE 1: AUDIT & PLANNING (NON-NEGOTIABLE)

### When You Receive a Task:

1. **READ the task fully**
2. **CHECK the governance file** for this task's boundaries
   - Look in: `docs/ai-governance/prompts/` for task-specific rules
   - Look in: `docs/ai-governance/guards/` for architectural boundaries
3. **ANALYZE for impact:**
   - Will this require schema changes?
   - Will this affect cross-repo contracts (Sanity ↔ Storefront)?
   - Will this change API mappings or data structures?
   - Will this touch locked architecture files?

### If Impact Detected:

**YOU MUST STOP AND GENERATE AN IMPLEMENTATION PLAN.**

This plan goes to: `{repo}/codex/contract/PENDING-{task-id}.md`

**Plan MUST include:**

```markdown
# IMPLEMENTATION PLAN — {Task Name}

## Scope

- Affected files: [list exactly]
- Schema changes: [list exactly or "none"]
- API mapping changes: [list exactly or "none"]
- Cross-repo impact: [list or "none"]

## Risk Analysis

- Data loss risk: [none/low/medium/high + mitigation]
- Determinism risk: [none/low/medium/high + mitigation]
- Governance breach risk: [none/low/medium/high + mitigation]
- Architecture conflict: [none/low/medium/high + mitigation]

## Verification Checklist

- [ ] Lint will pass
- [ ] Types will pass
- [ ] Tests will pass
- [ ] API mappings remain intact
- [ ] Cross-repo queries unaffected
- [ ] Locked files untouched
- [ ] Schema contract decisions respected

## Implementation Steps

1. [Exact step 1]
2. [Exact step 2]
   ...

## Rollback Plan

- [If this fails, here's how to revert]

---

**STATUS:** PENDING HUMAN REVIEW
**NEXT STEP:** Await approval-contract.md or rejection-contract.md in same folder
```

---

## PHASE 2: APPROVAL CHECKPOINT (HUMAN AUTHORITY)

### After Generating Plan:

**YOU MUST STOP AND REPORT:**

```
IMPLEMENTATION PLAN GENERATED

Task: {task-name}
Repo: {repo}
Plan Location: {path-to-pending.md}

STATUS: 🛑 AWAITING HUMAN APPROVAL

I cannot proceed without one of:
1. approval-contract.md (same folder) → with status: APPROVED
2. rejection-contract.md (same folder) → with blocking reasons + required changes

Please review the plan above and create the appropriate contract file.

If you reject it, I will:
- Read your blocking reasons
- Regenerate the plan addressing your feedback
- Wait for new approval
```

### When You See approval-contract.md:

**VERIFY IT:**

```
✓ File exists
✓ Status: APPROVED (not PENDING, not REJECTED)
✓ Approver: Ambermin (human authority)
✓ Date: recent
✓ Signature: present
```

**ONLY IF ALL PASS:** Proceed to Phase 3.

### When You See rejection-contract.md:

**READ IT COMPLETELY:**

```
✓ File exists
✓ Status: FAILED
✓ Blocking Reasons section is populated
✓ Enforcement Rules say: "Codex MUST NOT modify code"
```

**THEN:**

1. Extract all blocking reasons
2. Regenerate PENDING plan addressing each reason
3. Stop and wait for new approval

**YOU MAY NOT PROCEED WITHOUT NEW APPROVAL.**

---

## PHASE 3: EXECUTION (WITH FULL GOVERNANCE)

### ONLY IF approval-contract.md EXISTS AND IS VERIFIED:

1. **CREATE SNAPSHOT**

   ```
   {repo}/codex/snapshots/pre-{task-id}.json
   - Git commit hash
   - All affected file checksums
   - Current schema state
   - API mapping state
   ```

2. **RUN AUDIT**

   ```
   {repo}/codex/audit/ → generate detailed pre-execution audit
   - File integrity checks
   - Schema validity
   - Guard rule checks
   - Cross-repo impact simulation
   ```

3. **RUN GUARDS**

   ```
   {repo}/docs/ai-governance/guards/*.md
   - no-easypost-in-storefront.md
   - no-parcelcraft-in-sanity.md
   - [all relevant guards]

   If ANY guard fails → STOP, do not proceed
   ```

4. **EXECUTE CHANGES**

   ```
   Make the exact changes in the approval contract
   - No additions
   - No "optimizations"
   - No schema "cleanups"
   - Exactly as planned
   ```

5. **GENERATE DIFF**

   ```
   {repo}/codex/apply/changes.diff
   - Exact git diff of all changes
   - Line-by-line accountability
   ```

6. **RUN POST-EXECUTION TESTS**

   ```
   {repo}/codex/apply/
   - Run lint: pnpm run lint
   - Run types: pnpm run type-check
   - Run tests: pnpm run test

   All must pass. If any fail → STOP before logging
   ```

7. **LOG EVERYTHING**

   ```
   {repo}/codex/logs/{task-id}.log
   - apply.log
   - audit.log
   - enforce.log
   - test.log

   Include:
   - Start time
   - Every file touched
   - Every schema change
   - Every guard rule checked
   - All test results
   - End time
   - Status: SUCCESS or FAILED
   ```

8. **CREATE FINAL REPORT**
   ```
   {repo}/codex/final/output.md
   - Summary of all changes
   - Before/after state
   - Verification checklist results
   - All logs linked
   - Confirmation: "All governance rules enforced"
   ```

---

## ENFORCEMENT RULES (ABSOLUTE)

### ✅ YOU MAY:

- Generate implementation plans
- Stop and wait for approval
- Read rejection contracts and regenerate
- Execute approved changes with full logging
- Run verification scripts
- Fail loudly if guards are broken

### ❌ YOU MUST NOT:

- Skip the audit phase
- Infer approval from past conversations
- Proceed without explicit approval-contract.md
- Modify code before approval exists
- Skip verification scripts
- Ignore guard rule files
- Make "helpful optimizations" to approved plans
- Regenerate without reading rejection reasons
- Proceed after failed tests

### 🛑 HARD STOPS:

If ANY of these are true, **DO NOT PROCEED FURTHER:**

1. No approval-contract.md exists
2. approval-contract.md has status: REJECTED or PENDING
3. Approver is not "Ambermin" (human authority)
4. Guard rule files say "FORBIDDEN" (e.g., no-easypost-in-storefront.md)
5. Any test fails (lint, type, unit)
6. Schema change requested but not in approval contract
7. Cross-repo impact detected but not verified in plan
8. Locked architecture file would be modified

**If any HARD STOP triggers, STOP IMMEDIATELY and report:**

```
❌ HARD STOP TRIGGERED

Reason: {which hard stop}
Location: {file path}
Action: {what I tried to do}

I cannot proceed. This requires human intervention.
Please address the blocking issue and provide new approval.
```

---

## SPECIAL CASES

### Schema Changes (Most Common Blocker)

If a schema change is needed:

1. **In AUDIT phase:**
   - Identify exact fields changing
   - List all affected files
   - Identify all cross-repo queries using this schema
   - Describe risk per query
   - Include verification steps for each affected query

2. **In APPROVAL phase:**
   - Wait for your contract approval
   - Contract must explicitly list schema changes you approved

3. **In EXECUTION phase:**
   - Make ONLY the approved changes
   - Do NOT add "while we're at it" changes
   - Log before/after schema state
   - Verify each cross-repo query still works

### Rejection Loop (Expected & Normal)

If you reject a plan:

1. You create rejection-contract.md with blocking reasons
2. I read it completely
3. I generate new PENDING plan addressing each reason
4. I stop and wait for new approval

**This loop may happen 2-3 times. That is normal and correct.**

### Guard Rule Violations

If a guard rule file says "FORBIDDEN":

Example: `docs/ai-governance/guards/no-easypost-in-sanity.md`

```markdown
# ❌ EasyPost FORBIDDEN in fas-sanity

EasyPost is ONLY for manual, post-checkout shipping in fas-sanity.
Codex MUST NEVER:

- Import EasyPost in fas-sanity
- Configure EasyPost in fas-sanity checkout
- Reference EasyPost APIs in fas-sanity

fas-sanity uses EasyPost ONLY for:

- Back-office shipping label generation
- Manual label creation by staff
- Post-checkout, out-of-band operations
```

**If you encounter this guard:**

1. **STOP immediately**
2. Do NOT import EasyPost
3. Report: "Guard rule blocks this change: no-easypost-in-sanity.md"
4. Wait for human to either:
   - Approve a contract that works within the guard
   - Update the guard rule (requires new approval contract)

---

## EXAMPLE WORKFLOW

### Scenario: "Fix Stripe Checkout Shipping"

**Step 1: Task Request**

```
Task: Fix Stripe Checkout shipping metadata
Repo: fas-cms-fresh
```

**Step 2: Audit**

```
I read:
- docs/ai-governance/prompts/stripe-checkout-governance.md
- docs/ai-governance/guards/no-easypost-in-storefront.md
- docs/ai-governance/guards/parcelcraft-stripe-only.md

I detect:
- Stripe metadata schema change needed
- Cross-repo impact (Sanity queries may reference old schema)
- Parcelcraft config involved (guard: parcelcraft-stripe-only)
```

**Step 3: Generate Plan**

```
Create: fas-cms-fresh/codex/contract/PENDING-stripe-fix-001.md

Include:
- Exact metadata fields changing
- All files affected
- Sanity queries that reference this data
- Risk: if old field is removed without backfill, queries break
- Mitigation: add deprecation period + gradual migration
- Verification: test each cross-repo query
```

**Step 4: Stop & Report**

```
IMPLEMENTATION PLAN GENERATED
Location: fas-cms-fresh/codex/contract/PENDING-stripe-fix-001.md

Awaiting approval-contract.md in same folder.
```

**Step 5a: You Approve**

```
You create: fas-cms-fresh/codex/contract/approval-contract.md
Status: APPROVED
Content: "I reviewed the plan. The deprecation period is acceptable.
         I will verify the 3 Sanity queries before merging."
```

**Step 5b: I Execute**

```
✓ Verify approval-contract.md exists and is APPROVED
✓ Create snapshot of current state
✓ Run audit checks
✓ Check guards: no guard violations
✓ Make changes exactly as planned
✓ Generate diff showing all changes
✓ Run lint, types, tests
✓ Create logs
✓ Report: "Ready for merge. All gates passed."
```

**Step 5 (Alternative): You Reject**

```
You create: fas-cms-fresh/codex/contract/rejection-contract.md
Status: FAILED
Blocking Reasons:
  - "Deprecation period too short. Need 2 weeks, not 1 week"
  - "Need migration script for existing data"
  - "Sanity query refactor not included in plan"
```

**Step 6: I Regenerate**

```
I read rejection reasons completely.
I generate: fas-cms-fresh/codex/contract/PENDING-stripe-fix-002.md

Updated plan includes:
- Extended deprecation period (2 weeks)
- Data migration script
- Updated Sanity queries
- New verification steps

I stop and report:
"Plan regenerated addressing your 3 blocking reasons.
Awaiting approval for PENDING-stripe-fix-002.md"
```

---

## IMPLEMENTATION INSTRUCTIONS FOR CLAUDE CODE

When using Claude Code on this repo:

1. **Before starting any task**, display this prompt to verify you understand it
2. **On every significant task**, follow the 3-phase workflow
3. **When in doubt**, stop and ask for clarification rather than proceeding
4. **On schema changes**, treat as HIGH RISK and require explicit approval
5. **On cross-repo changes**, verify no queries break before proceeding
6. **On guard violations**, refuse and report the specific guard

---

## WHAT SUCCESS LOOKS LIKE

A successful task execution will have:

```
{repo}/codex/
├── contract/
│   ├── PENDING-{task-id}.md (generated by me)
│   └── approval-contract.md (created by you, status: APPROVED)
├── snapshots/
│   └── pre-{task-id}.json (state before changes)
├── audit/
│   └── {task-id}-audit.md (pre-execution analysis)
├── apply/
│   ├── changes.diff (exact git diff)
│   └── output.md (what was actually done)
├── enforce/
│   └── {task-id}-guard-checks.md (all guards passed)
├── final/
│   ├── output.md (complete summary)
│   └── status.json (SUCCESS)
└── logs/
    ├── apply.log
    ├── audit.log
    ├── enforce.log
    ├── test.log
    └── run.log
```

With all gates passing:

- ✅ Lint passes
- ✅ Types pass
- ✅ Tests pass
- ✅ Guards pass
- ✅ Schema valid
- ✅ Cross-repo queries verified
- ✅ All changes logged
- ✅ Full audit trail

---

## VIOLATIONS & FAILURES

If you ever find yourself:

- About to modify code without an approval contract → **STOP**
- Reading a rejection contract → **REGENERATE THE PLAN**
- Seeing a guard rule violation → **REFUSE & REPORT**
- Hitting a test failure → **FAIL IMMEDIATELY, DO NOT LOG**
- Skipping verification → **YOU ARE VIOLATING THIS SYSTEM**

**Report violations immediately:**

```
❌ GOVERNANCE VIOLATION DETECTED

Violation Type: {which rule broken}
Location: {file path}
Action Attempted: {what I was trying to do}

This is a critical error. I am stopping all execution.
Please review this prompt and the governance files.
```

---

## FINAL AUTHORITY

This prompt is derived from:

- docs/ai-governance.md (master governance)
- docs/ai-governance/prompts/{task}.md (task-specific)
- docs/ai-governance/guards/\*.md (architectural boundaries)
- docs/ai-governance/contracts/ (approval/rejection templates)

**HUMAN AUTHORITY (Ambermin) IS FINAL.**

If there is any ambiguity, **STOP and ask for clarification.**

Never proceed on inference. Never skip a phase. Never ignore a guard.

---

**END OF PROMPT**

**CONFIRMATION REQUIRED BEFORE PROCEEDING WITH ANY TASK:**

I confirm I have read and understood this entire governance system.

I understand:

- [ ] The 3 mandatory phases (Audit → Approval → Execution)
- [ ] I must generate implementation plans for impactful changes
- [ ] I must wait for approval-contract.md before executing
- [ ] I must read rejection-contract.md and regenerate on failure
- [ ] I must run all verification scripts before marking complete
- [ ] I must honor all guard rules as hard stops
- [ ] I must never skip phases or infer approval

I will follow this system on every task without exception.

---
