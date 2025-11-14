import {describe, it, expect} from 'vitest'

/**
 * Convert portable text blocks to plain text string.
 * Handles both string input and portable text array structures.
 */
function portableTextToPlain(input: string | any): string {
  // If it's already a plain string and doesn't look like JSON, return it
  if (typeof input === 'string') {
    const trimmed = input.trim()
    // Try to parse as JSON if it looks like a stringified array
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed)
        if (Array.isArray(parsed)) {
          input = parsed
        } else {
          return input
        }
      } catch {
        return input
      }
    } else {
      return input
    }
  }

  if (!Array.isArray(input)) {
    return String(input)
  }

  return input
    .map((block) => {
      if (!block || typeof block !== 'object') return ''
      if (block._type !== 'block' || !Array.isArray(block.children)) return ''
      return block.children
        .map((child: any) => (typeof child?.text === 'string' ? child.text : ''))
        .join('')
    })
    .filter((text) => typeof text === 'string' && text.trim())
    .join('\n\n')
    .trim()
}

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'in',
  'a',
  'of',
  'with',
  'to',
  'on',
  'an',
  'by',
  'from',
  'at',
  'is',
  'its',
  'this',
  'that',
])

const KEYWORD_REGEX = /[\p{L}0-9+/.-]+/gu

/**
 * Extract keywords from the provided product information.
 */
