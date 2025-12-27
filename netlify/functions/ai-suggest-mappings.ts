import type {Handler} from '@netlify/functions'
import crypto from 'crypto'
import {createClient} from '@sanity/client'

type FieldSemanticTag =
  | 'monetary'
  | 'temporal'
  | 'identifier'
  | 'contact'
  | 'location'
  | 'status'
  | 'quantity'
  | 'metadata'
  | 'boolean'
  | 'text'

type SourceField = {
  name: string
  type: string
  path?: string
  description?: string
  semanticTags?: FieldSemanticTag[]
}

type TargetField = {
  name: string
  path: string
  type: string
  documentType: string
  semanticTags?: FieldSemanticTag[]
  depth?: number
}

type ConfidenceBreakdown = {
  name: number
  type: number
  semantic: number
  structural: number
  total: number
}

type MappingCandidate = {
  target: TargetField
  breakdown: ConfidenceBreakdown
  status: 'high' | 'medium' | 'low'
  rationale: string[]
}

type MappingSuggestion = {
  source: SourceField
  suggestions: MappingCandidate[]
}

type AiMapping = {
  source: string
  target: string
  confidence?: number
  rationale?: string[]
}

type FeedbackEntry = {
  source: string
  target: string
  accepted: boolean
  confidence?: number
  strategy?: string
  requestId?: string
  model?: string
  targetDocument?: string
  rationale?: string[]
}

const NAME_WEIGHT = 0.4
const TYPE_WEIGHT = 0.3
const SEMANTIC_WEIGHT = 0.2
const STRUCTURE_WEIGHT = 0.1

const classifyConfidence = (score: number): MappingCandidate['status'] => {
  if (score >= 0.8) return 'high'
  if (score >= 0.5) return 'medium'
  return 'low'
}

const normalize = (value: string) =>
  value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase()

const createNameVariants = (name: string) => {
  const normalized = normalize(name)
  const parts = normalized.split(' ').filter(Boolean)
  return Array.from(
    new Set([
      name.toLowerCase(),
      normalized,
      parts.join('_'),
      parts.join('-'),
      parts.join(''),
    ].filter(Boolean)),
  )
}

