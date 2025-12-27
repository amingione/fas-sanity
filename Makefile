.PHONY: audit verify decide enforce lint typecheck ai-pipeline

# --- Phase helpers (existing) ---

audit:
	@echo "▶ Phase 1: Codex AUDIT"
	@echo "Run the Codex AUDIT prompt from docs/ai-governance.md"
	@echo "Artifacts should be written to docs/reports/"

verify:
	@echo "▶ Phase 2: Gemini Verification"
	@echo "Run the Gemini verification prompt against docs/reports/"
	@echo "Proceed only if Gemini returns PASS."

decide:
	@echo "▶ Phase 3: Claude Decisions"
	@echo "Generate contract decisions and save them to docs/reports/<topic>-contract-decisions.md"

enforce:
	@echo "▶ Phase 4: Codex ENFORCEMENT"
	@echo "Run the Codex ENFORCEMENT prompt using the approved decision document."

lint:
	pnpm lint

typecheck:
	pnpm exec tsc -p tsconfig.runtime.json

# --- Single-command guided pipeline ---

ai-pipeline:
	@echo ""
	@echo "================ AI GOVERNANCE PIPELINE ================"
	@echo ""
	@echo "▶ Phase 1: Codex AUDIT"
	@echo "Run Codex AUDIT prompt now."
	@read -p "Press ENTER once the audit artifacts are generated in docs/reports/..."

	@echo ""
	@echo "▶ Phase 2: Gemini Verification"
	@echo "Run Gemini verification prompt against the audit artifacts."
	@read -p "Press ENTER once Gemini returns PASS..."

	@echo ""
	@echo "▶ Phase 3: Claude Decisions"
	@echo "Provide audit artifacts to Claude."
	@echo "Save the output to docs/reports/<topic>-contract-decisions.md"
	@read -p "Press ENTER once Claude decisions are finalized and saved..."

	@echo ""
	@echo "▶ Phase 4: Codex ENFORCEMENT"
	@echo "Run Codex ENFORCEMENT prompt using the approved decision document."
	@read -p "Press ENTER once Codex enforcement is complete..."

	@echo ""
	@echo "▶ Phase 5: Local Validation"
	@echo "Running lint and runtime typecheck..."
	@pnpm lint
	@pnpm exec tsc -p tsconfig.runtime.json

	@echo ""
	@echo "✔ AI governance pipeline complete."
	@echo "========================================================"
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
	@echo "If this was not truly trivial, you MUST rerun make ai-pipeline."