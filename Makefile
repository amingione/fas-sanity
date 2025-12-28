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

# =========================================================
# Codex Audit — Sanity Studio Theme Colors
# =========================================================

.PHONY: codex-sanity-theme-colors-audit

codex-sanity-theme-colors-audit:
	@echo "🎨 CODEX AUDIT: Sanity Studio Theme Colors"
	@mkdir -p docs/prompts
	@echo "Writing audit prompt to docs/prompts/codex-sanity-theme-colors-audit.txt"

	@printf "%s\n" \
	"TASK: Audit why Sanity Studio theme colors are not changing as expected." \
	"" \
	"REPO IN SCOPE:" \
	"- fas-sanity ONLY" \
	"" \
	"PROBLEM:" \
	"- Theme color changes have been attempted but do not reflect in Studio UI." \
	"- Expected brand/theme colors are not applied." \
	"" \
	"AUDIT OBJECTIVES:" \
	"1) Identify how Studio theming is currently configured." \
	"2) Identify whether theme tokens are overridden or ignored." \
	"3) Identify whether Sanity v3 theming API is used correctly." \
	"4) Identify any CSS, plugin, or structure-level overrides." \
	"5) Identify build or cache issues preventing theme updates." \
	"" \
	"FILES / AREAS TO INSPECT:" \
	"- sanity.config.ts / sanity.config.js" \
	"- Studio theme configuration (defineConfig, theme, studioTheme)" \
	"- Desk structure components" \
	"- Custom CSS or global styles" \
	"- Sanity version compatibility with theming API" \
	"- Any plugin that may inject styles" \
	"" \
	"RULES:" \
	"- READ-ONLY audit" \
	"- DO NOT modify files" \
	"- DO NOT suggest fixes yet" \
	"" \
	"OUTPUT REQUIREMENTS:" \
	"- Write findings to docs/reports/sanity-theme-colors-audit.md" \
	"- Clearly explain WHY colors are not changing" \
	"- Identify which layer is authoritative for theme colors" \
	"" \
	"STOP AFTER AUDIT." \
	> docs/prompts/codex-sanity-theme-colors-audit.txt

	@echo ""
	@echo "NEXT STEP:"
	@echo "1. Run: codex"
	@echo "2. Paste contents of docs/prompts/codex-sanity-theme-colors-audit.txt"

# =========================================================
# Codex Audit — Sanity Studio Color Authority
# =========================================================

.PHONY: codex-sanity-color-authority-audit

codex-sanity-color-authority-audit:
	@mkdir -p docs/prompts
	@echo "🎨 CODEX AUDIT: Sanity Studio Color Authority"
	@echo "Writing audit prompt to docs/prompts/codex-sanity-color-authority-audit.txt"

	@printf "%s\n" \
	"TASK: Audit why Sanity Studio colors defined via CSS variables are not taking effect." \
	"" \
	"REPO IN SCOPE:" \
	"- fas-sanity ONLY" \
	"" \
	"PRIMARY SYMPTOM:" \
	"- CSS variables under body.sanity-studio-theme are defined but UI colors do not change." \
	"" \
	"AUDIT OBJECTIVES:" \
	"1) Confirm whether body.sanity-studio-theme is present on <body> at runtime." \
	"2) Confirm CSS file load order relative to Sanity UI styles." \
	"3) Identify whether styled-components inject inline styles overriding variables." \
	"4) Identify whether Sanity UI components read JS theme tokens instead of CSS vars." \
	"5) Identify any remaining selectors redefining --studio-* after the authoritative block." \
	"" \
	"FILES / AREAS TO INSPECT:" \
	"- packages/sanity-config/src/components/studio/StudioLayout.tsx" \
	"- packages/sanity-config/src/styles/tailwind.css" \
	"- sanity.config.ts" \
	"- styled-components usage (ThemeProvider, StyleSheetManager)" \
	"- build pipeline for CSS inclusion" \
	"" \
	"RULES:" \
	"- READ-ONLY audit" \
	"- DO NOT modify files" \
	"- DO NOT suggest fixes until root cause is proven" \
	"" \
	"OUTPUT REQUIREMENTS:" \
	"- Write report to docs/reports/sanity-color-authority-audit.md" \
	"- Explicitly state which layer is authoritative for colors" \
	"- Explicitly state why CSS variables are ignored or overridden" \
	"- Recommend ONE minimal fix (no alternatives)" \
	> docs/prompts/codex-sanity-color-authority-audit.txt

	@echo ""
	@echo "NEXT STEP:"
	@echo "  codex"
	@echo "  (paste docs/prompts/codex-sanity-color-authority-audit.txt)"

# =========================================================
# Codex Audit — CSS Spacing & Readability (Custom Components)
# =========================================================

.PHONY: codex-css-spacing-readability-audit

