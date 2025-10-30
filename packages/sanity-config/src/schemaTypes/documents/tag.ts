import {defineField, defineType} from 'sanity'

const UNIQUE_NAME_ERROR = 'Tag name must be unique'

const createUniqueNameValidator = () =>
  async (value: unknown, context: Record<string, any>) => {
    const name = typeof value === 'string' ? value.trim() : ''
    if (!name) return true

    const client = context?.getClient?.({apiVersion: '2024-10-01'})
    if (!client) return true

    const documentId = context?.document?._id as string | undefined
    const omitIds = new Set<string>()
    if (documentId) {
      omitIds.add(documentId)
      omitIds.add(documentId.startsWith('drafts.') ? documentId.slice(7) : `drafts.${documentId}`)
    }

    const params = {
      nameLower: name.toLowerCase(),
      omitIds: Array.from(omitIds),
    }

    const count = await client.fetch<number>(
      'count(*[_type == "tag" && lower(name) == $nameLower && !(_id in $omitIds)])',
      params,
    )

    return count === 0 ? true : UNIQUE_NAME_ERROR
  }

export default defineType({
  name: 'tag',
  title: 'Tag',
  type: 'document',
  fields: [
    defineField({
      name: 'name',
      title: 'Name',
      type: 'string',
      validation: (Rule) => Rule.required().custom(createUniqueNameValidator()),
      description: 'Unique tag name used for filtering and grouping orders.',
    }),
    defineField({
      name: 'color',
      title: 'Color',
      type: 'string',
      description: 'Optional hex color used for tag pills in the orders desk.',
    }),
  ],
})
