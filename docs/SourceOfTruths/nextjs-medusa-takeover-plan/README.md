# FAS Motorsports E-Commerce Restructure
## Complete Implementation Package for Codex

**Project**: Migrate from Sanity-centric architecture to Medusa-powered commerce platform
**Owner**: Amber Mingione (ambermingione@gmail.com)
**Executor**: Codex (AI Agent)
**Coordinator**: Claude (Cowork Mode)

---

## 🚀 Quick Start

### For Codex (AI Agent)
**START HERE**: [`00-START-HERE/INDEX.md`](00-START-HERE/INDEX.md)

This is your master roadmap. It contains:
- Complete folder navigation
- Phase-by-phase execution plan
- Critical rules (NEVER violate)
- Quick reference guide

### For Humans (Quick Overview)
Read this README, then go to `00-START-HERE/INDEX.md` for details.

---

## 📁 What's in This Folder

```
nextjs-medusa-takeover-plan/
├── README.md                    ← You are here
├── 00-START-HERE/               ← 🎯 START HERE
│   ├── INDEX.md                 ← Master implementation roadmap
│   ├── PREREQUISITES.md         ← Pre-flight checklist
│   └── CURRENT-PHASE.md         ← Active phase tracker
│
├── 01-FINAL-PLANS/              ← Canonical execution plans
│   ├── 01-Strategic-Execution-Plan.md
│   └── 02-fas-dash-Implementation-Plan.md
│
├── 02-ARCHITECTURE/             ← System design & audits
│   ├── 01-Pre-Implementation-Audit.md
│   ├── 02-Medusa-Backend-Overview.md
│   └── 03-Stable-Architecture-Model.md
│
├── 03-STRIPE-MIGRATION/         ← Archived (authority cleanup; non-authoritative)
│
├── 04-CONTEXT/                  ← Historical planning (reference)
│   ├── pre-planning/
│   ├── Fas-final-pre-implementation-audit.md
│   └── FAS-Sanity-Stable-Restructure-Plan.md
│
├── 05-ENV-SETUP/                ← Configuration guides
│   ├── ENV Setup.md
│   ├── Setup Global Local Storage...md
│   └── Adding Secrets to Global Environment.md
│
└── fas-dash-medusa-plan/        ← Original docs (preserved)
    └── [original structure]
```

---

## 🎯 Project Overview

### The Problem
FAS Motorsports has a **split-brain architecture** where commerce data lives in multiple places:
- Products in **both** Sanity AND Medusa (sync hell)
- Orders created in **Sanity** (via Netlify Functions)
- Pricing, inventory, shipping all in **Sanity** (wrong source of truth)
- fas-dash (admin panel) reads **only from Sanity** (no Medusa integration)

**Result**: Data inconsistency, complex sync logic, manual processes, fragile system.

### The Solution
**Restructure to a clean, single-source-of-truth architecture**:

```
┌─────────────────────────────────────────────────────────────┐
│                  TARGET ARCHITECTURE                         │
│                                                               │
│  ┌──────────┐                            ┌──────────┐       │
│  │  MEDUSA  │ ◄───── SOURCE OF TRUTH     │  SANITY  │       │
│  │ (v2.12.6)│        for commerce        │  (CMS)   │       │
│  │          │                             │          │       │
│  │ • Products                             │ • Content only   │
│  │ • Orders                               │ • Blog posts     │
│  │ • Inventory                            │ • Page content   │
│  │ • Shipping                             │ • Templates      │
│  │ • Payments                             │ • Marketing      │
│  └────┬─────┘                             └────┬─────┘       │
│       │                                        │             │
│       │ Medusa API                             │ GROQ        │
│       │                                        │             │
│       ▼                                        ▼             │
│  ┌──────────┐                            ┌──────────┐       │
│  │ fas-dash │                            │fas-cms   │       │
│  │ (Next.js)│                            │ (Astro)  │       │
│  │  Admin   │                            │Storefront│       │
│  └──────────┘                            └──────────┘       │
└─────────────────────────────────────────────────────────────┘
```