codex-css-spacing-readability-audit:
	@mkdir -p docs/prompts
	@echo "🎨 CODEX AUDIT: CSS Spacing & Readability (Custom Components)"
	@echo "Writing audit prompt to docs/prompts/codex-css-spacing-readability-audit.txt"

	@printf "%s\n" \
	"TASK: Perform a read-only audit of CSS classes and layout usage across the repo" \
	"to identify spacing, padding, margin, and text-size issues causing overlap," \
	"clutter, or unreadable UI — especially in custom components." \
	"" \
	"REPO IN SCOPE:" \
	"- fas-sanity ONLY" \
	"" \
	"PRIMARY SYMPTOMS:" \
	"- Components visually overlap or feel cramped" \
	"- Text appears too small or inconsistent" \
	"- Buttons, headers, or metadata collide" \
	"- Custom components ignore spacing conventions" \

# =========================================================
# Audit — Stripe Shipping Metadata Drift
# =========================================================

.PHONY: codex-stripe-shipping-metadata-audit
codex-stripe-shipping-metadata-audit:
	@echo "🔍 CODEX AUDIT: Stripe Shipping Metadata Drift"
	@echo ""
	@echo "Goal:"
	@echo " - Identify where Stripe metadata is generated"
	@echo " - Determine why it diverges from shippingConfig"
	@echo " - Find stale or duplicated sync paths"
	@echo ""
	@echo "Output:"
	@echo " - docs/reports/stripe-shipping-metadata-audit.md"
	@echo ""
	@read -p "Press ENTER once Codex audit is complete and saved..."

.PHONY: claude-stripe-shipping-metadata-audit
claude-stripe-shipping-metadata-audit:
	@echo "🧠 CLAUDE AUDIT: Stripe Shipping Metadata System Contract"
	@echo ""
	@echo "Goal:"
	@echo " - Determine authoritative source of truth"
	@echo " - Identify invalid or competing data paths"
	@echo ""
	@echo "Output:"
	@echo " - docs/reports/stripe-shipping-metadata-contract.md"
	@echo ""
	@read -p "Press ENTER once Claude audit is complete and saved..."
	"" \
	"FILES / AREAS TO INSPECT:" \
	"- All custom React/TSX components" \
	"- Tailwind utility usage in JSX/TSX" \
	"- packages/sanity-config/src/styles/tailwind.css" \
	"- Any component-level CSS or inline styles" \
	"" \
	"AUDIT OBJECTIVES:" \
	"1) Identify components lacking sufficient padding or margin." \
	"2) Identify inconsistent spacing scales (mixed px, rem, Tailwind sizes)." \
	"3) Identify flex/grid containers missing safety rules:" \
	"   - min-width: 0" \
	"   - min-height: 0" \
	"   - gap usage instead of margins" \
	"4) Identify text sizes that reduce readability:" \
	"   - text-xs overuse" \
	"   - hardcoded font sizes" \
	"5) Identify absolute positioning or negative margins causing collisions." \
	"6) Identify opportunities for a shared spacing & typography baseline." \
	"" \
	"RULES:" \
	"- READ-ONLY audit" \
	"- DO NOT modify files" \
	"- DO NOT suggest ad-hoc per-component hacks" \
	"- Prefer systemic fixes over one-off tweaks" \
	"" \
	"OUTPUT REQUIREMENTS:" \
	"- Write report to docs/reports/css-spacing-readability-audit.md" \
	"- List problem areas grouped by category (spacing, text, layout)" \
	"- Call out the WORST offenders explicitly" \
	"- Recommend ONE minimal baseline spacing & typography system" \
	"- Clearly separate 'systemic fixes' vs 'component-specific fixes'" \
	> docs/prompts/codex-css-spacing-readability-audit.txt

	@echo ""
	@echo "NEXT STEP:"
	@echo "  codex"
	@echo "  (paste docs/prompts/codex-css-spacing-readability-audit.txt)"

# =========================================================
# Codex Audit — Sanity UI Component Chrome Gaps
# =========================================================

.PHONY: codex-sanity-ui-chrome-audit

codex-sanity-ui-chrome-audit:
	@mkdir -p docs/prompts
	@echo "🎨 CODEX AUDIT: Sanity UI Component Chrome Gaps"

	@printf "%s\n" \
	"TASK: Identify remaining Sanity Studio UI elements whose colors do not fully align" \
	"with the active JS theme, and determine where minimal, safe CSS overrides are allowed." \
	"" \
	"REPO IN SCOPE:" \
	"- fas-sanity ONLY" \
	"" \
	"OBJECTIVE:" \
	"- Identify components not fully controlled by defineTheme()" \
	"- Identify safe, scoped CSS selectors for those components" \
	"" \
	"FOCUS AREAS:" \
	"- Inputs (text, select, array items)" \
	"- Inline object cards" \
	"- Fieldset panels" \
	"- Badges and status pills" \
	"- Nested panels inside panes" \
	"" \
	"RULES:" \
	"- READ-ONLY audit" \
	"- DO NOT suggest theme token changes" \
	"- DO NOT suggest global overrides" \
	"- Only recommend scoped selectors under body.sanity-studio-theme" \
	"" \
	"OUTPUT:" \
	"- Write report to docs/reports/sanity-ui-chrome-audit.md" \
	"- List which elements are NOT theme-driven" \
	"- Recommend minimal CSS overrides (if any)" \
	> docs/prompts/codex-sanity-ui-chrome-audit.txt

	@echo ""
	@echo "NEXT STEP:"
	@echo "  codex"
	@echo "  (paste docs/prompts/codex-sanity-ui-chrome-audit.txt)"

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
