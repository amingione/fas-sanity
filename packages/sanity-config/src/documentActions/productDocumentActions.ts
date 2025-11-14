import type {
  DocumentActionComponent,
  DocumentActionProps,
  DocumentActionsContext,
} from 'sanity'
import {generateProductTags, type ProductDocument} from '../utils/generateProductTags'

const API_VERSION = '2024-10-01'
const TAG_ACTIONS_FLAG = Symbol.for('fas.productTagsApplied')

type TagActionArray = DocumentActionComponent[] & {
  [TAG_ACTIONS_FLAG]?: boolean
}

function isProduct(props: DocumentActionProps) {
  return props.schemaType === 'product'
}

function toPublishedId(id: string) {
  return id.replace(/^drafts\./, '')
}

function getClient(context: DocumentActionsContext) {
  return context.getClient({apiVersion: API_VERSION})
}

async function refreshAndGenerateTags(
  props: DocumentActionProps,
  {patchDraft}: {patchDraft: boolean}
) {
  const client = getClient(props.context)
  const targetId = patchDraft && props.draft?._id ? props.draft._id : toPublishedId(props.id)
  const latestDoc =
    (await client.getDocument<ProductDocument>(targetId)) ??
    (props.draft as ProductDocument | undefined) ??
    (props.published as ProductDocument | undefined)

  if (!latestDoc) {
    return
  }

  try {
    const mergedTags = await generateProductTags(latestDoc, client)
    await client.patch(targetId).set({tags: mergedTags}).commit({autoGenerateArrayKeys: true})
  } catch (error) {
    console.warn('Failed to generate product tags', error)
  }
}

const GenerateTagsAction: DocumentActionComponent = (props) => {
  if (!isProduct(props)) return null

  return {
    label: 'Generate SEO Tags',
    onHandle: async () => {
      try {
        await refreshAndGenerateTags(props, {patchDraft: true})
      } finally {
        props.onComplete()
      }
    },
    disabled: !props.draft && !props.published,
  }
}

export function resolveProductDocumentActions(
  prev: DocumentActionComponent[],
  context: DocumentActionsContext
): DocumentActionComponent[] {
  if (context.schemaType !== 'product') return prev

  const tagged = prev as TagActionArray
  if (tagged[TAG_ACTIONS_FLAG]) return prev

  const enhancedList = prev.map((action) => {
    if (!action) return action

    const wrapped: DocumentActionComponent = (props) => {
      const original = action(props)
      if (!original || !isProduct(props)) return original
      if (original.name !== 'publish') return original

      return {
        ...original,
        label: 'Publish with SEO Tags',
        onHandle: async () => {
          try {
            const result = original.onHandle?.()
            await (result instanceof Promise ? result : Promise.resolve(result))
          } finally {
            await refreshAndGenerateTags(props, {patchDraft: false})
          }
        },
      }
    }

    return Object.assign(wrapped, action)
  })

  const enhanced: TagActionArray = [...enhancedList, GenerateTagsAction]
  Object.defineProperty(enhanced, TAG_ACTIONS_FLAG, {value: true})

  return enhanced
}