**Key Principle**: Medusa = commerce authority. Sanity = content authority. No overlap.

---

## 📋 Implementation Phases

### Phase 0: Lock Architecture ✅ COMPLETE
Architecture frozen, governance established, roles defined.

### Phase 1: Stabilize Medusa 🚧 IN PROGRESS
Deploy Medusa, verify all workflows via API, lock env vars.

**Duration**: 1-2 weeks
**Done means**: Every commerce workflow works via curl/Postman.

### Phase 2: Sanity Restructure
Strip Sanity schemas down to content-only. Remove all commerce fields.

**Duration**: 2 weeks
**Done means**: Sanity Studio is clean and content-focused.

### Phase 3: Define Sync Contracts
Document and implement predictable integration flows.

**Duration**: 1 week
**Done means**: All sync directions documented and working.

### Phase 4: Build Next.js Ops Console
Rewire fas-dash to read from Medusa, not Sanity.

**Duration**: 3-4 weeks
**Done means**: Ops team can work without Sanity Studio.

Vendor transition note:
- Keep current vendor integration paths in Sanity during transition.
- Move to webhook-first read-only timeline model before decommission.
- Require operational sign-off before vendor decommission.

### Phase 5-7: Cleanup, Optimization, Hardening
Remove legacy, optimize UX, add governance.

**Total Estimated Timeline**: 10-14 weeks

---

## 🔑 Core Principles

### 1. Backend First, Always
**UI is paint. Medusa is concrete.**

Don't build UI before backend is stable. We learned this lesson the hard way.

### 2. Phase Order is Sacred
Execute phases **exactly in order**. No skipping, no jumping ahead.

### 3. Medusa is Source of Truth
For **all** commerce data: products, orders, customers, inventory, shipping, payments.

**Sanity NEVER owns commerce data.**

### 4. Leverage Existing Infrastructure
fas-medusa already has:
- ✅ Stripe payment integration
- ✅ Shippo fulfillment module (UPS-only)
- ✅ 6-step product sync workflow with rollback
- ✅ Idempotent webhook handling
- ✅ Dead letter queue for failed syncs

**Don't rebuild. Extend.**

### 5. No "Maybe We Could..." Branches
Architecture is locked. No adding new systems mid-flight.

---

## 🚨 Critical Rules for Codex

### NEVER Violate These Rules:

1. **Follow Phase Order**
   - No Phase 4 before Phases 1-3 complete
   - Backend before UI, always

2. **Sanity Commerce Prohibition**
   - Sanity NEVER stores: pricing, inventory, orders, payments, shipping execution
   - Content only: blog, templates, product descriptions, marketing

3. **Backend Stability Gate**
   - UI gets built ONLY after backend is tested and stable
   - Every workflow must work via API before frontend touches it

4. **Sync Infrastructure**
   - Use fas-medusa's existing sync workflows
   - Extend, don't replace

5. **Documentation**
   - Update `CURRENT-PHASE.md` daily
   - Document every decision
   - Ask questions early

6. **Vendor Decommission Gate**
   - Do not remove vendor integration until cutover checklist is signed off.
   - Use webhook-first timeline contract for vendor activity sync.

---

## 📚 Key Documents Quick Reference

| Need | Document |
|------|----------|
| Master roadmap | `00-START-HERE/INDEX.md` |
| Current status | `00-START-HERE/CURRENT-PHASE.md` |
| Prerequisites | `00-START-HERE/PREREQUISITES.md` |
| Phase sequence | `01-FINAL-PLANS/01-Strategic-Execution-Plan.md` |
| fas-dash migration | `01-FINAL-PLANS/02-fas-dash-Implementation-Plan.md` |
| Vendor transition guardrail | `../fas-sanity-vendor-portal-keep.md` |
| Vendor webhook contract | `../vendor-portal-webhook-contract.md` |
| Vendor cutover sign-off | `../vendor-cutover-checklist.md` |
| System audit | `02-ARCHITECTURE/01-Pre-Implementation-Audit.md` |
| Medusa details | `02-ARCHITECTURE/02-Medusa-Backend-Overview.md` |
| Checkout flow | `01-FINAL-PLANS/01-Strategic-Execution-Plan.md` |

