import {defineField, defineType} from 'sanity'
import {SearchIcon} from '@sanity/icons'

export default defineType({
  name: 'brandMention',
  title: 'Brand Mentions',
  type: 'document',
  icon: SearchIcon,
  fields: [
    defineField({name: 'source', title: 'Source', type: 'string', readOnly: true}),
    defineField({name: 'sourceTapId', title: 'Source Tap ID', type: 'string', readOnly: true}),
    defineField({name: 'url', title: 'URL', type: 'url', readOnly: true}),
    defineField({name: 'title', title: 'Title', type: 'string', readOnly: true}),
    defineField({name: 'domain', title: 'Domain', type: 'string', readOnly: true}),
    defineField({name: 'snippet', title: 'Snippet', type: 'text', rows: 5, readOnly: true}),
    defineField({name: 'language', title: 'Language', type: 'string', readOnly: true}),
    defineField({name: 'pageType', title: 'Page Type', type: 'string', readOnly: true}),
    defineField({name: 'pageCategory', title: 'Page Category', type: 'string', readOnly: true}),
    defineField({name: 'publishedAt', title: 'Published At', type: 'datetime', readOnly: true}),
    defineField({name: 'firstDetectedAt', title: 'First Detected At', type: 'datetime', readOnly: true}),
    defineField({name: 'lastDetectedAt', title: 'Last Detected At', type: 'datetime', readOnly: true}),
    defineField({name: 'seenCount', title: 'Seen Count', type: 'number', readOnly: true}),
    defineField({name: 'rawPayload', title: 'Raw Payload', type: 'text', rows: 8, readOnly: true}),
    defineField({name: 'readOnly', title: 'Read-Only Mirror', type: 'boolean', readOnly: true}),
  ],
  preview: {
    select: {
      title: 'title',
      domain: 'domain',
      seenCount: 'seenCount',
      lastDetectedAt: 'lastDetectedAt',
    },
    prepare({title, domain, seenCount, lastDetectedAt}: {
      title?: string
      domain?: string
      seenCount?: number
      lastDetectedAt?: string
    }) {
      const when = lastDetectedAt ? new Date(lastDetectedAt).toLocaleDateString() : '?'
      const count = typeof seenCount === 'number' ? seenCount : 0
      return {
        title: title || '(Untitled mention)',
        subtitle: `${domain || 'unknown domain'} · seen ${count}x · ${when}`,
      }
    },
  },
  orderings: [
    {
      title: 'Most Recent',
      name: 'lastDetectedAtDesc',
      by: [{field: 'lastDetectedAt', direction: 'desc'}],
    },
  ],
})
