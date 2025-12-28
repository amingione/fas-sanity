# =========================================================
# Governance Guards — CI Safety Checks
# =========================================================

.PHONY: governance-guard

governance-guard:
	@./scripts/check-governance.sh
