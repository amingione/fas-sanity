import {describe, expect, it} from 'vitest'
import {validateCartSelections, hasBlockingSelectionIssues} from '../cartValidation'

describe('cartValidation', () => {
  it('flags missing required options', () => {
    const issues = validateCartSelections(
      {
        productTitle: 'Test Product',
        options: [{name: 'Size', required: true}],
      },
      {
        optionSummary: null,
        optionDetails: [],
        customizations: [],
      },
    )

    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({type: 'option', field: 'Size'})
    expect(hasBlockingSelectionIssues({options: [{name: 'Size', required: true}]}, {optionDetails: []})).toBe(true)
  })

  it('accepts provided required options', () => {
    const issues = validateCartSelections(
      {
        options: [{name: 'Size', required: true}],
      },
      {
        optionSummary: 'Size: Large',
        optionDetails: ['Size: Large'],
      },
    )

    expect(issues).toHaveLength(0)
  })

  it('flags missing required customization', () => {
    const issues = validateCartSelections(
      {
        customizations: [{name: 'Engraving', required: true}],
      },
      {
        customizations: [],
      },
    )

    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({type: 'customization', field: 'Engraving'})
  })

  it('ignores optional options and customizations', () => {
    const issues = validateCartSelections(
      {
        options: [{name: 'Finish', required: false}],
        customizations: [{name: 'Gift note', required: false}],
      },
      {
        optionDetails: [],
        customizations: [],
      },
    )

    expect(issues).toHaveLength(0)
  })
})
