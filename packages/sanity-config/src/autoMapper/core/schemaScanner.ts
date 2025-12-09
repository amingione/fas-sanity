import type {SchemaTypeDefinition} from 'sanity'
import Fuse from 'fuse.js'
import {
  FieldMetadata,
  SanitySchemaField,
  SchemaIndex,
  SchemaIndexSnapshot,
  SchemaSearchResult,
} from '../types'
import {buildSearchTerms, detectSemanticTags} from '../utils/semanticTags'
import {createNameVariants} from '../utils/stringMetrics'

type TypeLookup = Map<string, SchemaTypeDefinition>

const joinPath = (parts: string[]) => parts.filter(Boolean).join('.')

const collectValidationRules = (validation: unknown): {rules: string[]; required: boolean} => {
  const rules = new Set<string>()
  let required = false

  if (typeof validation === 'function') {
    // Capture common Rule helpers without executing user logic.
    const Rule: Record<string, (...args: any[]) => any> = {
      required: () => {
        required = true
        rules.add('required')
        return Rule
      },
      min: (value: number) => {
        rules.add(`min:${value}`)
        return Rule
      },
      max: (value: number) => {
        rules.add(`max:${value}`)
        return Rule
      },
      length: (value: number) => {
        rules.add(`length:${value}`)
        return Rule
      },
      email: () => {
        rules.add('email')
        return Rule
      },
      uri: () => {
        rules.add('uri')
        return Rule
      },
      integer: () => {
        rules.add('integer')
        return Rule
      },
      // No-op placeholders for chaining
      custom: () => Rule,
      positive: () => Rule,
      nonnegative: () => Rule,
      precision: () => Rule,
    }

    try {
      validation(Rule as any)
    } catch {
      // Ignore validation execution issues to keep scanning resilient
    }
  }

  return {rules: Array.from(rules), required}
}

class SchemaIndexImpl implements SchemaIndex {
  fields: SanitySchemaField[]
  fieldsByPath: Map<string, SanitySchemaField>
  documents: Map<string, SanitySchemaField[]>
  private fuse: Fuse<SanitySchemaField>

  constructor(fields: SanitySchemaField[]) {
    this.fields = fields
    this.fieldsByPath = new Map(fields.map((field) => [field.path, field]))
    this.documents = fields.reduce<Map<string, SanitySchemaField[]>>((acc, field) => {
      const existing = acc.get(field.documentType) || []
      existing.push(field)
      acc.set(field.documentType, existing)
      return acc
    }, new Map())

    this.fuse = new Fuse(fields, {
      includeScore: true,
      ignoreLocation: true,
      threshold: 0.45,
      keys: [
        {name: 'name', weight: 0.35},
        {name: 'title', weight: 0.2},
        {name: 'metadata.searchTerms', weight: 0.2},
        {name: 'metadata.nameVariants', weight: 0.25},
      ],
    })
  }

  search(query: string, limit = 8): SchemaSearchResult[] {
    if (!query.trim()) return []
    return this.fuse.search(query, {limit}).map((result) => ({
      field: result.item,
      score: result.score ?? 0,
    }))
  }

  getDocumentFields(docType: string) {
    return this.documents.get(docType) || []
  }

  snapshot(): SchemaIndexSnapshot {
    const tags: SchemaIndexSnapshot['tags'] = {
      monetary: 0,
      temporal: 0,
      identifier: 0,
      contact: 0,
      location: 0,
      status: 0,
      quantity: 0,
      metadata: 0,
      boolean: 0,
      text: 0,
    }

    this.fields.forEach((field) => {
      field.metadata.semanticTags.forEach((tag) => {
        tags[tag] = (tags[tag] || 0) + 1
      })
    })

    return {
      documents: Array.from(this.documents.keys()),
      totalFields: this.fields.length,
      tags,
    }
  }
}

export class SchemaScanner {
  private lookup: TypeLookup
  private visitedPaths = new Set<string>()

  constructor(private schemaTypes: SchemaTypeDefinition[]) {
    this.lookup = schemaTypes.reduce<TypeLookup>((acc, typeDef) => {
      if (typeDef?.name) acc.set(typeDef.name, typeDef)
      return acc
    }, new Map())
  }

