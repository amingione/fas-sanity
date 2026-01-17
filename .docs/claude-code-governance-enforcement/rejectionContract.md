# ❌ REJECTION CONTRACT — SONNET 4.5 OPTIMIZED

**This template is designed for Claude Sonnet 4.5 to easily parse and act on rejection reasons.**

---

## HEADER (Machine-Readable First)

```
STATUS: REJECTED
TASK_ID: {task-slug-001}
TASK_NAME: {Human readable name}
REJECTED_BY: Ambermin
REJECTION_DATE: YYYY-MM-DD
REJECTION_TIME: HH:MM UTC
REJECTED_PLAN: {Path to PENDING contract that was rejected}
REPO: {fas-sanity | fas-cms-fresh | vendor-portal-polish}
```

Example:

```
STATUS: REJECTED
TASK_ID: log-drain-sdk-001
TASK_NAME: Functions Log Drain SDK Implementation
REJECTED_BY: Ambermin
REJECTION_DATE: 2026-01-15
REJECTION_TIME: 14:30 UTC
REJECTED_PLAN: docs/SANITY AGENT/Log Drains SDK/codex/contract/PENDING-log-drain-sdk-001.md
REPO: fas-sanity
```

---

## REJECTION SUMMARY (Why This Failed)

Sonnet 4.5 needs immediate context for why a plan is rejected.

```
SUMMARY: Plan rejected because {1 clear reason}.

SEVERITY: {LOW | MEDIUM | HIGH}
REGENERATION_REQUIRED: {YES | NO}
```

Example:

```
SUMMARY: Plan rejected because it lacks a data migration script
and the deprecation period is too short for downstream consumers.

SEVERITY: HIGH
REGENERATION_REQUIRED: YES
```

---

## BLOCKING REASONS (Explicit, Numbered, Actionable)

This is the most critical section. Sonnet 4.5 will read each reason and regenerate the plan around them.

```
BLOCKING_REASONS:

Reason #1: {Category}: {Title}
  Description: {What is wrong}
  Evidence: {Proof from the plan}
  Requirement: {What must change}
  Status: BLOCKING (plan cannot proceed as written)

Reason #2: {Category}: {Title}
  Description: {What is wrong}
  Evidence: {Proof from the plan}
  Requirement: {What must change}
  Status: BLOCKING

Reason #3: {Category}: {Title}
  Description: {What is wrong}
  Evidence: {Proof from the plan}
  Requirement: {What must change}
  Status: BLOCKING
```

Example (filled):

```
BLOCKING_REASONS:

Reason #1: CRITICAL_PATH: Missing Data Migration Script
  Description: The plan adds 3 new fields to the functionLog schema
               but provides no backfill script for existing documents.
  Evidence: Plan section "Implementation Steps" does not include
            any migration or backfill logic.
  Requirement: Plan must include docs/migrations/function-log-backfill.ts
               with script that:
               1. Iterates existing functionLog documents
               2. Backfills new fields with sensible defaults
               3. Includes rollback logic
               4. Is tested before merge
  Status: BLOCKING (cannot merge without this)

Reason #2: TIMELINE: Deprecation Period Too Short
  Description: The plan shows a 1-week deprecation period for old
               log format. Downstream consumers (vendor portal, analytics
               dashboards) need 2 weeks to update queries.
  Evidence: Plan section "Risk Analysis" says "Deprecation: 1 week"
            but real downstream systems take longer.
  Requirement: Plan must extend deprecation period to 2 weeks AND
               include a communication plan notifying:
               1. Vendor portal team (their queries will break on week 1)
               2. Analytics team (dashboards depend on old format)
               3. Stakeholders (with specific breakage dates)
  Status: BLOCKING (cannot merge with 1-week timeline)

Reason #3: DOCUMENTATION: Sanity Query Updates Missing
  Description: The plan adds new fields to the functionLog schema
               but does not update the Sanity GROQ queries that
               reference this data. Existing queries will break.
  Evidence: Plan lists "New fields: duration, executionId, status"
            but Verification Checklist does not include testing
            Sanity queries.
  Requirement: Plan must be updated to include:
               1. List of all Sanity queries that reference functionLog
               2. Updated queries using new fields
               3. Testing results showing updated queries return correct data
               4. Rollback plan if a query breaks in production
  Status: BLOCKING (will break Sanity UI on deployment)
```

---

## REJECTION CLASSIFICATION (Why This Matters)

Help Sonnet 4.5 understand the severity and category.