const levenshtein = (a: string, b: string) => {
  const lowerA = a.toLowerCase()
  const lowerB = b.toLowerCase()
  const matrix: number[][] = []
  for (let i = 0; i <= lowerB.length; i += 1) matrix[i] = [i]
  for (let j = 0; j <= lowerA.length; j += 1) matrix[0][j] = j
  for (let i = 1; i <= lowerB.length; i += 1) {
    for (let j = 1; j <= lowerA.length; j += 1) {
      if (lowerB[i - 1] === lowerA[j - 1]) matrix[i][j] = matrix[i - 1][j - 1]
      else {
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

const similarity = (a: string, b: string) => {
  const max = Math.max(a.length, b.length)
  if (max === 0) return 1
  const distance = levenshtein(a, b)
  return 1 - distance / max
}

const typeCompatibility = (a: string, b: string) => {
  if (a === b) return 1
  if (a === 'string' && ['text', 'slug', 'url'].includes(b)) return 0.7
  if (b === 'string' && ['text', 'slug', 'url'].includes(a)) return 0.7
  if (['number', 'integer'].includes(a) && ['number', 'integer'].includes(b)) return 0.9
  if (['datetime', 'date'].includes(a) && ['datetime', 'date'].includes(b)) return 0.85
  if (a === 'array' && b === 'array') return 0.8
  return 0.25
}

const overlap = (a: string[] = [], b: string[] = []) => {
  const setA = new Set(a)
  const setB = new Set(b)
  let matches = 0
  setA.forEach((value) => {
    if (setB.has(value)) matches += 1
  })
  const denom = Math.max(setA.size, setB.size, 1)
  return matches / denom
}

const structuralScore = (source: SourceField, target: TargetField) => {
  const sourceDepth = (source.path || source.name).split('.').length
  const targetDepth = target.depth ?? target.path.split('.').length
  return Math.max(0, 1 - Math.abs(sourceDepth - targetDepth) * 0.15)
}

const rankCandidates = (
  source: SourceField,
  targets: TargetField[],
): MappingCandidate[] => {
  return targets.map((target) => {
    const nameVariants = createNameVariants(source.name)
    const targetVariants = createNameVariants(target.name)
    const nameScore = Math.max(
      similarity(source.name, target.name),
      ...nameVariants.map((variant) =>
        Math.max(similarity(variant, target.name), ...targetVariants.map((tv) => similarity(variant, tv))),
      ),
    )

    const semanticScore = overlap(source.semanticTags, target.semanticTags)
    const structure = structuralScore(source, target)
    const typeScore = typeCompatibility(source.type, target.type)

    const total =
      NAME_WEIGHT * nameScore +
      TYPE_WEIGHT * typeScore +
      SEMANTIC_WEIGHT * semanticScore +
      STRUCTURE_WEIGHT * structure

    const breakdown: ConfidenceBreakdown = {
      name: Number(nameScore.toFixed(3)),
      type: Number(typeScore.toFixed(3)),
      semantic: Number(semanticScore.toFixed(3)),
      structural: Number(structure.toFixed(3)),
      total: Number(Math.max(0, Math.min(1, total)).toFixed(3)),
    }

    const rationale: string[] = []
    if (breakdown.name >= 0.7) rationale.push('strong name match')
    if (breakdown.type >= 0.7) rationale.push('type compatible')
    if (breakdown.semantic >= 0.5) rationale.push('semantic tags aligned')
    if (breakdown.structural >= 0.7) rationale.push('similar depth')
    if (rationale.length === 0) rationale.push('rule-based fallback')

    return {
      target,
      breakdown,
      status: classifyConfidence(breakdown.total),
      rationale,
    }
  })
}

const mapAiResponse = (
  ai: AiMapping[],
  sources: SourceField[],
  targets: TargetField[],
): MappingSuggestion[] => {
  const findTarget = (name: string): TargetField | undefined => {
    const exact = targets.find((t) => t.path === name) || targets.find((t) => t.name === name)
    if (exact) return exact
    let best: TargetField | null = null
    let bestScore = -1
    targets.forEach((candidate) => {
      const score = similarity(name, candidate.name)
      if (score > bestScore) {
        best = candidate
        bestScore = score
      }
    })
    return best ?? undefined
  }

  const bySource: Record<string, MappingCandidate[]> = {}

  ai.forEach((entry) => {
    const target = findTarget(entry.target)
    if (!target) return
    const confidence = typeof entry.confidence === 'number' ? Math.max(0, Math.min(100, entry.confidence)) / 100 : undefined
    const baseScore = confidence ?? rankCandidates({name: entry.source, type: 'string'}, [target])[0]?.breakdown.total ?? 0.5
    const candidate: MappingCandidate = {
      target,
      breakdown: {
        name: Number(baseScore.toFixed(3)),
        type: 0.5,
        semantic: 0.5,
        structural: 0.5,
        total: Number(baseScore.toFixed(3)),
      },
      status: classifyConfidence(baseScore),
      rationale: entry.rationale?.length ? entry.rationale : ['ai-assisted'],
    }
    bySource[entry.source] = bySource[entry.source]
      ? [...bySource[entry.source], candidate]
      : [candidate]
  })

  return sources.map((source) => ({
    source,
    suggestions: bySource[source.name] || rankCandidates(source, targets),
  }))
}

const fallbackSuggestions = (
  sources: SourceField[],
  targets: TargetField[],
): MappingSuggestion[] =>
  sources.map((source) => ({
    source,
    suggestions: rankCandidates(source, targets),
  }))

const buildPrompt = (
  sources: SourceField[],
  targets: TargetField[],
  existingMappings?: Record<string, string>,
) => {
  const sourceList = sources
    .map((f) => `- ${f.name} (${f.type}) ${f.semanticTags ? `[${f.semanticTags.join(', ')}]` : ''}`)
    .join('\n')
  const targetList = targets
    .map((f) => `- ${f.path} (${f.type}) ${f.semanticTags ? `[${f.semanticTags.join(', ')}]` : ''}`)
    .join('\n')
  const mappingList =
    existingMappings && Object.keys(existingMappings).length > 0
      ? Object.entries(existingMappings)
          .map(([source, target]) => `- ${source} -> ${target}`)
          .join('\n')
      : null

  return [
    'You suggest mappings between source fields and Sanity target fields.',
    'Respond with JSON: {"mappings":[{"source":"sourceName","target":"targetPath","confidence":0-100,"rationale":["string"]}]}',
    'Prefer high-confidence matches; include only likely pairs.',
    'Source fields:',
    sourceList,
    'Target fields:',
    targetList,
    mappingList ? 'Existing mappings:' : '',
    mappingList || '',
  ].join('\n')
}

const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {statusCode: 405, body: 'Method Not Allowed'}
  }

  try {
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : {}
    const feedback: FeedbackEntry[] = Array.isArray(body?.feedback) ? body.feedback : []

    if (feedback.length > 0) {
      try {
        const stored = await persistFeedback(feedback, {
          requestId: body.requestId,
          strategy: body.strategy,
          model: body.model,
        })
        return {
          statusCode: 200,
          body: JSON.stringify({
            status: 'ok',
            feedbackStored: stored.stored,
            feedbackCount: feedback.length,
            meta: stored,
          }),
          headers: {'Content-Type': 'application/json'},
        }
      } catch (err) {
        console.error('ai-suggest-mappings: feedback persist failed', err)
        return {statusCode: 500, body: JSON.stringify({error: 'Feedback persistence failed'})}
      }
    }

    const sources: SourceField[] = Array.isArray(body?.sourceFields) ? body.sourceFields : []
    const targets: TargetField[] = Array.isArray(body?.targetFields) ? body.targetFields : []
    const existingMappings = body?.existingMappings && typeof body.existingMappings === 'object'
      ? body.existingMappings
      : undefined

    if (!sources.length || !targets.length) {
      return {
        statusCode: 400,
        body: JSON.stringify({error: 'sourceFields and targetFields are required arrays'}),
      }
    }

    const apiKey =
      process.env.OPENAI_API_KEY ||
      process.env.SANITY_STUDIO_OPENAI_API_KEY ||
      process.env.VITE_OPENAI_API_KEY
    const model = process.env.OPENAI_MODEL || process.env.SANITY_STUDIO_OPENAI_MODEL || 'gpt-4o-mini'

    let suggestions: MappingSuggestion[] | null = null
    let used = 'rule-based'
    let message = 'Used rule-based fallback'
    const requestId = body?.requestId || randomId()

    if (apiKey) {
      try {
        const prompt = buildPrompt(sources, targets, existingMappings)
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            messages: [
              {role: 'system', content: 'You are an expert data-mapping assistant.'},
              {role: 'user', content: prompt},
            ],
            temperature: 0.2,
          }),
        })

        if (response.ok) {
          const json = await response.json()
          const content: string =
            json?.choices?.[0]?.message?.content ||
            json?.choices?.[0]?.message?.content?.[0]?.text ||
            ''

          try {
            const parsed = JSON.parse(content)
            if (Array.isArray(parsed?.mappings)) {
              suggestions = mapAiResponse(parsed.mappings as AiMapping[], sources, targets)
              used = 'ai'
              message = 'AI suggestions returned'
            }
          } catch {
            // fall back below
          }
        }
      } catch (err) {
        console.error('ai-suggest-mappings: AI request failed', err)
      }
    } else {
      message = 'OPENAI_API_KEY missing; used rule-based suggestions'
    }

    if (!suggestions) {
      suggestions = fallbackSuggestions(sources, targets)
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        suggestions,
        meta: {
          sourceCount: sources.length,
          targetCount: targets.length,
          strategy: used,
          message,
          model,
          requestId,
          prompt: buildPrompt(sources, targets, existingMappings),
        },
      }),
      headers: {'Content-Type': 'application/json'},
    }
  } catch (err) {
    console.error('ai-suggest-mappings: unhandled error', err)
    return {statusCode: 500, body: JSON.stringify({error: 'Internal error'})}
  }
}

