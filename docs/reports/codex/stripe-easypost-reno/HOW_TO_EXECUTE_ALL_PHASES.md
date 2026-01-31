# How to Execute All 6 Phases with Claude Code / Cursor

**Master guide for running the complete fas-sanity + fas-cms-fresh fix plan end-to-end.**

---

## The Big Picture

You have **6 sequential phases** to execute. Each phase builds on the previous one. This guide tells you exactly how to prompt Claude/Codex to work through them properly.

```
Phase 0: LOCKED ✅ (via approval checklist)
        ↓
Phase 1: Stop-the-Bleeding (5 tasks) ← START HERE
        ↓
Phase 2: Restore Studio Shipping (3 tasks)
        ↓
Phase 3: Order Persistence Robustness (3 tasks)
        ↓
Phase 4: Schema Alignment (6 tasks)
        ↓
Phase 5: Cleanup + Docs (4 tasks)
        ↓
Phase 6: Regression Testing (5 tasks)
        ↓
✅ COMPLETE
```

---

## Step-by-Step Execution Pattern

### Before Phase 1: Lock Phase 0 (5 min)

**What to do:**
1. Read: `docs/reports/PHASE_0_DECISION_RECORD.md` (ADR-0001)
2. Fill out: `docs/reports/PHASE_0_APPROVAL_CHECKLIST.md`
3. File the completed checklist

**How to know you're ready:**
- All four decisions are marked ✅ **APPROVED**
- Checklist is saved and dated

---

### Phase 1: Stop-the-Bleeding (1-2 days estimated)

#### Open Claude Code and paste this prompt:

```
I'm ready to begin Phase 1 of the fas-sanity + fas-cms-fresh fix plan.

Phase 0 is LOCKED (decision record: PHASE_0_DECISION_RECORD.md)
Phase 0 approval: PHASE_0_APPROVAL_CHECKLIST.md ✅

Use the full execution structure defined in:
docs/reports/PHASE_1_KICKOFF_PROMPT.md

Execute Phase 1 tasks in order (1.1 → 1.2 → 1.3 → 1.4 → 1.5):

1.1 Remove secrets and unsafe defaults
1.2 Fix shipping webhook secret validation + unify Stripe API versions
1.3 Require warehouse address env vars
1.4 Fix the rate_* ID collision
1.5 Enforce permissions.update_shipping_details

Acceptance criteria:
- All 5 tasks have passing verification scripts
- No secrets committed
- Warehouse address required (no placeholders)
- Stripe API versions unified
- EasyPost rate ID collision fixed
- Permissions properly set

After Phase 1 is complete, generate a Phase 1 Completion Report.
```

#### When Phase 1 completes:

You'll receive:
- ✅ Phase 1 Completion Report
- ✅ Modified files with git diffs
- ✅ Test results for all 5 tasks
- ✅ Recommendation to proceed to Phase 2

---

### Phase 2: Restore Studio Shipping (1 day estimated)

#### After Phase 1, paste this prompt:

```
Phase 1 is complete ✅

Ready for Phase 2: Restore Internal/Admin Shipping

Use the execution structure in:
docs/reports/PHASE_2_KICKOFF_PROMPT.md

Execute Phase 2 tasks in order (2.1 → 2.2 → 2.3):

2.1 Fix 6 broken Studio references to getEasyPostRates
2.2 Restore EasyPost webhook continuity
2.3 Complete vendor application migration

Acceptance criteria:
- Studio shipping rates action works without errors
- EasyPost webhook deliveries succeed
- Vendor application has single canonical endpoint

After Phase 2 is complete, generate a Phase 2 Completion Report.
```

#### When Phase 2 completes:

You'll receive:
- ✅ Phase 2 Completion Report
- ✅ Studio workflows verified
- ✅ Recommendation to proceed to Phase 3

---

### Phase 3: Order Persistence Robustness (1 day estimated)

#### After Phase 2, paste this prompt:

```
Phase 2 is complete ✅

Ready for Phase 3: Make Order Persistence Robust

Use the execution structure in:
docs/reports/PHASES_3_4_5_6_KICKOFF.md (Phase 3 section)

Execute Phase 3 tasks in order (3.1 → 3.2 → 3.3):

3.1 Validate Sanity client configuration at webhook entry
3.2 Resolve stripeSummary field completeness
3.3 Consolidate duplicate webhook implementations

Acceptance criteria:
- Webhook fails fast if Sanity config missing (no silent failures)
- stripeSummary fields match schema or docs are updated
- Only one webhook implementation is active

After Phase 3 is complete, generate a Phase 3 Completion Report.
```

#### When Phase 3 completes:

