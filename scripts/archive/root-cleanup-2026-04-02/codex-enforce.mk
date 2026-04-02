# =========================================================
# codex-enforce.mk
#
# Codex governance prompt generator (SAFE MODE)
#
# Make NEVER executes Codex.
# Make ONLY generates prompt files.
# =========================================================

.PHONY: gemini-%-audit claude-%-decide codex-%-enforce

gemini-%-audit:
	@mkdir -p docs/prompts
	@echo "🔍 Gemini Audit: $*"
	@echo "Write audit output to docs/reports/$*-audit.md"

claude-%-decide:
	@mkdir -p docs/prompts
	@echo "🧠 Claude Decisions: $*"
	@echo "Write contract decisions to docs/reports/$*-contract-decisions.md"

codex-%-enforce:
	@mkdir -p docs/prompts
	@echo "🤖 Codex Enforcement: $*"
	@echo "Writing prompt to docs/prompts/codex-$*-enforce.txt"
	@printf "%s\n" \
	"Apply ONLY the approved changes in:" \
	"docs/reports/$*-contract-decisions.md" \
	"" \
	"RULES:" \
	"- Do NOT modify unapproved files." \
	"- Do NOT change business logic." \
	"- Codex must be run manually from a real terminal." \
	> docs/prompts/codex-$*-enforce.txt
	@echo ""
	@echo "NEXT STEP:"
	@echo "  codex"
	@echo "  (then paste docs/prompts/codex-$*-enforce.txt)"
