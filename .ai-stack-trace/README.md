# AI Stack Trace System

This directory records everything an AI did during a gated task.

It is:
- Not committed to git.
- Human-triggered.
- Fully auditable.
- Rollback-safe.

---

## DIRECTORY STRUCTURE

.ai-stack-trace/
plan/            # Human prompt and scope
gemini/audit/    # Structural and consistency audit
claude/review/   # Risk, reasoning, validation
codex/audit/     # Fix planning
codex/apply/     # Applied diffs (logs)
contract/        # Approval artifacts
enforce/         # Mapping assertions
logs/            # Execution logs
snapshots/       # Git and env snapshots
final/           # Status and outcome

---

## WHAT GOES HERE

- Prompts sent to AI tools
- AI outputs
- Decisions
- Applied changes
- Test results
- Deployment info
- Failures

---

## WHY THIS EXISTS

- Trace regressions
- Audit AI behavior
- Prove intent vs execution
- Enable safe automation
- Prevent silent drift

---

## NEVER EDIT HISTORY

Each task is append-only.
Do not modify past stack traces.