You'll receive:
- ✅ Phase 3 Completion Report
- ✅ Webhook validation verified
- ✅ Recommendation to proceed to Phase 4

---

### Phase 4: Schema Alignment (2-3 days estimated)

#### After Phase 3, paste this prompt:

```
Phase 3 is complete ✅

Ready for Phase 4: Address Schema "Quality" Issues

Use the execution structure in:
docs/reports/PHASES_3_4_5_6_KICKOFF.md (Phase 4 section)

Execute Phase 4 tasks in order (4.1 → 4.2 → 4.3 → 4.4 → 4.5 → 4.6):

4.1 Document provider metadata fields in CLAUDE.md
4.2 Consolidate duplicate fields (paymentIntentId, carrier/service)
4.3 Enforce amount field validation (all fields: discount, tax, shipping, total)
4.4 Build address normalization helper (Decision 4 from Phase 0)
4.5 Implement migration scripts for deprecated fields
4.6 Audit and document unused schema types

Constraints (Phase 0 decisions):
- Schema is truth (no schema changes without "SCHEMA CHANGE APPROVED")
- Address normalization is a helper layer (no schema changes)
- Duplicate fields continue writing for backwards compatibility

After Phase 4 is complete, generate a Phase 4 Completion Report.
```

#### When Phase 4 completes:

You'll receive:
- ✅ Phase 4 Completion Report
- ✅ Address helper + tests
- ✅ Updated CLAUDE.md
- ✅ Migration scripts
- ✅ Recommendation to proceed to Phase 5

---

### Phase 5: Cleanup + Documentation (1 day estimated)

#### After Phase 4, paste this prompt:

```
Phase 4 is complete ✅

Ready for Phase 5: Cleanup + Documentation Alignment

Use the execution structure in:
docs/reports/PHASES_3_4_5_6_KICKOFF.md (Phase 5 section)

Execute Phase 5 tasks in order (5.1 → 5.2 → 5.3 → 5.4):

5.1 Update stale contracts and governance docs (remove Parcelcraft refs)
5.2 Remove or archive deprecated scripts and endpoints
5.3 Implement account edit page (complete the stub)
5.4 Document intentional disablement of stripeShippingRateCalculation

After Phase 5 is complete, generate a Phase 5 Completion Report.
```

#### When Phase 5 completes:

You'll receive:
- ✅ Phase 5 Completion Report
- ✅ Updated contracts and docs
- ✅ Account edit API working
- ✅ Recommendation to proceed to Phase 6

---

### Phase 6: End-to-End Regression Testing (1-2 days estimated)

#### After Phase 5, paste this prompt:

```
Phase 5 is complete ✅

Ready for Phase 6: End-to-End Regression Testing

Use the execution structure in:
docs/reports/PHASES_3_4_5_6_KICKOFF.md (Phase 6 section)

Execute Phase 6 tasks in order (6.1 → 6.2 → 6.3 → 6.4 → 6.5):

6.1 Test checkout + shipping rates (storefront)
6.2 Test order creation + persistence (back-office)
6.3 Test Studio internal shipping workflows
6.4 Test mobile checkout (responsive)
6.5 End-to-end workflow test (complete user journey)

Success criteria:
- All tasks pass without errors
- Console clean (no warnings or errors)
- All integrations work together
- "GREEN BOARD" achieved

After Phase 6 is complete, generate a Phase 6 Completion Report + final summary.
```

#### When Phase 6 completes:

You'll receive:
- ✅ Phase 6 Completion Report
- ✅ "GREEN BOARD" ✅ confirmation
- ✅ Summary of all fixes (Phases 1-6)
- ✅ Known issues or caveats (if any)
- ✅ Final handoff notes

---

## Complete Timeline

| Phase | Task Count | Est. Time | Dependencies |
|-------|-----------|-----------|--------------|
| 0 | Decision | 30 min | None |
| 1 | 5 tasks | 1-2 days | Phase 0 locked |
| 2 | 3 tasks | 1 day | Phase 1 complete |
| 3 | 3 tasks | 1 day | Phase 2 complete |
| 4 | 6 tasks | 2-3 days | Phase 3 complete |
| 5 | 4 tasks | 1 day | Phase 4 complete |
| 6 | 5 tasks | 1-2 days | Phase 5 complete |
| **TOTAL** | **26 tasks** | **~7-10 days** | Sequential |

---

## What Happens After Each Phase

**After every phase, Claude will deliver:**

1. **Phase X Completion Report** including:
   - All X tasks executed (list of what was changed)
   - Acceptance criteria verification (pass/fail)
   - Test results
   - Any blockers or issues encountered
   - Specific recommendation: "Ready for Phase X+1" or "Blockers to resolve"

2. **Git diff summary** of files changed in this phase

