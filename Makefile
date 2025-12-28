.PHONY: lint typecheck verify-enforcement fast-path new-ai-cycle

include codex-enforce.mk
include governance-guards.mk

lint:
	pnpm lint

typecheck:
	pnpm exec tsc -p tsconfig.runtime.json

# =========================================================
# Post-Enforcement Verification — Gemini
# =========================================================

.PHONY: verify-enforcement

verify-enforcement: governance-guard
	@echo "🔍 POST-ENFORCEMENT VERIFICATION"
	@echo ""
	@echo "Run Gemini using the Post-Enforcement Verification prompt."
	@echo "Source of truth:"
	@echo "  docs/reports/cross-repo-contract-decisions.md"
	@echo ""
	@echo "Verification must confirm:"
	@echo " - Codex changes map 1:1 to approved decisions"
	@echo " - No unapproved schema or logic changes"
	@echo " - No UX or data drift introduced"
	@echo ""
	@read -p "Press ENTER once Gemini returns PASS..."
	@echo ""
	@echo "✔ Post-enforcement verification recorded."

# =========================================================
# Fast Path — Trivial / Non-Contract Changes
# Skips full AI pipeline but enforces safety checks
# =========================================================

.PHONY: fast-path

fast-path:
	@echo "⚡ FAST PATH MODE (Trivial Changes Only)"
	@echo ""
	@echo "Allowed changes:"
	@echo " - UI copy / labels"
	@echo " - Styling / layout"
	@echo " - Comments / docs"
	@echo " - Tests"
	@echo ""
	@echo "NOT allowed:"
	@echo " - Schema changes"
	@echo " - Data model changes"
	@echo " - Integration logic"
	@echo " - Auth / identity logic"
	@echo ""
	@read -p "Confirm this change is TRIVIAL and does not affect contracts (y/N): " CONFIRM; \
	if [ "$$CONFIRM" != "y" ]; then \
		echo "❌ Fast path aborted."; \
		exit 1; \
	fi

	@echo ""
	@echo "▶ Running lint + runtime typecheck..."
	@pnpm lint
	@pnpm exec tsc -p tsconfig.runtime.json

	@echo ""
	@echo "✔ Fast path complete."
	@echo "If this was not truly trivial, you MUST rerun the governance flow."

.PHONY: new-ai-cycle

new-ai-cycle:
	@if [ -z "$(ISSUE)" ]; then \
		echo "❌ ISSUE not specified. Usage: make new-ai-cycle ISSUE=example-issue"; \
		exit 1; \
	fi
	@echo "🧠 Initializing AI governance cycle for: $(ISSUE)"
	@mkdir -p docs/prompts docs/reports
	@cp docs/ai-governance/templates/gemini-audit.template.txt docs/prompts/gemini-$(ISSUE)-audit.txt
	@sed -i '' "s/<issue>/$(ISSUE)/g" docs/prompts/gemini-$(ISSUE)-audit.txt
	@echo "✔ Gemini audit prompt created:"
	@echo "  docs/prompts/gemini-$(ISSUE)-audit.txt"
	@echo ""
	@echo "Next steps:"
	@echo "1. Run: make gemini-$(ISSUE)-audit"
	@echo "2. Run Gemini with the generated prompt"
	@echo "3. Save report to docs/reports/$(ISSUE)-audit.md"
