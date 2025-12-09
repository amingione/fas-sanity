import {MappingEngine} from '../core/mappingEngine'
import {
  CommandMappingResult,
  MappingSuggestion,
  ParsedCommand,
  SchemaIndex,
  SourceField,
} from '../types'
import {similarity} from '../utils/stringMetrics'

const commandPatterns: Array<{intent: ParsedCommand['intent']; pattern: RegExp}> = [
  {intent: 'map-field', pattern: /map\s+(.+?)\s+to\s+(.+)/i},
  {intent: 'import-type', pattern: /import\s+(\w+)\s+as\s+(\w+)/i},
  {intent: 'convert-type', pattern: /convert\s+(.+?)\s+to\s+(\w+)/i},
  {intent: 'set-field', pattern: /set\s+(.+?)\s+from\s+(.+)/i},
  {intent: 'set-field', pattern: /use\s+(.+?)\s+for\s+(.+)/i},
]

export const parseCommand = (input: string): ParsedCommand | null => {
  const trimmed = input.trim()
  if (!trimmed) return null

  for (const entry of commandPatterns) {
    const match = trimmed.match(entry.pattern)
    if (match) {
      const [, first, second] = match
      if (entry.intent === 'import-type') {
        return {intent: entry.intent, sourceType: first, targetType: second, raw: trimmed}
      }
      if (entry.intent === 'convert-type') {
        return {intent: entry.intent, sourceField: first, targetType: second, raw: trimmed}
      }
      return {intent: entry.intent, sourceField: first, targetField: second, raw: trimmed}
    }
  }

  return null
}

const findClosestSource = (name: string, sourceFields: SourceField[]) => {
  let best: {field: SourceField; score: number} | null = null
  sourceFields.forEach((field) => {
    const score = similarity(name, field.name)
    if (!best || score > best.score) best = {field, score}
  })
  return best
}

const findTargetByName = (name: string, index: SchemaIndex, document?: string) => {
  const matches = index.search(name, 5)
  const filtered = document ? matches.filter((entry) => entry.field.documentType === document) : matches
  return filtered[0]?.field || matches[0]?.field
}

export const generateMappingFromCommand = (
  command: string,
  options: {
    sourceFields: SourceField[]
    engine: MappingEngine
    targetDocument?: string
    schemaIndex: SchemaIndex
  },
): CommandMappingResult | null => {
  const parsed = parseCommand(command)
  if (!parsed) return null

  if (!parsed.sourceField) {
    return {parsed, message: 'No source field identified'}
  }

  const sourceCandidate = findClosestSource(parsed.sourceField, options.sourceFields)
  if (!sourceCandidate) {
    return {parsed, message: 'Source field not found'}
  }

  const baseSuggestions = options.engine.suggestForField(sourceCandidate.field, {
    targetDocument: options.targetDocument,
    limit: 6,
  })

  if (parsed.targetField) {
    const explicitTarget = findTargetByName(parsed.targetField, options.schemaIndex, options.targetDocument)
    if (explicitTarget) {
      const direct: MappingSuggestion = {
        source: sourceCandidate.field,
        suggestions: [
          {
            target: explicitTarget,
            breakdown: {
              name: similarity(parsed.targetField, explicitTarget.name),
              type: 0.5,
              semantic: 0.5,
              structural: 0.5,
              total: similarity(parsed.targetField, explicitTarget.name),
            },
            status: 'medium',
            rationale: ['direct command target'],
          },
          ...baseSuggestions.filter((entry) => entry.target.path !== explicitTarget.path),
        ],
      }
      return {
        parsed,
        suggestion: direct,
        message: 'Applied explicit target from command',
      }
    }
  }

  return {
    parsed,
    suggestion: {
      source: sourceCandidate.field,
      suggestions: baseSuggestions,
    },
    message: 'Used engine suggestions',
  }
}
