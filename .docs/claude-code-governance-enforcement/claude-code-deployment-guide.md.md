# 📋 CLAUDE CODE DEPLOYMENT & USAGE GUIDE

**Quick Reference for Running Tasks with Governance Enforcement**

---

## SETUP (One-Time)

1. **Copy the governance prompt** to your repo:

   ```bash
   cp claude-code-governance-enforcement-prompt.md \
     docs/ai-governance/prompts/claude-code-master.md
   ```

2. **Create task-tracking folder** (if doesn't exist):

   ```bash
   mkdir -p {repo}/codex/contract
   mkdir -p {repo}/codex/snapshots
   mkdir -p {repo}/codex/audit
   mkdir -p {repo}/codex/apply
   mkdir -p {repo}/codex/enforce
   mkdir -p {repo}/codex/final
   mkdir -p {repo}/codex/logs
   ```

3. **Verify guard rules exist**:
   ```bash
   ls -la docs/ai-governance/guards/
   # Should show: no-easypost-in-storefront.md, no-parcelcraft-in-sanity.md, etc.
   ```

---

## USAGE PATTERN

### For Simple Tasks (No Schema Impact)

**Example: "Fix a TypeScript error in checkout.ts"**

```bash
# Start Claude Code session
codex run \
  --repo fas-cms-fresh \
  --mode claude-code \
  --prompt "
REFERENCE: docs/ai-governance/prompts/claude-code-master.md

TASK: Fix TypeScript error in src/pages/api/stripe/checkout.ts

This is a bug fix with no schema or API impact.

Proceed with:
1. Audit phase (verify no impact)
2. If safe → execute with full logging
3. Generate final report
"
```

**Expected Output:**

```
✓ Audit complete (no schema impact detected)
✓ Changes made to checkout.ts
✓ Lint: PASS
✓ Types: PASS
✓ Final report: {repo}/codex/final/output.md
```

---

### For Schema/Contract Changes (HIGH RISK)

**Example: "Implement Log Drains SDK"**

```bash
codex run \
  --repo fas-sanity \
  --mode claude-code \
  --prompt "
REFERENCE: docs/ai-governance/prompts/claude-code-master.md

TASK: Implement Functions Log Drain SDK

This requires:
- New schema types
- New file structure
- Changes to function signatures

PHASE 1 ONLY: Generate implementation plan

Location: docs/SANITY AGENT/Log Drains SDK/codex/contract/
File: PENDING-log-drain-sdk-001.md

Include:
- All new files to create
- Schema types needed
- Impact analysis
- Verification checklist

Then STOP and report the plan location.
Do not proceed to Phase 2 or 3 without approval-contract.md.
"
```

**Expected Output:**

```
✓ Audit complete
📋 Implementation plan generated: docs/SANITY AGENT/Log Drains SDK/codex/contract/PENDING-log-drain-sdk-001.md

🛑 AWAITING APPROVAL

Please review the plan above and create:
docs/SANITY AGENT/Log Drains SDK/codex/contract/approval-contract.md

With status: APPROVED

Then I can proceed to Phase 2 (Execution).
```

**Then, after you approve:**

```bash
codex run \
  --repo fas-sanity \
  --mode claude-code \
  --prompt "
REFERENCE: docs/ai-governance/prompts/claude-code-master.md

TASK: Implement Functions Log Drain SDK (APPROVED)

PHASE 3: EXECUTE

Approval contract exists at:
docs/SANITY AGENT/Log Drains SDK/codex/contract/approval-contract.md

Proceed with full execution:
1. Create snapshot
2. Run guard checks
3. Implement all changes from approved plan
4. Run all tests
5. Generate logs and final report
"
```

**Expected Output:**

```
✓ Snapshot created
✓ Guard checks passed
✓ All files created per plan
✓ Lint: PASS
✓ Types: PASS
✓ Tests: PASS
✓ All logs written
✓ Final report: docs/SANITY AGENT/Log Drains SDK/codex/final/output.md

Ready for human review and merge.
```

---

### For Rejected Plans (Regeneration Loop)

**When you create rejection-contract.md:**

```bash
codex run \
  --repo fas-sanity \
  --mode claude-code \
  --prompt "
REFERENCE: docs/ai-governance/prompts/claude-code-master.md

TASK: Regenerate Log Drain SDK plan (REJECTED)

Rejection contract exists at:
docs/SANITY AGENT/Log Drains SDK/codex/contract/rejection-contract.md

Read it completely and regenerate PENDING plan addressing:
1. All blocking reasons listed
2. All required next actions
3. All evidence cited

Generate new plan at:
docs/SANITY AGENT/Log Drains SDK/codex/contract/PENDING-log-drain-sdk-002.md

Then STOP and report the new plan location.
"
```

**Expected Output:**

```
✓ Rejection contract read
✓ Blocking reasons identified: 3
✓ New plan generated: PENDING-log-drain-sdk-002.md

🛑 AWAITING NEW APPROVAL

Please review the updated plan addressing:
1. [Blocking reason 1 from rejection]
2. [Blocking reason 2 from rejection]
3. [Blocking reason 3 from rejection]

Then create new approval-contract.md
```

---

## KEY COMMANDS

### Check What's Pending

```bash
# See all pending approvals
find {repo}/codex/contract -name "PENDING-*.md" -type f

# See all approvals
find {repo}/codex/contract -name "approval-contract.md" -type f

# See all rejections
find {repo}/codex/contract -name "rejection-contract.md" -type f
```

### Review Task History

```bash
# See what changed in last task
cat {repo}/codex/apply/changes.diff

# See execution log
cat {repo}/codex/logs/apply.log

# See final report
cat {repo}/codex/final/output.md

# See audit trail
ls -la {repo}/codex/logs/
```

### Rollback If Needed

```bash
# See pre-execution snapshot
cat {repo}/codex/snapshots/pre-{task-id}.json

# Get the git diff that was applied
cat {repo}/codex/apply/changes.diff

# You can revert manually or:
# git revert {commit-hash}
```

---

## IMPORTANT NOTES

### ✅ DO THIS

- **Read all rejection reasons completely** before regenerating
- **Verify guards are updated** if they block something that should be allowed
- **Test cross-repo queries** after schema changes
- **Review the implementation plan** before approving
- **Keep approval contracts** as proof of review

### ❌ DON'T DO THIS

- Don't skip the plan generation phase
- Don't proceed without explicit approval
- Don't tell Claude Code to "ignore the governance" or "just implement it"
- Don't approve plans you haven't read
- Don't delete task folders (they're your audit trail)
- Don't modify approved plans after the fact

