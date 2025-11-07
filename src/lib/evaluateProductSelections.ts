import type {
  CartSelection,
  CartValidationIssue,
  ProductCustomizationRequirement,
  ProductOptionRequirement,
} from '../../shared/cartValidation'
import {buildCartSelectionFromMaps, validateCartSelections} from '../../shared/cartValidation'

export type SelectionMaps = {
  options?: Record<string, unknown> | null
  customizations?: Record<string, unknown> | null
}

export type ProductRequirementContext = {
  productTitle?: string | null
  options?: ProductOptionRequirement[] | null
  customizations?: ProductCustomizationRequirement[] | null
}

export type SelectionEvaluation = {
  selection: CartSelection
  issues: CartValidationIssue[]
  missingOptions: string[]
  missingCustomizations: string[]
  isValid: boolean
}

export function evaluateProductSelections(
  requirements: ProductRequirementContext | null | undefined,
  maps: SelectionMaps,
): SelectionEvaluation {
  const selection = buildCartSelectionFromMaps(maps.options || undefined, maps.customizations || undefined)

  if (!requirements) {
    return {
      selection,
      issues: [],
      missingOptions: [],
      missingCustomizations: [],
      isValid: true,
    }
  }

  const issues = validateCartSelections(requirements, selection)
  const missingOptions = issues.filter((issue) => issue.type === 'option').map((issue) => issue.field)
  const missingCustomizations = issues
    .filter((issue) => issue.type === 'customization')
    .map((issue) => issue.field)

  return {
    selection,
    issues,
    missingOptions,
    missingCustomizations,
    isValid: issues.length === 0,
  }
}
