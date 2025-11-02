export type BlueprintResource = {
  type: 'document-function'
  name: string
  title?: string
  description?: string
  path: string
}

export type BlueprintDefinition = {
  name: string
  title?: string
  description?: string
  resources: BlueprintResource[]
}

export const defineDocumentFunction = (resource: Omit<BlueprintResource, 'type'>): BlueprintResource => ({
  ...resource,
  type: 'document-function',
})

export const defineBlueprint = (definition: BlueprintDefinition): BlueprintDefinition => definition

export default defineBlueprint({
  name: 'fas-doc-mapping-blueprint',
  title: 'FAS Document Functions',
  description: 'Registers the universal document mapping Sanity function.',
  resources: [
    defineDocumentFunction({
      name: 'doc-mapping',
      title: 'Universal Document Mapping',
      description:
        'Synchronizes related documents (orders, invoices, shipping labels, products) and maintains mapping records.',
      path: './functions/doc-mapping',
    }),
  ],
})
