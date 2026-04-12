# Document Inventory — Complete Audit & Fix Plan Package

> ARCHIVE STATUS: OUTDATED / NO LONGER TRUE
>
> Archived on: 2026-04-12
> Reason: references missing files and superseded EasyPost-era execution flow that no longer reflects the Medusa-authority architecture in AGENTS.md.
> Canonical live trackers: `docs/governance/FAS_4_REPO_PIPELINE_TASK_TRACKER.md` and `docs/PROGRESS.md`.

**Everything you need to execute all 6 phases is ready.**

---

## 📦 What You Have

### Core Audit Documents

| Document | Purpose | Read Time | Status |
|----------|---------|-----------|--------|
| `complete-reno-audit.md` | 47+ issues identified across both repos | 45 min | ✅ Reference |
| `final_easypost-stripe_fix.md` | 6-phase strategic fix plan + 17-gap addendum | 60 min | ✅ Reference |
| `README.md` | Navigation guide tying all docs together | 15 min | ✅ Navigation |

### Decision & Approval Documents

| Document | Purpose | Read/Fill Time | Action |
|----------|---------|---|--------|
| `PHASE_0_DECISION_RECORD.md` | 4 critical architectural decisions (ADR-0001) | 20 min read | ⭐ **Read first** |
| `PHASE_0_APPROVAL_CHECKLIST.md` | Approval form for Phase 0 decisions | 15 min fill | ⭐ **Fill & save** |

### Phase Execution Prompts

| Document | For Phase | Tasks | Copy-Paste Into Claude | Status |
|----------|-----------|-------|--------|--------|
| `PHASE_1_KICKOFF_PROMPT.md` | Phase 1 | 5 | Yes (complete) | ✅ Ready |
| `PHASE_2_KICKOFF_PROMPT.md` | Phase 2 | 3 | Yes (complete) | ✅ Ready |
| `PHASES_3_4_5_6_KICKOFF.md` | Phases 3-6 | 18 total | Yes (skeleton structure) | ✅ Ready |

### Execution Guides

| Document | Purpose | Read Time |
|----------|---------|-----------|
| `HOW_TO_EXECUTE_ALL_PHASES.md` | Step-by-step guide for all 6 phases | 30 min |
| `START_HERE.md` | Quick start (read this first!) | 5 min |
| `DOCUMENT_INVENTORY.md` | This file | 2 min |

---

## 📋 Directory Structure

```
fas-sanity/docs/reports/
├── START_HERE.md ⭐ READ THIS FIRST
├── README.md
├── DOCUMENT_INVENTORY.md (this file)
│
├── complete-reno-audit.md
├── PHASE_0_DECISION_RECORD.md ⭐ READ THIS SECOND
├── PHASE_0_APPROVAL_CHECKLIST.md ⭐ FILL THIS OUT
│
├── PHASE_1_KICKOFF_PROMPT.md
├── PHASE_2_KICKOFF_PROMPT.md
├── PHASES_3_4_5_6_KICKOFF.md
│
└── HOW_TO_EXECUTE_ALL_PHASES.md

fas-sanity/docs/prompts/codex-enf/
└── final_easypost-stripe_fix.md
```

---

## 🚀 Quick Start (3 Steps)

### 1. Read Decision Record (15 min)
```
Open: docs/reports/PHASE_0_DECISION_RECORD.md
Goal: Understand the 4 Phase 0 decisions
```

### 2. Approve Decisions (15 min)
```
Open: docs/reports/PHASE_0_APPROVAL_CHECKLIST.md
Goal: Fill out and save the approval checklist
```

### 3. Kick Off Phase 1 (Now!)
```
Open: Claude Code
Copy: Phase 1 prompt from PHASE_1_KICKOFF_PROMPT.md
Paste: Into Claude
Say: "Start Phase 1"
```

---

## 📚 Document Guide by Use Case

### "I'm just starting out"
1. **START_HERE.md** — 5-min orientation
2. **PHASE_0_DECISION_RECORD.md** — Understand decisions
3. **PHASE_0_APPROVAL_CHECKLIST.md** — Approve them

### "I need to understand what's broken"
1. **complete-reno-audit.md** — See all 47+ issues
2. **README.md** — Navigate the issues
3. **PHASE_0_DECISION_RECORD.md** — Understand fix approach

### "I'm ready to execute Phase 1"
1. **PHASE_1_KICKOFF_PROMPT.md** — Copy-paste into Claude
2. **HOW_TO_EXECUTE_ALL_PHASES.md** — How to hand off to Phase 2

### "I need the full strategic overview"
1. **final_easypost-stripe_fix.md** — 6-phase roadmap + gaps
2. **PHASE_0_DECISION_RECORD.md** — Architectural decisions
3. **HOW_TO_EXECUTE_ALL_PHASES.md** — Execution sequence

### "I'm mid-Phase X and stuck"
1. **PHASE_0_DECISION_RECORD.md** — Check architectural decisions
2. **complete-reno-audit.md** — Find issue details
3. **final_easypost-stripe_fix.md** — See full Phase details

---

## 📊 Document Statistics

