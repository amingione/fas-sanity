# AI Governance — Make Command Reference

This document is a **personal, commit-safe reference** for how this repository’s
AI governance pipeline works using `make`.

Make **never runs AI tools directly**.  
Make only **generates prompts, enforces guards, and sequences the workflow**.

---

## Core Rules (Read This Once)

- **Flat filenames** = pipeline-owned → DO NOT pre-create or edit
- **Subfolders** = reference / scratch → safe to edit anytime
- **Gemini** = facts only
- **Claude** = decisions + enforcement instructions
- **Codex** = blind execution
- **verify-enforcement** = final safety gate

---

## Start a New AI Governance Cycle

### Command

```bash
make new-ai-cycle ISSUE=<issue-name>
```

### What this does

- Initializes a new governance cycle
- Ensures required directories exist
- Prepares the pipeline for prompt generation

### What it does NOT do

- Does NOT run Gemini, Claude, or Codex
- Does NOT generate issue-specific content

---

## Generate Gemini Audit Prompt

### Command

```bash
make gemini-<issue>-audit
```

### Pipeline-Owned Output

```
docs/prompts/gemini-<issue>-audit.txt
```

### Your responsibility

- Open the generated file
- Paste any **issue-specific narrative** if needed
- Run Gemini manually using this prompt
- Save Gemini’s audit to:
  ```
  docs/reports/<issue>-audit.md
  ```

### Gemini MUST also generate

```
docs/prompts/claude-dec/<issue>-decision-contract-prompt.txt
```

---

## Generate Claude Decision Prompt

### Command

```bash
make claude-<issue>-decide
```

### Input (Pipeline-Owned)

```
docs/prompts/claude-dec/<issue>-decision-contract-prompt.txt
```

### Claude MUST generate

```
docs/reports/<issue>-contract-decisions.md
docs/prompts/codex-enf/<issue>-prompt.txt
```

Claude **decides**, but does not implement.

---

## Run Codex Enforcement

### Command

```bash
make codex-<issue>-enforce
```

### Input (Pipeline-Owned)

```
docs/prompts/codex-enf/<issue>-prompt.txt
```

Codex enforces **only** approved decisions.

---

## Verify Enforcement (Required)

### Command

```bash
make verify-enforcement
```

### What this does

- Runs governance guards
- Confirms no unapproved drift
- Confirms enforcement matches contract decisions

---

## One-Command Full Pipeline (Recommended)

### Command

```bash
make issue-<issue>-pipeline
```

### What it runs

1. `new-ai-cycle`
2. `gemini-<issue>-audit`
3. Pause for Gemini
4. `claude-<issue>-decide`
5. Pause for Claude
6. `codex-<issue>-enforce`
7. `verify-enforcement`

This is the **preferred workflow**.

---

## Fast Path (No Contracts)

### Command

```bash
make fast-path
```

### Allowed

- UI copy
- Styling
- Documentation
- Tests

### Forbidden

- Schemas
- Data models
- Integrations
- Auth or identity logic

If unsure, do NOT use fast-path.

---

## Safe Reference / Scratch Files (Human-Only)

You may freely create files such as:

```
docs/prompts/gemini/<issue>.txt
docs/prompts/claude/<issue>.txt
docs/prompts/codex/<issue>.txt
docs/prompts/_reference/<anything>.txt
```

These are **not read by Make** and **cannot break the pipeline**.

---

## Never Pre-Create These Files

Do NOT manually create or edit:

```
docs/prompts/gemini-<issue>-audit.txt
docs/prompts/claude-dec/<issue>-decision-contract-prompt.txt
docs/prompts/codex-enf/<issue>-prompt.txt
docs/reports/<issue>-audit.md
docs/reports/<issue>-contract-decisions.md
```

These paths are **pipeline-owned**.

---

## Mental Model (Lock This In)

- Make orchestrates
- Gemini observes
- Claude decides
- Codex executes
- Guards verify

If a step feels confusing, stop and re-check this order.
