# =========================================================
# Governance Guards — CI Safety Checks
# =========================================================

.PHONY: governance-guard

governance-guard:
	@./scripts/check-governance.sh
	@./scripts/check-shipping-guards.sh