---

## TROUBLESHOOTING

### "Claude Code says it can't proceed without approval"

**This is correct.** You need to:

1. Find the PENDING contract it generated
2. Review it carefully
3. Create an approval-contract.md in the same folder
4. Set status to APPROVED
5. Re-run Claude Code with the same task

### "Rejection loop is taking too long"

Normal for complex changes. Expect 2-3 cycles for:

- Large schema changes
- Cross-repo impacts
- High-risk modifications

Each rejection should move you closer to approval by:

- Addressing blocking reasons
- Adding mitigation steps
- Improving the plan

### "Guard rule is blocking something that should be allowed"

**Two options:**

1. **Find a different implementation path** that doesn't violate the guard
   - Example: instead of importing EasyPost in Sanity, reference it via API
2. **Update the guard rule** (requires new approval contract)
   - Edit the guard file
   - Create new approval contract authorizing the change
   - Re-run Claude Code

**Do not ask Claude Code to "ignore the guard rule."** The guard exists for a reason.

---

## EXAMPLE APPROVAL CONTRACT (Copy & Edit)

```markdown
# ✅ APPROVAL CONTRACT

**TASK:** [Task name from PENDING plan]
**STATUS:** APPROVED FOR IMPLEMENTATION
**APPROVED BY:** Ambermin
**DATE:** [Today's date]

## Review Summary

I have reviewed: `[path to PENDING plan]`

**Approval Reasons:**

- [Reason 1 why this plan is good]
- [Reason 2]
- [Reason 3]

## Conditions

- [ ] I will verify cross-repo queries if schema changes
- [ ] I understand the rollback plan
- [ ] I accept the risks noted in the plan

## Implementation Checklist

After Claude Code executes, I will:

- [ ] Review changes.diff
- [ ] Run tests locally
- [ ] Verify [specific thing] works
- [ ] Merge to main

---

✔ Signature: Approved and authorized to proceed
```

---

## EXAMPLE REJECTION CONTRACT (Copy & Edit)

```markdown
# ❌ IMPLEMENTATION FAILED — HUMAN REJECTION CONTRACT

**STATUS:** FAILED — DO NOT IMPLEMENT
**APPROVED BY:** Ambermin
**DATE:** [Today's date]

## Blocking Reasons

1. **[Specific reason]** - [explanation]
2. **[Specific reason]** - [explanation]
3. **[Specific reason]** - [explanation]

## Required Changes

To move forward, the plan must:

- [Change 1]
- [Change 2]
- [Change 3]

## Evidence

- File: [path that demonstrates the issue]
- Reason: [why this is a problem]

---

**Next Step:** Regenerate plan addressing these 3 blocking reasons.
```

---

## FINAL CHECKLIST

Before running Claude Code:

- [ ] Read the governance prompt (above)
- [ ] Identify if task has schema/contract impact
- [ ] If yes → prepare for Phase 1 (plan generation) first
- [ ] If no → can proceed directly to Phase 3 (execution)
- [ ] Have task-specific governance rules on hand
- [ ] Know what guard rules apply (no-easypost-in-\*, etc.)
- [ ] Ready to review and approve plans before execution

---

**You are now protected by contract-driven governance.**

Claude Code will not proceed without your approval.
Every change is logged and audited.
You have full veto power at every stage.

This is how AI coding tools should work.
