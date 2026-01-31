# Which AI Tool When: A Clear Decision Framework

## Quick Answer

Use **Codex (CLI)** for Codex prompts — not Gemini or Claude.

---

## The Mental Model: Tool Strengths & Weaknesses

### Primary Capabilities

**Codex (CLI)**

- ✅ Deterministic execution, patching, refactors, schema edits, CI wiring, backfills, repo-wide consistency
- ❌ Ambiguous interpretation, policy reasoning, high-level architecture debates

**Claude**

- ✅ Audits, reasoning, consistency checks, risk analysis, long-form governance docs
- ❌ Applying patches safely across large repos

**Gemini**

- ✅ Broad scanning, cross-repo pattern detection, API surface audits, schema drift detection
- ❌ Precise patch execution, respecting repo-specific governance

---

## What This Means for Your Setup

### ❌ Common Mistakes

- Writing Codex prompts in Gemini or Claude
- Letting Claude or Gemini decide what to patch
- Feeding Codex loose or narrative instructions

### ✅ Correct Workflow

#### Claude: Judgment & Reasoning

- Audit findings
- Validate assumptions
- Write approval-gated plans
- Produce human-reviewable recommendations

**Claude answers:** _"What is true? What is risky? What should be done?"_

#### Gemini: Discovery & Inventory

- Scan broadly for patterns
- Detect schema drift
- Enumerate inconsistencies
- Generate inventories

**Gemini answers:** _"What exists? Where does it differ?"_

#### Codex: Execution Only

- Apply explicitly approved changes
- Modify schemas and runtime logic
- Add CI/tasks/guards
- Run tests and commit

**Codex answers:** _"Apply this exact change, exactly as specified."_

---

## The Universal Rule

**Judgment → Claude | Discovery → Gemini | Execution → Codex**

### Red Flags for Non-Codex Tools

Prompts containing: _decide, recommend, audit, assess, validate_

### Green Light for Codex

Prompts containing: _edit file, add field, rename, remove, wire, run tests_

---

## Why Codex Seemed Inconsistent

Auditing isn't Codex's job. When forced into it, behavior becomes unpredictable.

Once you separate **audit → approval → execution**, friction disappears.

---

## Final Recommendation

- **Claude** = Auditor + governance brain
- **Gemini** = Scanner + inventory generator
- **Codex CLI** = Surgical robot (blind to intent, perfect at execution)

Your instincts are correct. You're building the right system.