  scan(): SchemaIndex {
    this.visitedPaths.clear()
    const fields: SanitySchemaField[] = []

    this.schemaTypes
      .filter((type) => (type as any).type === 'document')
      .forEach((docType) => {
        if (!docType.fields) return
        docType.fields.forEach((field) => {
          const discovered = this.walkField(field as any, {
            documentType: docType.name,
            parentPath: [],
            depth: 0,
            parentType: docType.name,
          })
          fields.push(...discovered)
        })
      })

    return new SchemaIndexImpl(fields)
  }

  private walkField(
    fieldDef: any,
    context: {documentType: string; parentPath: string[]; depth: number; parentType?: string},
  ): SanitySchemaField[] {
    const resolvedName = fieldDef.name || fieldDef.title || 'unnamed'
    const pathParts = [...context.parentPath, resolvedName]
    const path = joinPath(pathParts)
    const typeName = fieldDef.type || 'unknown'
    const isArray = typeName === 'array'
    const isReference = typeName === 'reference'
    const {rules, required} = collectValidationRules(fieldDef.validation)
    const nameVariants = createNameVariants(resolvedName)
    const searchTerms = buildSearchTerms(resolvedName, fieldDef.title)
    const semanticTags = detectSemanticTags(resolvedName, typeName)
    const metadata: FieldMetadata = {
      path,
      depth: context.depth,
      type: typeName,
      parentType: context.parentType,
      isArray,
      isReference,
      validationRules: rules,
      required,
      semanticTags,
      searchTerms,
      nameVariants,
      description: fieldDef.description,
    }

    const schemaField: SanitySchemaField = {
      name: resolvedName,
      title: fieldDef.title,
      type: typeName,
      documentType: context.documentType,
      path,
      metadata,
      fieldDef,
    }

    const collected: SanitySchemaField[] = [schemaField]
    const nextDepth = context.depth + 1

    if (isArray && Array.isArray(fieldDef.of)) {
      // Represent the array item itself for visibility in the path.
      const arrayItemPath = joinPath([...context.parentPath, `${resolvedName}[]`])
      const itemField: SanitySchemaField = {
        name: `${resolvedName}[]`,
        title: `${fieldDef.title || resolvedName} Item`,
        type: 'arrayItem',
        documentType: context.documentType,
        path: arrayItemPath,
        metadata: {
          ...metadata,
          path: arrayItemPath,
          isArray: true,
          isReference: isReference || fieldDef.of.some((entry: any) => entry.type === 'reference'),
        },
        fieldDef,
      }
      collected.push(itemField)

      fieldDef.of.forEach((ofDef: any, index: number) => {
        const typeDef = this.resolveType(ofDef)
        if (typeDef?.fields) {
          typeDef.fields.forEach((child: any) => {
            collected.push(
              ...this.walkField(child, {
                documentType: context.documentType,
                parentPath: [...context.parentPath, `${resolvedName}[${index}]`],
                depth: nextDepth,
                parentType: typeDef.name || 'arrayItem',
              }),
            )
          })
        } else if (ofDef.fields) {
          ofDef.fields.forEach((child: any) => {
            collected.push(
              ...this.walkField(child, {
                documentType: context.documentType,
                parentPath: [...context.parentPath, `${resolvedName}[${index}]`],
                depth: nextDepth,
                parentType: ofDef.name || 'arrayItem',
              }),
            )
          })
        }
      })
    }

    const resolvedType = this.resolveType(fieldDef)
    const nestedFields = resolvedType?.fields || fieldDef.fields
    if (nestedFields && Array.isArray(nestedFields)) {
      nestedFields.forEach((child: any) => {
        const childPath = joinPath([...context.parentPath, resolvedName, child.name || 'field'])
        if (this.visitedPaths.has(childPath)) return
        this.visitedPaths.add(childPath)
        collected.push(
          ...this.walkField(child, {
            documentType: context.documentType,
            parentPath: [...context.parentPath, resolvedName],
            depth: nextDepth,
            parentType: resolvedType?.name || fieldDef.type,
          }),
        )
      })
    }

    return collected
  }

  private resolveType(def: any): SchemaTypeDefinition | undefined {
    if (!def) return undefined
    if (def.fields) return def as SchemaTypeDefinition
    const typeName = typeof def.type === 'string' ? def.type : def?.name
    if (!typeName) return undefined
    return this.lookup.get(typeName)
  }
}