```
CLASSIFICATION:

Primary Category: {Schema | Timeline | Cross-Repo | Architecture | Governance}

Does this rejection mean:
  [ ] Plan has correct direction but needs refinement
  [✓] Plan is fundamentally wrong and needs redesign
  [ ] Plan was approved for different task but this is different task

If fundamentally wrong:
  Suggested direction: {What they should do instead}
```

Example:

```
CLASSIFICATION:

Primary Category: Schema + Timeline

Does this rejection mean:
  [✓] Plan has correct direction but needs refinement

Refinement needed in:
  1. Add migration script
  2. Extend timeline
  3. Update and test Sanity queries
```

---

## FAILED CHECKS (What Claude Code Should Look For in Regeneration)

Sonnet 4.5 will use this to verify it's addressing problems.

```
VERIFICATION FAILURES:

These checks FAILED in the original plan:

Check 1: Data Migration Script Exists
  [ ] docs/migrations/{name}.ts exists
  [ ] Script includes backfill logic
  [ ] Script includes rollback logic
  [ ] Script is tested

Check 2: Deprecation Timeline Documented
  [ ] Timeline stated as 2 weeks minimum
  [ ] Downstream consumers identified
  [ ] Communication plan included
  [ ] Breakage dates clearly documented

Check 3: Cross-Repo Queries Updated
  [ ] All Sanity queries affecting functionLog listed
  [ ] Queries updated to use new fields
  [ ] Query testing results included
  [ ] Rollback plan for broken queries included

Check 4: Risk Analysis Complete
  [ ] Data loss risk identified and mitigated
  [ ] Timeline risk identified (it was short)
  [ ] Cross-repo impact quantified
  [ ] All risks acknowledged by approver

REGENERATION MUST PASS ALL CHECKS ABOVE.
```

---

## REQUIRED NEXT ACTIONS (What Must Happen)

Sonnet 4.5 needs explicit instructions on what to do with this rejection.

```
REQUIRED_ACTIONS:

Action 1: Regenerate Implementation Plan
  Instruction: Generate new PENDING contract at:
               docs/SANITY AGENT/Log Drains SDK/codex/contract/PENDING-log-drain-sdk-002.md

  Requirements:
    [ ] Address all 3 blocking reasons
    [ ] Include migration script
    [ ] Extend deprecation timeline to 2 weeks
    [ ] Document all Sanity query changes
    [ ] Pass all failed checks listed above

  Do NOT proceed to Phase 3 execution. STOP after generating the plan.

  Report: "Plan regenerated addressing 3 blocking reasons.
           Awaiting new approval."

Action 2: I Will Review Updated Plan
  Timeline: You will review the new plan within 1 business day
  Method: Compare new plan against original blocking reasons
  Decision: Either approve (issue new approval contract) or
            reject again with refined blocking reasons

Action 3: No Execution Until Approval
  Enforcement: Do not implement code changes until new approval exists
```

---

## ENFORCEMENT RULES (Don't Do This)

Sonnet 4.5 needs explicit "do not" instructions.

```
ENFORCEMENT:

Claude Code MUST NOT:
  [✓] ❌ Modify code before new approval contract exists
  [✓] ❌ Proceed to Phase 3 execution
  [✓] ❌ Ignore these blocking reasons
  [✓] ❌ Propose workarounds instead of addressing reasons
  [✓] ❌ Merge code without human re-approval

If any enforcement rule is broken:
  → STOP immediately
  → Report the enforcement violation
  → Do not proceed
  → Wait for human clarification
```

---

## SCOPE OF REGENERATION (What Changes, What Doesn't)

Make it clear what is and isn't being rejected.

```
WHAT FAILED:
  [✓] Original implementation plan (REJECTED entirely)
  [ ] Task itself (task is still valid, just plan was wrong)
  [ ] Architecture (design direction is still correct)

WHAT REMAINS APPROVED:
  [✓] The overall task (implement Log Drain SDK) is still approved
  [✓] The architecture (Sanity document + SDK) is still approved
  [ ] The implementation details (those need to be regenerated)

WHAT NEEDS REGENERATION:
  [✓] Implementation plan with migration script
  [✓] Timeline extended to 2 weeks
  [✓] Sanity queries documented and tested
  [✓] All risk mitigation strategies refined

WHAT DOES NOT NEED REGENERATION:
  [ ] Overall task scope
  [ ] Architecture decisions
  [ ] Technology stack (TypeScript, Sanity, etc.)
```

---

## EVIDENCE & JUSTIFICATION (Why This Is Right)

Sonnet 4.5 will appreciate clear evidence.

