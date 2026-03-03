# FAS Motorsports E-Commerce Restructure
## Master Implementation Index for Codex

**Last Updated**: February 21, 2026
**Current Status**: Phase 1 (Stabilize Medusa) In Progress
**Executor**: Codex (AI Agent)
**Project Owner**: Amber Mingione

---

## 📋 Quick Navigation

### 🎯 Start Here
1. Read this INDEX completely
2. Review `PREREQUISITES.md` (in this folder)
3. Check `CURRENT-PHASE.md` for active work
4. Follow execution order in `/01-FINAL-PLANS/`

### 📁 Folder Structure

```
00-START-HERE/          ← You are here
├── INDEX.md            ← This file (master roadmap)
├── PREREQUISITES.md    ← Pre-flight checklist
└── CURRENT-PHASE.md    ← Active phase tracker

01-FINAL-PLANS/         ← core IMPLEMENTATION PLANS
├── 01-Strategic-Execution-Plan.md          ← Phase sequence (FOLLOW THIS ORDER)
├── 02-fas-dash-Implementation-Plan.md      ← Detailed fas-dash migration

02-ARCHITECTURE/        ← System design & audits
├── 01-Pre-Implementation-Audit.md          ← All 4 repos verified state
├── 02-Medusa-Backend-Overview.md           ← Medusa architecture
└── 03-Stable-Architecture-Model.md         ← Target architecture

03-STRIPE-MIGRATION/    ← Archived (authority cleanup; historical reference)

04-CONTEXT/             ← Historical planning (reference only)
├── pre-planning/                            ← Early brainstorming
├── Fas-final-pre-implementation-audit.md   ← Earlier audit version
└── FAS-Sanity-Stable-Restructure-Plan.md   ← Sanity planning

05-ENV-SETUP/           ← Configuration guides
├── ENV Setup.md
├── Setup Global Local Storage...md
└── Adding Secrets to Global Environment.md
```

---

## 🎯 Implementation Roadmap

### **THE ONE RULE: Backend First, Always**

**You MUST follow phases in exact order**. No UI before backend is stable.

### Phase Sequence (from `/01-FINAL-PLANS/01-Strategic-Execution-Plan.md`)

#### **Phase 0: Lock Architecture** ✅ COMPLETE
- ✅ System boundaries defined
- ✅ Governance documented
- ✅ Roles frozen:
  - **Medusa** = commerce authority (products, orders, inventory, shipping, payments)
  - **Next.js** = internal ops console
  - **Sanity** = content + experience only
  - **Astro** = storefront render layer

#### **Phase 1: Stabilize Medusa** 🚧 IN PROGRESS
**Objective**: Make Medusa boring and stable before touching UI

**Critical Path**:
1. Deploy Medusa to real host (not localhost)
2. Verify all workflows via curl/Postman:
   - Product creation
   - Variant ↔ price linking
   - Cart math
   - Shipping rate retrieval
   - PaymentIntent flow
   - Order creation
   - Label purchase
3. Lock environment variables
4. Document API contract

**Done means**: Every critical flow works without frontend.

**Reference**: `/02-ARCHITECTURE/01-Pre-Implementation-Audit.md` section "fas-medusa"

#### **Phase 2: Sanity Restructure** 🔜 NEXT
**Objective**: Focus Sanity on content + vendor workspace role

**Tasks**:
1. Fork and refactor product schema
2. **REMOVE** (critical deletions):
   - Pricing fields
   - Inventory fields
   - Stripe IDs
   - Shipping objects
   - Transactional schemas (orders, invoices, quotes)
   - Vendor ops are deferred until Vendor Preservation Gate is complete
3. **ADD** content-focused schemas:
   - `brandAsset`
   - `legalContent`
   - `navigationMenu`
   - `badge`
   - `faqPage`
   - Templates (email/quote/invoice layout only)
4. Redesign Studio desk structure

**Done means**: Sanity Studio feels clean and content-focused.

#### **Phase 3: Define Sync Contracts** 🔜
**Objective**: Make integration predictable

**Sync Direction Rules**:
- **Medusa → Sanity**: Product create/update (stub docs only)
- **Sanity → Astro**: Rebuild on publish
- **Sanity → Next**: Templates fetched at runtime
- **Sanity never writes commerce logic**