3. **Next phase recommendation** with any caveats

---

## If You Hit a Blocker

**If any phase gets stuck:**

1. **Document it** in the Phase completion report
2. **Reference PHASE_0_DECISION_RECORD.md** if it's an architectural question
3. **Reference complete-reno-audit.md** if it's a context issue
4. **Reference final_easypost-stripe_fix.md** if implementation details are unclear
5. **Do NOT skip the phase.** Resolve the blocker before proceeding.

---

## Checkpoints & Sign-Offs

**Recommended sign-off points:**

```
Phase 0: _____ (date) — All 4 decisions approved
Phase 1: _____ (date) — All 5 tasks complete, tests passing
Phase 2: _____ (date) — Studio workflows restored
Phase 3: _____ (date) — Webhook validation robust
Phase 4: _____ (date) — Schema alignment (no changes applied)
Phase 5: _____ (date) — Cleanup + docs updated
Phase 6: _____ (date) — "GREEN BOARD" ✅
```

---

## Quick Reference: All Prompt Files

**Phase 0 (Decisions):**
- `docs/reports/PHASE_0_DECISION_RECORD.md` — Read first
- `docs/reports/PHASE_0_APPROVAL_CHECKLIST.md` — Fill out and save

**Phase 1:**
- `docs/reports/PHASE_1_KICKOFF_PROMPT.md` — Copy-paste into Claude

**Phases 2-6:**
- `docs/reports/PHASE_2_KICKOFF_PROMPT.md` — Phase 2 only
- `docs/reports/PHASES_3_4_5_6_KICKOFF.md` — Phases 3, 4, 5, 6 (skeleton structure)

**Context:**
- `docs/reports/complete-reno-audit.md` — 47+ issues (reference only)
- `docs/prompts/codex-enf/final_easypost-stripe_fix.md` — Full details of all phases (reference only)
- `docs/reports/README.md` — Navigation guide

---

## Pro Tips

### Tip 1: Copy-Paste the Prompts
Don't try to "summarize" the prompts from memory. Copy-paste the full prompt for each phase. This ensures Claude has all the context.

### Tip 2: Reference Files in Your Prompt
Include explicit file references:
```
Use the structure in docs/reports/PHASE_1_KICKOFF_PROMPT.md
Reference complete-reno-audit.md for issue context
See PHASE_0_DECISION_RECORD.md for architectural decisions
```

### Tip 3: Wait for Completion Reports
After each phase, wait for the "Phase X Completion Report" before starting the next phase. Don't assume it's done until you see the report.

### Tip 4: Keep Checklists
Maintain a printed checklist of all 6 phases. Check them off as they complete.

### Tip 5: Archive Changes
After each phase, commit the changes to git with a clear commit message:
```
git commit -m "Phase 1: Stop-the-Bleeding fixes (1.1-1.5)"
git commit -m "Phase 2: Restore Studio Shipping (2.1-2.3)"
...etc
```

---

## FAQ

**Q: Can I run multiple phases in parallel?**
A: NO. They are sequential and dependent. Phase 2 won't work if Phase 1 isn't done.

**Q: Can I skip a phase?**
A: NO. Each phase builds on the previous one. All must be completed.

**Q: What if a task takes longer than estimated?**
A: That's fine. The estimates are rough. The important thing is correctness, not speed.

**Q: What if Phase X fails?**
A: Document the failure, reference the relevant decision records, and work through the blocker before moving to Phase X+1.

**Q: Can I edit the prompts?**
A: Yes, but be careful. The prompts are designed to be self-contained. If you change them, ensure you maintain the task order and acceptance criteria.

---

## Success = "GREEN BOARD" After Phase 6

When Phase 6 completes successfully, you'll have:

✅ No silent failures in webhooks
✅ No secrets in code or examples
✅ No provider metadata where it shouldn't be
✅ No broken function references
✅ Consistent address handling across repos
✅ Validated configurations at startup
✅ Complete order persistence
✅ Updated governance docs
✅ Full checkout → order → fulfillment flow working
✅ Mobile + desktop tested
✅ All 47+ audit issues resolved

---

## Ready to Begin?

1. **Read PHASE_0_DECISION_RECORD.md** (~15 min)
2. **Fill out PHASE_0_APPROVAL_CHECKLIST.md** (~10 min)
3. **Copy Phase 1 prompt into Claude Code**
4. **Paste:** "Start Phase 1"
5. **Wait for Phase 1 Completion Report**
6. **Move to Phase 2**

**Estimated total time:** 7-10 days (depending on your team and environment)

---

**Generated:** January 22, 2026
**Status:** ✅ Ready to execute
**Questions?** Reference the documents above or the navigation guide in `docs/reports/README.md`
