const nonAlphaNumeric = /[^a-z0-9]+/gi
const camelBoundary = /([a-z0-9])([A-Z])/g

export const normalizeName = (value: string) =>
  value
    .replace(camelBoundary, '$1 $2')
    .replace(nonAlphaNumeric, ' ')
    .trim()
    .toLowerCase()

export const tokenizeName = (value: string) =>
  normalizeName(value)
    .split(' ')
    .map((part) => part.trim())
    .filter(Boolean)

export const createNameVariants = (name: string): string[] => {
  const tokens = tokenizeName(name)
  if (tokens.length === 0) return []

  const base = tokens.join(' ')
  const snake = tokens.join('_')
  const kebab = tokens.join('-')
  const compact = tokens.join('')

  return Array.from(new Set([name, base, snake, kebab, compact].filter(Boolean))).map((entry) =>
    entry.toLowerCase(),
  )
}

const levenshteinDistance = (a: string, b: string) => {
  const matrix: number[][] = []
  const lowerA = a.toLowerCase()
  const lowerB = b.toLowerCase()

  for (let i = 0; i <= lowerB.length; i += 1) {
    matrix[i] = [i]
  }
  for (let j = 0; j <= lowerA.length; j += 1) {
    matrix[0][j] = j
  }

  for (let i = 1; i <= lowerB.length; i += 1) {
    for (let j = 1; j <= lowerA.length; j += 1) {
      if (lowerB.charAt(i - 1) === lowerA.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1,
        )
      }
    }
  }

  return matrix[lowerB.length][lowerA.length]
}

export const similarity = (a: string, b: string) => {
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return 1
  const distance = levenshteinDistance(a, b)
  return 1 - distance / maxLen
}