**Done means**: All integration flows documented and deterministic.

#### **Phase 4: Build Next.js Internal Ops Console** 🔜
**Objective**: Replace operational clutter removed from Sanity

**Modules** (build in order):
1. Order Desk
2. Quote Builder
3. Shipping Console
4. Customer Panel
5. Vendor Portal Replacement (required before vendor schema/path removal)

**Golden Rule**: Next calls Medusa. It never calculates anything itself.

**Reference**: `/01-FINAL-PLANS/02-fas-dash-Implementation-Plan.md`

**Done means**: Ops team can handle phone + vendor + in-store without Sanity.

#### **Phase 5: Remove Legacy Systems**
#### **Phase 6: Optimize UX & Performance**
#### **Phase 7: Hardening & Governance**

---

## 🔑 Key Documents by Purpose

### **When you need to know...**

**"What phase am I in?"**
→ `00-START-HERE/CURRENT-PHASE.md`

**"What was validated most recently in Phase 1?"**
→ `00-START-HERE/PHASE1-VALIDATION-2026-02-21.md`

**"What's the exact execution order?"**
→ `01-FINAL-PLANS/01-Strategic-Execution-Plan.md`

**"How do I migrate fas-dash?"**
→ `01-FINAL-PLANS/02-fas-dash-Implementation-Plan.md`

**"What's the verified state of all repos?"**
→ `02-ARCHITECTURE/01-Pre-Implementation-Audit.md`

**"How does Medusa work?"**
→ `02-ARCHITECTURE/02-Medusa-Backend-Overview.md`

**"What's the target architecture?"**
→ `02-ARCHITECTURE/03-Stable-Architecture-Model.md`

**"How do I set up environment variables?"**
→ `05-ENV-SETUP/ENV Setup.md`

**"Where is checkout migration guidance now?"**
→ `01-FINAL-PLANS/01-Strategic-Execution-Plan.md` (current reference phase flow)

---

## 🔒 Sanity Guardrail

Sanity never stores or mirrors transactional commerce records.

## 🔒 Vendor Transition Guardrail

Keep the existing vendor integration until all of the following are true:
- Vendor timeline webhook path is live and verified (signed + idempotent + replayable)
- Replacement vendor workspace is accepted by ops
- No critical vendor workflow depends on legacy Sanity transactional endpoints
- Rollback plan is documented

Transition docs:
- `docs/SourceOfTruths/fas-sanity-vendor-portal-keep.md`
- `docs/SourceOfTruths/vendor-portal-webhook-contract.md`
- `docs/SourceOfTruths/vendor-cutover-checklist.md`

---

## 🚨 Critical Rules (NEVER VIOLATE)

### 1. **Phase Order is Sacred**
Execute phases **exactly in order**. No Phase 4 before Phase 1-3 are complete.

**Why**: UI before stable backend = chaos. We learned this lesson already.

### 2. **Medusa is Source of Truth**
For ALL commerce data: products, orders, customers, inventory, shipping, payments.

**Sanity NEVER owns**:
- ❌ Pricing
- ❌ Stock levels
- ❌ Order state
- ❌ Payment data
- ❌ Shipping execution

### 3. **Backend First, Always**
UI is paint. Medusa is concrete. Don't paint before concrete cures.

### 4. **No "Maybe We Could..." Branches**
Architecture is locked. No adding new systems or changing roles mid-flight.

### 5. **Leverage Existing Sync Infrastructure**
fas-medusa already has:
- ✅ 6-step product sync workflow with rollback
- ✅ Idempotent event processing
- ✅ Dead letter queue
- ✅ Signature verification
- ✅ `@sanity/client` installed

**Don't rebuild it. Extend it.**

---

## 📊 Repository Map

### **fas-medusa** (Medusa v2.12.6) ✅ MOST MATURE
- **Location**: Separate repo
- **Status**: Has Stripe, Shippo, Sanity sync already
- **Gaps**: No custom modules (quotes, invoices, vendors, POs)
- **Needs**: `.env` file from template

### **fas-sanity** (Sanity CMS) ⚠️ NEEDS RESTRUCTURE
- **Location**: Separate repo
- **Current**: 87 document schemas (bloated)
- **Target**: ~38 document schemas (content + vendor workspace)
- **Project ID**: `r4og35qd` (verify vs. hardcoded `ps4wgpv9`)

