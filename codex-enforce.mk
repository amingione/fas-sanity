# =========================================================
# Governance Prompts — Safe, TTY-Correct Generation
# =========================================================

CODEX_PROMPT_DIR ?= docs/prompts

# Standard prompt writer (no Codex execution)
define CODEX_WRITE_PROMPT
	@mkdir -p $(CODEX_PROMPT_DIR)
	@cat <<'PROMPT_EOF' > $(CODEX_PROMPT_DIR)/$@.txt
$(1)
PROMPT_EOF
endef

.PHONY: gemini-%-audit claude-%-decide codex-%-audit codex-%-decide codex-%-enforce

gemini-%-audit:
	@echo "🔍 GEMINI AUDIT: $*"
	@echo ""
	@echo "CONTRACT SOURCE OF TRUTH:"
	@echo "  (none yet — audit stage)"
	@echo ""
	$(call CODEX_WRITE_PROMPT,TASK: Perform a READ-ONLY audit for issue '$*'.\n\nRules:\n- Inspect runtime boundaries, assumptions, and risks.\n- Do NOT modify any files.\n- Do NOT propose fixes yet.\n\nOUTPUT FILE:\ndocs/reports/$*-audit.md)
	@echo ""
	@echo "NEXT STEP:"
	@echo "1. Run: codex"
	@echo "2. Paste the contents of:"
	@echo "   $(CODEX_PROMPT_DIR)/$@.txt"

codex-%-audit:
	@echo "🔍 CODEX AUDIT: $*"
	@echo ""
	@echo "CONTRACT SOURCE OF TRUTH:"
	@echo "  (none yet — audit stage)"
	@echo ""
	$(call CODEX_WRITE_PROMPT,TASK: Perform a READ-ONLY audit for issue '$*'.\n\nRules:\n- Inspect runtime boundaries, assumptions, and risks.\n- Do NOT modify any files.\n- Do NOT propose fixes yet.\n\nOUTPUT FILE:\ndocs/reports/$*-audit.md)
	@echo ""
	@echo "NEXT STEP:"
	@echo "1. Run: codex"
	@echo "2. Paste the contents of:"
	@echo "   $(CODEX_PROMPT_DIR)/$@.txt"

claude-%-decide:
	@echo "🧠 CLAUDE DECISIONS: $*"
	@echo ""
	@echo "CONTRACT SOURCE OF TRUTH:"
	@echo "  docs/reports/$*-audit.md"
	@echo ""
	@test -f docs/reports/$*-audit.md || (echo "❌ Missing audit file: docs/reports/$*-audit.md"; exit 1)
	$(call CODEX_WRITE_PROMPT,TASK: Convert the audit into an AUTHORITATIVE CONTRACT.\n\nINPUT:\ndocs/reports/$*-audit.md\n\nRules:\n- This file defines what Codex is allowed to implement.\n- Be explicit and conservative.\n- Do NOT implement code.\n\nOUTPUT FILE:\ndocs/reports/$*-contract-decisions.md)
	@echo ""
	@echo "NEXT STEP:"
	@echo "1. Run: codex"
	@echo "2. Paste the contents of:"
	@echo "   $(CODEX_PROMPT_DIR)/$@.txt"

codex-%-decide:
	@echo "🧠 CODEX DECISIONS: $*"
	@echo ""
	@echo "CONTRACT SOURCE OF TRUTH:"
	@echo "  docs/reports/$*-audit.md"
	@echo ""
	@test -f docs/reports/$*-audit.md || (echo "❌ Missing audit file: docs/reports/$*-audit.md"; exit 1)
	$(call CODEX_WRITE_PROMPT,TASK: Convert the audit into an AUTHORITATIVE CONTRACT.\n\nINPUT:\ndocs/reports/$*-audit.md\n\nRules:\n- This file defines what Codex is allowed to implement.\n- Be explicit and conservative.\n- Do NOT implement code.\n\nOUTPUT FILE:\ndocs/reports/$*-contract-decisions.md)
	@echo ""
	@echo "NEXT STEP:"
	@echo "1. Run: codex"
	@echo "2. Paste the contents of:"
	@echo "   $(CODEX_PROMPT_DIR)/$@.txt"

codex-%-enforce:
	@echo "🤖 CODEX ENFORCEMENT: $*"
	@echo ""
	@echo "CONTRACT SOURCE OF TRUTH:"
	@echo "  docs/reports/$*-contract-decisions.md"
	@echo ""
	@test -f docs/reports/$*-contract-decisions.md || (echo "❌ Missing contract file: docs/reports/$*-contract-decisions.md"; exit 1)
	$(call CODEX_WRITE_PROMPT,Apply ONLY the approved changes in:\ndocs/reports/$*-contract-decisions.md\n\nCRITICAL RULES:\n- Do NOT exceed the contract.\n- Do NOT modify unapproved files.\n- If no changes are required, state so explicitly.)
	@echo ""
	@echo "NEXT STEP:"
	@echo "1. Run: codex"
	@echo "2. Paste the contents of:"
	@echo "   $(CODEX_PROMPT_DIR)/$@.txt"