```
EVIDENCE:

Why "migration script required":
  File: docs/SANITY AGENT/Log Drains SDK/codex/contract/PENDING-log-drain-sdk-001.md
  Section: "Implementation Steps"
  Finding: No migration or backfill logic mentioned
  Impact: Existing 5,000+ documents will have missing new fields
          This causes NULL errors in queries
  Source: Verified by reviewing Sanity document count

Why "timeline too short":
  File: Same PENDING contract
  Section: "Risk Analysis"
  Finding: "Deprecation: 1 week" stated
  Impact: Vendor portal team needs 2 weeks to update queries
          Analytics dashboards need 2 weeks to backfill
  Source: Checked with downstream teams; confirmed 2 weeks needed

Why "Sanity queries not tested":
  File: Same PENDING contract
  Section: "Verification Checklist"
  Finding: No test results for updated Sanity queries
  Impact: Queries will break in production if they're not correct
  Source: Previous deployments where untested schema changes broke UI
```

---

## REJECTION AUTHORITY (Who Made This Decision)

Sonnet 4.5 needs to know the authority level.

```
REJECTION_AUTHORITY:

Rejected By: Ambermin (Human, Final Authority)
Authority Level: FINAL (cannot be overridden)
Date: YYYY-MM-DD HH:MM UTC
Review Duration: {How long the plan was reviewed}

APPROVAL REQUIRED:
Type: New approval contract after regeneration
Authority: Same as original (Ambermin, Final)
No override clause: This rejection cannot be bypassed
```

---

## REGENERATION INSTRUCTION (What Sonnet Does Now)

Make the next step crystal clear.

```
REGENERATION_INSTRUCTIONS:

Step 1: Read This Entire Rejection Contract
  Confirm you understand all 3 blocking reasons

Step 2: Identify What Changes Needed
  [ ] Blocking reason 1 requires: migration script
  [ ] Blocking reason 2 requires: 2-week timeline
  [ ] Blocking reason 3 requires: Sanity query testing

Step 3: Generate New Implementation Plan
  Location: docs/SANITY AGENT/Log Drains SDK/codex/contract/PENDING-log-drain-sdk-002.md

  Include in new plan:
    - New implementation steps with migration script
    - Extended deprecation timeline (2 weeks)
    - All Sanity queries documented and tested
    - Updated risk analysis
    - All failed checks now passing

  Do NOT include:
    - Code implementation
    - Phase 3 execution
    - Schema migration testing
    - Deployment automation

Step 4: Stop and Report
  Message: "Plan regenerated addressing 3 blocking reasons:
           1. Migration script added
           2. Timeline extended to 2 weeks
           3. Sanity queries documented and tested

           New plan: docs/SANITY AGENT/Log Drains SDK/codex/contract/PENDING-log-drain-sdk-002.md

           Awaiting approval for new plan."

Step 5: Wait for New Approval
  Do not proceed to Phase 3 until new approval-contract.md exists
```

---

## MACHINE-READABLE FOOTER

```
---

METADATA:
  contract_version: 2.0
  template: sonnet-4.5-rejection-optimized
  task_id: {task-slug-001}
  status: REJECTED
  created: YYYY-MM-DD HH:MM UTC
  rejected_by: Ambermin
  rejected_by_authority: FINAL
  blocking_reasons_count: 3
  regeneration_required: YES

REGENERATION_TRIGGERS:
  If Claude Code sees this contract:
  1. status == "REJECTED" → Read entire contract
  2. regeneration_required == "YES" → Generate new plan
  3. Extract blocking_reasons_count (3 in this example)
  4. Ensure new plan addresses all 3 reasons
  5. Generate new PENDING contract (v2)
  6. Report location of new PENDING contract
  7. STOP (do not execute code)

REJECTION_DECISION_CHAIN:
  Original Plan (PENDING-001) → REJECTED
                                    ↓
                            Read blocking reasons
                                    ↓
                            Generate new plan (PENDING-002)
                                    ↓
                            Wait for approval (APPROVED)
                                    ↓
                            Execute (Phase 3)

---
```

---

## USAGE EXAMPLES

### Example 1: Simple Rejection (One Reason)

