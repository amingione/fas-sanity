import {defineField, defineType} from 'sanity'

const UNIQUE_EVENT_ERROR = 'Event ID must be unique'

const uniqueEventValidator = () =>
  async (value: unknown, context: Record<string, any>) => {
    const eventId = typeof value === 'string' ? value.trim() : ''
    if (!eventId) return true

    const client = context?.getClient?.({apiVersion: '2024-10-01'})
    if (!client) return true

    const documentId = context?.document?._id as string | undefined
    const omitIds = new Set<string>()
    if (documentId) {
      omitIds.add(documentId)
      omitIds.add(documentId.startsWith('drafts.') ? documentId.slice(7) : `drafts.${documentId}`)
    }

    const params = {
      eventId,
      omitIds: Array.from(omitIds),
    }

    const count = await client.fetch<number>(
      'count(*[_type == "stripeEvent" && eventId == $eventId && !(_id in $omitIds)])',
      params,
    )

    return count === 0 ? true : UNIQUE_EVENT_ERROR
  }

export default defineType({
  name: 'stripeEvent',
  title: 'Stripe Event',
  type: 'document',
  fields: [
    defineField({
      name: 'eventId',
      title: 'Event ID',
      type: 'string',
      validation: (Rule) => Rule.required().custom(uniqueEventValidator()),
      description: 'Unique Stripe event identifier.',
    }),
    defineField({
      name: 'type',
      title: 'Type',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'receivedAt',
      title: 'Received at',
      type: 'datetime',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'order',
      title: 'Order',
      type: 'reference',
      to: [{type: 'order'}],
    }),
    defineField({
      name: 'raw',
      title: 'Raw payload',
      type: 'json',
      validation: (Rule) => Rule.required(),
    }),
  ],
})
