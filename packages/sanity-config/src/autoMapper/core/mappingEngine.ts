import {
  ConfidenceBreakdown,
  MappingCandidate,
  MappingSuggestion,
  MappingConfidence,
  SourceField,
} from '../types'
import {detectSemanticTags} from '../utils/semanticTags'
import {createNameVariants, similarity} from '../utils/stringMetrics'

const NAME_WEIGHT = 0.4
const TYPE_WEIGHT = 0.3
const SEMANTIC_WEIGHT = 0.2
const STRUCTURE_WEIGHT = 0.1

const clamp = (value: number) => Math.max(0, Math.min(1, value))

const typeCompatibilityScore = (sourceType: string, targetType: string) => {
  if (sourceType === targetType) return 1
  if (sourceType === 'string' && ['text', 'slug', 'url'].includes(targetType)) return 0.7
  if (targetType === 'string' && ['text', 'slug', 'url'].includes(sourceType)) return 0.7
  if (['number', 'integer'].includes(sourceType) && ['number', 'integer'].includes(targetType))
    return 0.9
  if (sourceType === 'array' && targetType === 'array') return 0.8
  if (sourceType === 'reference' && targetType === 'reference') return 0.8
  if (['datetime', 'date'].includes(sourceType) && ['datetime', 'date'].includes(targetType))
    return 0.85
  return 0.25
}

const structuralScore = (source: SourceField, target: {metadata: {depth: number; path: string}}) =>
  clamp(1 - Math.abs((source.path?.split('.').length || 1) - target.metadata.depth) * 0.15)

const overlapScore = (a: string[], b: string[]) => {
  const setA = new Set(a)
  const setB = new Set(b)
  let matches = 0
  setA.forEach((entry) => {
    if (setB.has(entry)) matches += 1
  })
  const denom = Math.max(setA.size, setB.size, 1)
  return matches / denom
}

const classifyConfidence = (score: number): MappingConfidence => {
  if (score >= 0.8) return 'high'
  if (score >= 0.5) return 'medium'
  return 'low'
}

export class MappingEngine {
  constructor(private index: SchemaIndex) {}

  suggestForField(
    source: SourceField,
    options?: {targetDocument?: string; limit?: number},
  ): MappingCandidate[] {
    const targetFields = options?.targetDocument
      ? this.index.getDocumentFields(options.targetDocument)
      : this.index.fields

    // Use search to bias towards name matches, then fall back to the slice of fields.
    const searchResults =
      this.index.search(source.name, options?.limit ?? 12).map((result) => result.field) ||
      targetFields.slice(0, options?.limit ?? 12)

    const candidates = (searchResults.length > 0 ? searchResults : targetFields).slice(
      0,
      options?.limit ?? 12,
    )

    return candidates.map((target) => {
      const nameVariants = createNameVariants(source.name)
      const targetVariants = target.metadata.nameVariants
      const nameSimilarity = Math.max(
        similarity(source.name, target.name),
        ...nameVariants.map((variant) =>
          Math.max(similarity(variant, target.name), ...targetVariants.map((tv) => similarity(variant, tv))),
        ),
      )

      const sourceTags = source.semanticTags || detectSemanticTags(source.name, source.type)
      const semanticSimilarity = overlapScore(sourceTags, target.metadata.semanticTags)
      const structure = structuralScore(source, target)
      const typeScore = typeCompatibilityScore(source.type, target.type)

      const total =
        NAME_WEIGHT * nameSimilarity +
        TYPE_WEIGHT * typeScore +
        SEMANTIC_WEIGHT * semanticSimilarity +
        STRUCTURE_WEIGHT * structure

      const breakdown: ConfidenceBreakdown = {
        name: Number(nameSimilarity.toFixed(3)),
        type: Number(typeScore.toFixed(3)),
        semantic: Number(semanticSimilarity.toFixed(3)),
        structural: Number(structure.toFixed(3)),
        total: Number(clamp(total).toFixed(3)),
      }

      const rationale: string[] = []
      if (breakdown.name >= 0.7) rationale.push('strong name match')
      if (breakdown.type >= 0.7) rationale.push('type compatible')
      if (breakdown.semantic >= 0.5) rationale.push('semantic tags aligned')
      if (breakdown.structural >= 0.7) rationale.push('similar depth')
      if (rationale.length === 0) rationale.push('needs manual review')

      return {
        target,
        breakdown,
        status: classifyConfidence(breakdown.total),
        rationale,
      }
    })
  }

  suggestMappings(
    sourceFields: SourceField[],
    options?: {targetDocument?: string; limit?: number},
  ): MappingSuggestion[] {
    return sourceFields.map((source) => ({
      source,
      suggestions: this.suggestForField(source, options),
    }))
  }
}