```
STATUS: REJECTED
TASK_ID: bug-fix-typescript-001
TASK_NAME: Fix TypeScript error in checkout.ts
REJECTED_BY: Ambermin
REJECTION_DATE: 2026-01-15
REJECTED_PLAN: fas-cms-fresh/codex/contract/PENDING-bug-fix-typescript-001.md

SUMMARY: Plan rejected because it doesn't address the root cause of the
error, just the symptom. The real issue is in the type definition, not
the function call.

SEVERITY: MEDIUM
REGENERATION_REQUIRED: YES

BLOCKING_REASONS:

Reason #1: INCORRECT_DIAGNOSIS
  Description: The plan proposes changing the function call signature,
               but the real problem is an incorrect type definition
               in the types file.
  Evidence: Plan section "Root Cause" incorrectly identifies the issue.
            The actual error is in src/types/stripe.ts line 45,
            not in src/pages/api/stripe/checkout.ts line 145.
  Requirement: Regenerate plan identifying the correct root cause:
               The CheckoutSession interface is missing the 'mode' field.
               Fix must be in types/stripe.ts, not in checkout.ts.
  Status: BLOCKING

CLASSIFICATION:
Primary Category: Diagnosis

REGENERATION_INSTRUCTIONS:

Step 1: Read the actual error message carefully
  Look at: The TypeScript compiler error, not the code

Step 2: Identify the real root cause
  [ ] Error is in types/stripe.ts (missing mode field)
  [ ] Not in checkout.ts (the file just uses the incorrect type)

Step 3: Regenerate plan fixing the root cause
  Location: fas-cms-fresh/codex/contract/PENDING-bug-fix-typescript-002.md

  Include:
    - Correct root cause analysis
    - Fix to CheckoutSession interface in types/stripe.ts
    - Explanation of why this fixes the error
    - No changes to checkout.ts needed

Step 4: Report
  "Plan regenerated with correct root cause analysis.
   Fix is in types/stripe.ts, not checkout.ts."

METADATA:
  status: REJECTED
  task_id: bug-fix-typescript-001
  rejected_by: Ambermin
  blocking_reasons_count: 1
  regeneration_required: YES
```

### Example 2: Complex Rejection (Multiple Reasons)

