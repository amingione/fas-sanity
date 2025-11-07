import {describe, expect, it} from 'vitest'

import type {ProductRequirementContext} from '../evaluateProductSelections'
import {evaluateProductSelections} from '../evaluateProductSelections'

const baseRequirements: ProductRequirementContext = {
  productTitle: 'Example Product',
  options: [
    {name: 'Size', required: true},
    {name: 'Color', required: true},
    {name: 'Bundle', required: false},
  ],
  customizations: [
    {name: 'Engraving', required: true},
    {name: 'Gift Note', required: false},
  ],
}

describe('evaluateProductSelections', () => {
  it('returns valid state when all required selections are present', () => {
    const evaluation = evaluateProductSelections(baseRequirements, {
      options: {
        Size: 'Medium',
        Color: 'Blue',
      },
      customizations: {
        Engraving: 'Boost Mode',
      },
    })

    expect(evaluation.isValid).toBe(true)
    expect(evaluation.issues).toHaveLength(0)
    expect(evaluation.missingOptions).toHaveLength(0)
    expect(evaluation.missingCustomizations).toHaveLength(0)
  })

  it('identifies missing options and customizations', () => {
    const evaluation = evaluateProductSelections(baseRequirements, {
      options: {
        Size: '',
        Color: 'none',
      },
      customizations: {
        Engraving: '  ',
      },
    })

    expect(evaluation.isValid).toBe(false)
    expect(evaluation.missingOptions).toEqual(['Size', 'Color'])
    expect(evaluation.missingCustomizations).toEqual(['Engraving'])
  })

  it('treats products without requirements as valid', () => {
    const evaluation = evaluateProductSelections(null, {
      options: {},
      customizations: {},
    })

    expect(evaluation.isValid).toBe(true)
    expect(evaluation.issues).toHaveLength(0)
  })
})