function extractKeywords(productTitle: string, productDescription: string): string[] {
  const plainTitle = portableTextToPlain(productTitle)
  const plainDescription = portableTextToPlain(productDescription)
  const source = `${plainTitle} ${plainDescription}`.trim()

  if (!source) {
    return []
  }

  const seen = new Set<string>()
  const keywords: string[] = []

  const matches = source.match(KEYWORD_REGEX) ?? []

  matches.forEach((token) => {
    const trimmedToken = token.trim()
    if (!trimmedToken) {
      return
    }

    // Split composite values (e.g. "F250/F350") into individual keywords.
    const parts = trimmedToken.split(/\//)

    parts.forEach((part) => {
      const cleaned = part
        .replace(/^[^\p{L}0-9+.-]+/u, '')
        .replace(/[^\p{L}0-9+.-]+$/u, '')

      if (!cleaned) {
        return
      }

      const normalized = cleaned.toLowerCase()
      if (STOP_WORDS.has(normalized)) {
        return
      }

      if (!seen.has(normalized)) {
        seen.add(normalized)
        keywords.push(cleaned)
      }
    })
  })

  return keywords
}

describe('AltTextInput - Portable Text Conversion', () => {
  it('should handle plain string input', () => {
    const result = portableTextToPlain('Simple text')
    expect(result).toBe('Simple text')
  })

  it('should convert portable text array to plain text', () => {
    const portableText = [
      {
        _type: 'block',
        children: [
          {_type: 'span', text: 'Performance upgrade, '},
          {_type: 'span', text: 'bolt-on fit'},
        ],
      },
      {
        _type: 'block',
        children: [{_type: 'span', text: 'Compatible with F250/F350 diesel engines'}],
      },
    ]
    const result = portableTextToPlain(portableText)
    expect(result).toBe(
      'Performance upgrade, bolt-on fit\n\nCompatible with F250/F350 diesel engines',
    )
  })

  it('should handle stringified JSON portable text', () => {
    const portableTextStr = JSON.stringify([
      {
        _type: 'block',
        children: [{_type: 'span', text: 'Test content'}],
      },
    ])
    const result = portableTextToPlain(portableTextStr)
    expect(result).toBe('Test content')
  })

  it('should return string representation for non-portable-text objects', () => {
    const result = portableTextToPlain({some: 'object'})
    expect(result).toBe('[object Object]')
  })

  it('should handle empty arrays', () => {
    const result = portableTextToPlain([])
    expect(result).toBe('')
  })

  it('should filter out non-block items', () => {
    const portableText = [
      {
        _type: 'block',
        children: [{_type: 'span', text: 'Valid text'}],
      },
      {
        _type: 'image',
        asset: {_ref: 'image-123'},
      },
      {
        _type: 'block',
        children: [{_type: 'span', text: 'More valid text'}],
      },
    ]
    const result = portableTextToPlain(portableText)
    expect(result).toBe('Valid text\n\nMore valid text')
  })
})

describe('AltTextInput - Keyword Extraction with Portable Text', () => {
  it('should extract keywords from plain strings', () => {
    const title = 'FAS Motorsports High-Flow Piping Kit'
    const description = 'Performance upgrade for 2020+ 6.7L Ford Powerstroke'
    const keywords = extractKeywords(title, description)

    expect(keywords).toContain('FAS')
    expect(keywords).toContain('Motorsports')
    expect(keywords).toContain('High-Flow')
    expect(keywords).toContain('Piping')
    expect(keywords).toContain('Kit')
    expect(keywords).toContain('Performance')
    expect(keywords).toContain('upgrade')
    expect(keywords).toContain('2020+')
    expect(keywords).toContain('6.7L')
    expect(keywords).toContain('Ford')
    expect(keywords).toContain('Powerstroke')

    // Should filter stop words
    expect(keywords).not.toContain('for')
  })

  it('should extract keywords from portable text arrays', () => {
    const title = 'High-Flow Piping Kit'
    const portableDescription = [
      {
        _type: 'block',
        children: [
          {_type: 'span', text: 'Performance upgrade, '},
          {_type: 'span', text: 'bolt-on fit'},
        ],
      },
      {
        _type: 'block',
        children: [{_type: 'span', text: 'Compatible with F250/F350 diesel engines'}],
      },
    ]
    const keywords = extractKeywords(title, portableDescription as any)

    expect(keywords).toContain('High-Flow')
    expect(keywords).toContain('Piping')
    expect(keywords).toContain('Kit')
    expect(keywords).toContain('Performance')
    expect(keywords).toContain('upgrade')
    expect(keywords).toContain('bolt-on')
    expect(keywords).toContain('fit')
    expect(keywords).toContain('Compatible')
    expect(keywords).toContain('F250')
    expect(keywords).toContain('F350')
    expect(keywords).toContain('diesel')
    expect(keywords).toContain('engines')
  })

  it('should handle portable text with stringified JSON', () => {
    const title = 'Test Product'
    const portableDescriptionStr = JSON.stringify([
      {
        _type: 'block',
        children: [{_type: 'span', text: 'Aluminum construction with ceramic coating'}],
      },
    ])
    const keywords = extractKeywords(title, portableDescriptionStr)

    expect(keywords).toContain('Test')
    expect(keywords).toContain('Product')
    expect(keywords).toContain('Aluminum')
    expect(keywords).toContain('construction')
    expect(keywords).toContain('ceramic')
    expect(keywords).toContain('coating')
  })

  it('should not generate "Object" as a keyword from portable text', () => {
    const title = 'Test Product'
    const portableDescription = [
      {
        _type: 'block',
        children: [{_type: 'span', text: 'Quality aluminum construction'}],
      },
    ]
    const keywords = extractKeywords(title, portableDescription as any)

    // Ensure "Object" is not in the keywords
    expect(keywords).not.toContain('Object')
    expect(keywords).toContain('Quality')
    expect(keywords).toContain('aluminum')
    expect(keywords).toContain('construction')
  })

  it('should handle composite values like F250/F350', () => {
    const title = 'Universal Kit'
    const description = 'Compatible with F250/F350/F450 trucks'
    const keywords = extractKeywords(title, description)

    expect(keywords).toContain('F250')
    expect(keywords).toContain('F350')
    expect(keywords).toContain('F450')
  })

  it('should filter stop words', () => {
    const title = 'The Best Kit for Your Truck'
    const description = 'A great product with the best quality'
    const keywords = extractKeywords(title, description)

    // Stop words should be filtered
    expect(keywords).not.toContain('The')
    expect(keywords).not.toContain('the')
    expect(keywords).not.toContain('for')
    expect(keywords).not.toContain('A')
    expect(keywords).not.toContain('with')
    
    // Non-stop words should be kept
    expect(keywords).toContain('Best')
    expect(keywords).toContain('Kit')
    expect(keywords).toContain('Your')
    expect(keywords).toContain('Truck')
    expect(keywords).toContain('great')
  })

  it('should handle empty inputs', () => {
    const keywords = extractKeywords('', '')
    expect(keywords).toEqual([])
  })

  it('should deduplicate keywords (case-insensitive)', () => {
    const title = 'Performance Kit'
    const description = 'performance upgrade for best performance'
    const keywords = extractKeywords(title, description)

    const performanceCount = keywords.filter(
      (k) => k.toLowerCase() === 'performance',
    ).length
    expect(performanceCount).toBe(1)
  })
})
