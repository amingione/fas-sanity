export type FieldSemanticTag =
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

export type MappingConfidence = 'high' | 'medium' | 'low'

export interface FieldMetadata {
  path: string
  depth: number
  type: string
  parentType?: string
  isArray: boolean
  isReference: boolean
  validationRules: string[]
  required: boolean
  semanticTags: FieldSemanticTag[]
  searchTerms: string[]
  nameVariants: string[]
  description?: string
}

export interface SanitySchemaField {
  name: string
  title?: string
  type: string
  documentType: string
  path: string
  metadata: FieldMetadata
  fieldDef: unknown
}

export interface SchemaSearchResult {
  field: SanitySchemaField
  score: number
}

export interface SchemaIndexSnapshot {
  documents: string[]
  totalFields: number
  tags: Record<FieldSemanticTag, number>
}

export interface SchemaIndex {
  fields: SanitySchemaField[]
  fieldsByPath: Map<string, SanitySchemaField>
  documents: Map<string, SanitySchemaField[]>
  search: (query: string, limit?: number) => SchemaSearchResult[]
  getDocumentFields: (docType: string) => SanitySchemaField[]
  snapshot: () => SchemaIndexSnapshot
}

export interface SourceField {
  name: string
  type: string
  path?: string
  description?: string
  semanticTags?: FieldSemanticTag[]
  sampleValues?: unknown[]
}

export interface ConfidenceBreakdown {
  name: number
  type: number
  semantic: number
  structural: number
  total: number
}

export interface MappingCandidate {
  target: SanitySchemaField
  breakdown: ConfidenceBreakdown
  status: MappingConfidence
  rationale: string[]
}

export interface MappingSuggestion {
  source: SourceField
  suggestions: MappingCandidate[]
}

export type DataSourceType = 'stripe' | 'csv' | 'json' | 'api'

export interface ParsedCommand {
  intent: 'map-field' | 'import-type' | 'convert-type' | 'set-field'
  sourceField?: string
  targetField?: string
  sourceType?: string
  targetType?: string
  raw: string
}

export interface CommandMappingResult {
  parsed: ParsedCommand
  suggestion?: MappingSuggestion
  message?: string
}
