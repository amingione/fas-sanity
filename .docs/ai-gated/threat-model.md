# Threat Model: AI-Applied Patches

This document defines risks and mitigations for AI-driven code changes.

---

## PRIMARY RISKS

### 1. Silent Schema Drift
AI adds or modifies schema fields without visibility.

Mitigation:
- Read-only schema mapping contract.
- Drift detection.
- Approval gate.

---

### 2. Overreach / Scope Creep
AI fixes related issues beyond the task.

Mitigation:
- Explicit approval contract.
- Scoped prompts.
- Abort-on-violation rule.

---

### 3. Regression Introduction
AI changes break unrelated functionality.

Mitigation:
- Mandatory tests.
- autoTest deployment.
- Rollback snapshot.

---

### 4. Credential or Token Exposure
AI logs secrets or mishandles credentials.

Mitigation:
- No secret echoing.
- No env mutation.
- CI secret scanning remains enabled.

---

### 5. Non-Deterministic Output
AI output varies between runs.

Mitigation:
- Single run per approval.
- Immutable logs.
- Human checkpoint.

---

## ACCEPTED RISKS

- WARN-only drift during early enforcement.
- Test data inconsistencies.
- Non-blocking schema warnings.

---

## HARD STOPS

Any of the following immediately abort execution:
- Missing approval.
- Schema change without approval.
- Test failure.
- Mapping contract violation.
- Unhandled exception.

---

## CONCLUSION

AI is treated as a power tool, not an authority.
Humans retain final control.