---

## 🔧 Tech Stack

### Current State (4 Repos)

**fas-medusa** (Medusa v2.12.6)
- Backend: Node.js, TypeScript
- Database: Postgres
- Cache: Redis
- Already has: Stripe, Shippo, Sanity sync

**fas-sanity** (Sanity CMS)
- 87 document schemas (TOO MANY)
- Target: ~38 schemas (content-only)
- 170+ Netlify Functions (many obsolete)

**fas-dash** (Next.js 15 + NextAuth)
- 100% Sanity-dependent (WRONG)
- Needs: Full rewrite to use Medusa
- Missing: Medusa SDK, Shippo client, Stripe SDK

**fas-cms-fresh** (Astro + React Islands)
- Already correct architecture ✅
- Uses Medusa for commerce, Sanity for content
- Reference implementation for fas-dash

---

## 📊 Success Metrics

### Phase 1 Success
- [ ] Medusa deployed to production
- [ ] All commerce workflows tested via API
- [ ] Zero failures in critical paths

### Phase 4 Success (End State)
- [ ] fas-dash reads 100% from Medusa for commerce
- [ ] fas-dash reads only content from Sanity
- [ ] No commerce data in Sanity schemas
- [ ] Ops team productive without Sanity Studio

### Overall Success
- [ ] Single source of truth (Medusa)
- [ ] Clean separation (commerce vs. content)
- [ ] Predictable sync flows
- [ ] Zero manual processes
- [ ] Team trained and confident

---

## 🆘 Getting Help

### For Codex
1. Check architecture docs in `/02-ARCHITECTURE/`
2. Review implementation plans in `/01-FINAL-PLANS/`
3. Reference FAS e-commerce skill (already loaded)
4. Update `CURRENT-PHASE.md` with blockers
5. Ask Claude (coordinator) for clarification

### For Amber
- Review `CURRENT-PHASE.md` for progress
- Check `PREREQUISITES.md` for decisions needed
- Read `00-START-HERE/INDEX.md` for overview

---

## 📝 Document Maintenance

### Update Frequency
- `CURRENT-PHASE.md`: Daily (by Codex)
- `PREREQUISITES.md`: As needed (when requirements change)
- `INDEX.md`: Rarely (architecture locked)

### Version Control
- All docs in Git
- Commit after each phase completion
- Tag releases by phase (v1.0 = Phase 1 complete)

---

## 🎓 Learning Path for New Team Members

1. **Start**: Read this README
2. **Context**: Read `02-ARCHITECTURE/01-Pre-Implementation-Audit.md`
3. **Plan**: Read `01-FINAL-PLANS/01-Strategic-Execution-Plan.md`
4. **Details**: Read phase-specific implementation docs
5. **Current**: Check `00-START-HERE/CURRENT-PHASE.md`

---

## 📞 Contact

**Project Owner**: Amber Mingione
- Email: ambermingione@gmail.com
- Role: Full-stack developer, FAS Motorsports

**AI Agents**:
- **Codex**: Implementation executor
- **Claude**: Coordination and planning

---

## ⚡ Ready to Start?

**For Codex (AI Agent)**:
1. Go to [`00-START-HERE/INDEX.md`](00-START-HERE/INDEX.md)
2. Complete [`00-START-HERE/PREREQUISITES.md`](00-START-HERE/PREREQUISITES.md)
3. Update [`00-START-HERE/CURRENT-PHASE.md`](00-START-HERE/CURRENT-PHASE.md)
4. Execute Phase 1

**Remember**: Backend first, always. No shortcuts. Follow the plan.

---

**Last Updated**: February 14, 2026
**Version**: 1.0 (Pre-Implementation Complete)
