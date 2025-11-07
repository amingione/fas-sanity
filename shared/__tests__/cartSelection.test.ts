import {describe, expect, it} from 'vitest'

import {buildCartSelectionFromMaps} from '../cartValidation'

describe('buildCartSelectionFromMaps', () => {
  it('converts simple option and customization maps to cart selection strings', () => {
    const selection = buildCartSelectionFromMaps(
      {
        Size: 'Large',
        Color: ['Red', 'Black'],
      },
      {
        Engraving: 'FAST',
      },
    )

    expect(selection.optionSummary).toBe('Size: Large, Color: Red, Black')
    expect(selection.optionDetails).toEqual(['Size: Large', 'Color: Red, Black'])
    expect(selection.customizations).toEqual(['Engraving: FAST'])
  })

  it('drops empty or meaningless values', () => {
    const selection = buildCartSelectionFromMaps(
      {
        Size: '  ',
        Finish: ['none', 'matte'],
        Package: null,
      },
      {
        Notes: '',
        Initials: '  n/a  ',
      },
    )

    expect(selection.optionSummary).toBe('Finish: matte')
    expect(selection.optionDetails).toEqual(['Finish: matte'])
    expect(selection.customizations).toBeUndefined()
  })

  it('unwraps nested objects when provided', () => {
    const selection = buildCartSelectionFromMaps(
      {
        Material: {value: 'Aluminum'},
      },
      {
        Engraving: {label: 'Boosted'},
      },
    )

    expect(selection.optionSummary).toBe('Material: Aluminum')
    expect(selection.optionDetails).toEqual(['Material: Aluminum'])
    expect(selection.customizations).toEqual(['Engraving: Boosted'])
  })
})