| Document | Type | Lines | Focus |
|----------|------|-------|-------|
| complete-reno-audit.md | Audit | 850 | Issues & findings |
| final_easypost-stripe_fix.md | Plan | 750 | Phases & gaps |
| PHASE_0_DECISION_RECORD.md | Decision | 400 | 4 critical decisions |
| PHASE_1_KICKOFF_PROMPT.md | Prompt | 350 | Phase 1 execution |
| PHASE_2_KICKOFF_PROMPT.md | Prompt | 180 | Phase 2 execution |
| PHASES_3_4_5_6_KICKOFF.md | Skeleton | 450 | Phases 3-6 structure |
| HOW_TO_EXECUTE_ALL_PHASES.md | Guide | 600 | Full execution guide |
| START_HERE.md | Quick Start | 250 | 3-step orientation |
| **TOTAL** | | **3,830 lines** | Complete package |

---

## ✅ Completeness Checklist

Have you read/done?

- [ ] **START_HERE.md** (5 min) — orientation
- [ ] **PHASE_0_DECISION_RECORD.md** (20 min) — understand decisions
- [ ] **PHASE_0_APPROVAL_CHECKLIST.md** (15 min) — fill out & save
- [ ] **PHASE_1_KICKOFF_PROMPT.md** (reviewed) — ready to copy-paste
- [ ] **HOW_TO_EXECUTE_ALL_PHASES.md** (30 min) — understand full sequence
- [ ] **All 4 Phase 0 decisions approved** ✅

**If all checked:** You're ready to begin Phase 1! 🚀

---

## 🔄 How Documents Work Together

```
START_HERE.md
        ↓
PHASE_0_DECISION_RECORD.md (read)
        ↓
PHASE_0_APPROVAL_CHECKLIST.md (fill out & save)
        ↓
PHASE_1_KICKOFF_PROMPT.md (copy → paste → execute)
        ↓
HOW_TO_EXECUTE_ALL_PHASES.md (reference for Phase 2 → 6)
        ↓
PHASE_2_KICKOFF_PROMPT.md (copy → paste → execute)
        ↓
[Repeat for Phases 3-6]
        ↓
complete-reno-audit.md (reference when clarification needed)
final_easypost-stripe_fix.md (reference for full details)
README.md (navigation guide)
```

---

## 📞 Common Questions

**Q: Which document should I read first?**
A: `START_HERE.md` (5 min), then `PHASE_0_DECISION_RECORD.md` (20 min)

**Q: How long does the entire fix take?**
A: 7-10 days depending on team size. See `HOW_TO_EXECUTE_ALL_PHASES.md` for timeline.

**Q: Can I skip documents?**
A: No. Each builds on the previous. The sequence is:
1. START_HERE → 2. DECISION_RECORD → 3. APPROVAL_CHECKLIST → 4. PHASE_1_PROMPT → etc.

**Q: What if I have a question about Phase 1?**
A: Reference `PHASE_1_KICKOFF_PROMPT.md` first, then `complete-reno-audit.md` for issue context.

**Q: What if I disagree with a Phase 0 decision?**
A: Note it in `PHASE_0_APPROVAL_CHECKLIST.md` marked as "🔁 Change". Schedule sync to discuss.

**Q: Can I modify the prompts?**
A: Yes, but carefully. The phase prompts are self-contained; changes might break the flow.

---

## 🎯 Success Metrics

### After Phase 1
✅ All 5 tasks complete
✅ Security fixes applied
✅ No secrets in code
✅ Phase 1 Completion Report received

### After Phase 6
✅ "GREEN BOARD" achieved
✅ All 47+ issues resolved
✅ Full checkout → fulfillment flow works
✅ Mobile + desktop tested
✅ All tests passing

---

## 📌 Key Decisions (Phase 0)

All locked via `PHASE_0_DECISION_RECORD.md`:

1. ✅ **paymentStatus enum** — Keep 7 values; update docs
2. ✅ **Order creation logic** — Collapse-to-pending is intentional
3. ✅ **Stripe field caching** — Non-authoritative metadata
4. ✅ **Address normalization** — Helper layer (no schema change)

---

## 🔐 Hard Constraints (Unbreakable)

- **Schema is truth** — No schema changes without "SCHEMA CHANGE APPROVED"
- **EasyPost is canonical** — No Parcelcraft, ShipEngine, or ShipStation in code
- **Phases are sequential** — Cannot run in parallel or skip
- **Codex compliance** — Follow `CLAUDE.md` and `codex.md` guidelines

---

## 📂 File Locations (Absolute Paths)

```
fas-sanity/docs/reports/
  START_HERE.md
  PHASE_0_DECISION_RECORD.md
  PHASE_0_APPROVAL_CHECKLIST.md
  PHASE_1_KICKOFF_PROMPT.md
  PHASE_2_KICKOFF_PROMPT.md
  PHASES_3_4_5_6_KICKOFF.md
  complete-reno-audit.md
  README.md
  HOW_TO_EXECUTE_ALL_PHASES.md
  DOCUMENT_INVENTORY.md (this file)

fas-sanity/docs/prompts/codex-enf/
  final_easypost-stripe_fix.md
```

---

## 🚀 Next Action

**Right now:**

1. Open `START_HERE.md`
2. Read it (5 min)
3. Follow its 3 steps

---

**Package Generated:** January 22, 2026
**Total Documents:** 9 master documents
**Total Lines:** 3,830 lines of guidance
**Status:** ✅ Complete and ready to execute
**Estimated Execution Time:** 7-10 days (all 6 phases)