```
STATUS: REJECTED
TASK_ID: log-drain-sdk-001
TASK_NAME: Functions Log Drain SDK Implementation
REJECTED_BY: Ambermin
REJECTION_DATE: 2026-01-15
REJECTION_TIME: 14:30 UTC
REJECTED_PLAN: docs/SANITY AGENT/Log Drains SDK/codex/contract/PENDING-log-drain-sdk-001.md
REPO: fas-sanity

SUMMARY: Plan rejected because it lacks three critical components:
data migration script, extended deprecation timeline, and Sanity query
testing. These are not optional—they block production deployment.

SEVERITY: HIGH
REGENERATION_REQUIRED: YES

BLOCKING_REASONS:

Reason #1: CRITICAL_PATH: Missing Data Migration Script
  Description: The plan adds 3 new fields to the functionLog schema
               but provides no backfill script for the ~5,000 existing
               documents. New queries will return NULL for these fields
               on existing logs.
  Evidence: Plan section "Implementation Steps" has 8 steps, none of
            which include backfill or migration logic. The "Verification
            Checklist" does not test existing document handling.
  Requirement: Regenerated plan must include:
               1. docs/migrations/function-log-backfill.ts
               2. Script iterates existing functionLog documents
               3. Backfills new fields with sensible defaults:
                  - duration → calculate from startTime/endTime
                  - status → infer from error field
                  - executionId → use existing or generate
               4. Rollback logic to revert schema if needed
               5. Test results showing successful backfill
  Status: BLOCKING (production cannot ship without this)

Reason #2: TIMELINE: Deprecation Period Too Short
  Description: The plan proposes a 1-week deprecation for the old
               log format. However, three downstream systems depend
               on this data and need more time:
               - Vendor portal queries (2 weeks)
               - Analytics dashboards (2 weeks)
               - Audit log system (1.5 weeks)
  Evidence: Plan section "Risk Analysis" says "Deprecation period: 1 week"
            Communication with teams confirms:
            - Vendor Portal: "We need 2 weeks to refactor queries"
            - Analytics: "Dashboards depend on old format, 2 weeks minimum"
            - Audit: "Need time to backfill new format, 1.5 weeks"
  Requirement: Regenerated plan must:
               1. Extend deprecation period to 2 weeks minimum
               2. Create communication timeline:
                  - Week 1: Deploy new format (old format still supported)
                  - Week 1: Alert downstream teams
                  - Week 1-2: Downstream teams update queries
                  - Week 2: Remove old format support
               3. Include fallback plan if downstream teams miss deadline
               4. Document exactly when the old format stops working
  Status: BLOCKING (production outage without proper timeline)

Reason #3: DOCUMENTATION: Sanity Query Updates Missing
  Description: The plan adds 4 new fields (duration, executionId, status,
               environment) but does not identify or test the Sanity GROQ
               queries that reference functionLog. Existing queries will
               break or return incomplete data.
  Evidence: Plan does not mention Sanity queries. Searching the codebase,
            I found 3 GROQ queries that reference functionLog:
            - sanity/queries/audit-logs.grok (returns all functionLog)
            - sanity/queries/function-timeline.grok (chains functionLogs)
            - sanity/queries/error-summary.grok (aggregates errors)
            These queries MUST be updated for new fields.
  Requirement: Regenerated plan must include:
               1. List all Sanity GROQ queries affecting functionLog:
                  - sanity/queries/audit-logs.grok → update
                  - sanity/queries/function-timeline.grok → update
                  - sanity/queries/error-summary.grok → update
               2. Show updated queries using new fields
               3. Include test results for each query:
                  - Old query: Does it still work with new data? Test results.
                  - New query: Does it return correct data? Test results.
               4. Include rollback queries (revert to old format if needed)
  Status: BLOCKING (will break Sanity UI on deployment)

CLASSIFICATION:
Primary Category: Schema + Timeline + Cross-Repo

FAILED_CHECKS:

These checks FAILED in the original plan:

Check 1: Migration Script Documented
  [ ] docs/migrations/function-log-backfill.ts exists
  [ ] Backfill logic for each new field explained
  [ ] Rollback logic included
  [ ] Test results provided
  STATUS: FAILED

Check 2: Deprecation Timeline Valid
  [ ] Timeline is minimum 2 weeks
  [ ] Downstream consumers identified
  [ ] Communication plan documented
  [ ] Fallback plan exists
  STATUS: FAILED

Check 3: Sanity Queries Updated & Tested
  [ ] All affected queries listed
  [ ] Queries updated to handle new fields
  [ ] Test results for each query
  [ ] Rollback queries provided
  STATUS: FAILED

Check 4: Cross-Repo Impact Identified
  [ ] Vendor portal queries identified and tested
  [ ] Analytics dashboards identified and tested
  [ ] Audit log system identified and tested
  STATUS: FAILED

REGENERATION_REQUIRED: YES
Regenerated plan must pass ALL checks above.

REGENERATION_INSTRUCTIONS:

Step 1: Read All 3 Blocking Reasons
  Confirm you understand what each one requires

Step 2: Plan Your Regeneration
  [ ] Create migration script (function-log-backfill.ts)
  [ ] Extend timeline to 2 weeks with communication plan
  [ ] Document Sanity queries and test them

Step 3: Generate New Plan
  Location: docs/SANITY AGENT/Log Drains SDK/codex/contract/PENDING-log-drain-sdk-002.md

  Include sections:
    - Root cause analysis (same as before)
    - Implementation steps (now with migration script)
    - Deprecation timeline (extended to 2 weeks with communication)
    - Sanity query updates (document all 3, show tests)
    - Updated risk analysis (now addressing all 3 risks)
    - Updated verification checklist (now including all failed checks)

  Do NOT include:
    - Code implementation
    - Phase 3 execution
    - Schema migration testing
    - Deployment automation

Step 4: Stop and Report
  Message: "Plan regenerated addressing 3 blocking reasons:

           1. ✓ Migration script added (function-log-backfill.ts)
           2. ✓ Timeline extended to 2 weeks with communication plan
           3. ✓ Sanity queries documented (3 queries, all tested)

           New plan: docs/SANITY AGENT/Log Drains SDK/codex/contract/PENDING-log-drain-sdk-002.md

           All failed checks now addressed. Awaiting approval for new plan."

Step 5: Wait for New Approval
  Do not proceed to Phase 3 until new approval-contract.md exists
  Do not implement code changes
  Do not create schema or migrations

ENFORCEMENT:

Claude Code MUST NOT:
  [✓] ❌ Skip the migration script
  [✓] ❌ Use 1-week deprecation period
  [✓] ❌ Ignore Sanity query testing
  [✓] ❌ Proceed to Phase 3 before new approval

METADATA:
  contract_version: 2.0
  template: sonnet-4.5-rejection-optimized
  status: REJECTED
  task_id: log-drain-sdk-001
  rejected_by: Ambermin
  rejected_by_authority: FINAL
  blocking_reasons_count: 3
  regeneration_required: YES
  approver_contact: Ambermin
```

---

## KEY FEATURES FOR SONNET 4.5

✅ **Explicit blocking reasons** - Numbered and detailed  
✅ **Evidence-based** - References specific plan sections  
✅ **Actionable requirements** - Tells Claude exactly what to fix  
✅ **Failed checks** - Clear what needs to be verified  
✅ **Step-by-step regeneration** - Exact next steps  
✅ **Enforcement rules** - What not to do  
✅ **Machine-readable footer** - Triggers Claude's behavior

---

**Sonnet 4.5 will read this, understand each blocking reason, and regenerate the plan to address them all.**