export {handler}
const randomId = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(16).slice(2))

const buildFeedbackClient = () => {
  const token =
    process.env.SANITY_AI_FEEDBACK_TOKEN ||
    process.env.SANITY_API_TOKEN ||
    process.env.SANITY_STUDIO_API_TOKEN
  const projectId =
    process.env.SANITY_STUDIO_PROJECT_ID || process.env.SANITY_PROJECT_ID || process.env.SANITY_PROJECT
  const dataset = process.env.SANITY_STUDIO_DATASET || process.env.SANITY_DATASET

  if (!token || !projectId || !dataset) return null

  return createClient({
    projectId,
    dataset,
    apiVersion: '2024-10-01',
    token,
    useCdn: false,
  })
}

const persistFeedback = async (entries: FeedbackEntry[], meta: {requestId?: string; strategy?: string; model?: string}) => {
  const client = buildFeedbackClient()
  if (!client) return {stored: false, reason: 'Missing SANITY config'}

  const docs = entries.map((entry) => ({
    _type: 'aiMappingFeedback',
    requestId: entry.requestId || meta.requestId || randomId(),
    strategy: entry.strategy || meta.strategy || 'ai',
    model: entry.model || meta.model || 'unknown',
    source: entry.source,
    target: entry.target,
    accepted: entry.accepted,
    confidence: entry.confidence,
    targetDocument: entry.targetDocument,
    rationale: entry.rationale,
    createdAt: new Date().toISOString(),
  }))

  const tx = client.transaction()
  docs.forEach((doc) => tx.create(doc))
  await tx.commit({visibility: 'async'})
  return {stored: true, count: docs.length}
}