### **fas-dash** (Next.js 15) 🔴 NEEDS FULL REWRITE
- **Location**: Separate repo
- **Current**: 100% Sanity-dependent (wrong)
- **Target**: Medusa for commerce, Sanity for content
- **Missing**: No Medusa SDK, no Shippo client, no Stripe SDK

### **fas-cms-fresh** (Astro) ✅ ALREADY CORRECT
- **Location**: Separate repo
- **Status**: Already uses Medusa for commerce, Sanity for content
- **Role**: Reference implementation for fas-dash

---

## ⚡ Quick Start for Codex

### Step 1: Verify Prerequisites
```bash
# Check PREREQUISITES.md in this folder
# Ensure:
# - fas-medusa running locally
# - Postgres + Redis accessible
# - Sanity project ID confirmed
# - Medusa Admin API key exists
```

### Step 2: Set Current Phase
```bash
# Update CURRENT-PHASE.md to Phase 1
# Lock in that you're stabilizing Medusa
```

### Step 3: Execute Phase 1
```bash
# Follow 01-FINAL-PLANS/01-Strategic-Execution-Plan.md
# Phase 1: Stabilize Medusa section
# Test every workflow via API before touching UI
```

### Step 4: Report Progress
```bash
# Update CURRENT-PHASE.md when phase complete
# Move to next phase only when "Done means" criteria met
```

---

## 🔍 Validation Checkpoints

After each phase, verify:

### Phase 1 Complete When:
- [ ] Medusa deployed to non-localhost
- [ ] All workflows work via curl/Postman
- [ ] Environment variables locked
- [ ] API contract documented

### Phase 2 Complete When:
- [ ] No pricing/inventory fields in Sanity product schema
- [ ] No transactional schemas exist
- [ ] Content schemas added
- [ ] Studio desk redesigned

### Phase 3 Complete When:
- [ ] Sync contracts documented
- [ ] Medusa → Sanity webhook tested
- [ ] Sanity → Astro rebuild tested
- [ ] No commerce writes from Sanity

### Phase 4 Complete When:
- [ ] fas-dash reads from Medusa API
- [ ] All commerce routes rewired
- [ ] Ops team can work without Sanity Studio
- [ ] No Sanity commerce queries remain

---

## 📞 Communication Protocol

### Progress Updates
**Location**: `00-START-HERE/CURRENT-PHASE.md`

**Format**:
```markdown
## Current Phase: [Number + Name]
**Started**: [Date]
**Expected Completion**: [Date]
**Status**: [On Track / Blocked / Complete]

### Completed Tasks
- [x] Task 1
- [x] Task 2

### In Progress
- [ ] Task 3

### Blockers
- Issue description (if any)
```

### Questions/Blockers
**If stuck, reference**:
1. Architecture docs in `/02-ARCHITECTURE/`
2. FAS e-commerce skill (already loaded)
3. Implementation plans in `/01-FINAL-PLANS/`

---

## 🎓 Learning Resources

### Architecture Deep Dive
- **Read**: `/02-ARCHITECTURE/01-Pre-Implementation-Audit.md`
- **Covers**: All 4 repos, verified state, sync infrastructure

### Medusa Specifics
- **Read**: `/02-ARCHITECTURE/02-Medusa-Backend-Overview.md`
- **Use**: When implementing Medusa API calls

### fas-dash Migration
- **Read**: `/01-FINAL-PLANS/02-fas-dash-Implementation-Plan.md`
- **Use**: Phase 4 execution (Next.js ops console)

### Stripe + Shippo Integration
- **Read**: `/01-FINAL-PLANS/01-Strategic-Execution-Plan.md`
- **Use**: Follow current reference phase flow; archived Stripe migration docs are historical reference.

---

## 🚀 Ready to Start?

1. ✅ Read this INDEX
2. ⏳ Check `PREREQUISITES.md`
3. ⏳ Review `CURRENT-PHASE.md`
4. ⏳ Start Phase 1: Stabilize Medusa

**Remember**: Backend first, always. No shortcuts.

---

**Document Owner**: Amber Mingione
**AI Agent**: Codex
**Coordinator**: Claude (Cowork Mode)
