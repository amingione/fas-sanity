# AI CHANGE APPROVAL CONTRACT

FILE: `.ai-stack-trace/<task>/contract/approval.md`

Task: <task-name>
Repository: fas-sanity
Base SHA: <sha>
Date: YYYY-MM-DD

---

## APPROVED SCOPE

The following changes are explicitly approved:

- Schema changes:
  - (list or NONE)

- Runtime code changes:
  - (list files and intent)

- Backfill scripts:
  - (list or NONE)

- Documentation-only changes:
  - (list)

---

## EXPLICITLY NOT APPROVED

- Any schema changes not listed above.
- Any new fields or mappings not documented in:
  `docs/reports/field-to-api-map.md`
- Any new vendor capabilities.
- Any authentication bypasses.

---

## DRIFT ACKNOWLEDGEMENTS

(List any intentional drift and justification.)

---

## HUMAN APPROVAL

I approve the above scope and authorize Codex to apply changes.

Name: ____________________
Signature: _______________
Date: ____________________

---

## MACHINE GATE FILE

Create a file named `APPROVED` in `.ai-stack-trace/<task>/contract/` with contents:

```
APPROVED:<task>:<sha>
```

This file is required for execution.
