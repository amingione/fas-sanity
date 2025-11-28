import type {
  DocumentActionComponent,
  DocumentActionProps,
  DocumentActionsContext,
} from 'sanity'
import {generateProductTags, type ProductDocument} from '../utils/generateProductTags'
import {ensureProductCodes} from '../utils/generateProductCodes'
import {ensureShippingConfig} from '../utils/ensureShippingConfig'
import {ensureSalePricing} from '../utils/ensureSalePricing'

const API_VERSION = '2024-10-01'
const TAG_ACTIONS_FLAG = Symbol.for('fas.productTagsApplied')

type TagActionArray = DocumentActionComponent[] & {
  [TAG_ACTIONS_FLAG]?: boolean
}

function isProduct(props: DocumentActionProps) {
  return props.type === 'product'
}

function toPublishedId(id: string) {
  return id.replace(/^drafts\./, '')
}

async function refreshAndGenerateTags(
  context: DocumentActionsContext,
  props: DocumentActionProps,
  {patchDraft}: {patchDraft: boolean},
) {
  const client = context.getClient({apiVersion: API_VERSION})
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

async function ensureCodesBeforePublish(
  context: DocumentActionsContext,
  props: DocumentActionProps,
) {
  const client = context.getClient({apiVersion: API_VERSION})
  const targetId = props.draft?._id || props.id

  if (!targetId) return

  try {
    await ensureShippingConfig(targetId, client, {
      log: (...args: unknown[]) => console.log('[shipping-config]', ...args),
    })
    await ensureSalePricing(targetId, client, {
      log: (...args: unknown[]) => console.log('[sale-pricing]', ...args),
    })
    await ensureProductCodes(targetId, client, {
      log: (...args: unknown[]) => console.log('[product-codes]', ...args),
    })
  } catch (error) {
    console.warn(
      'Failed to auto-generate SKU/MPN, shipping config, or sale pricing before publish',
      error,
    )
  }
}

const createGenerateTagsAction =
  (context: DocumentActionsContext): DocumentActionComponent =>
  (props) => {
    if (!isProduct(props)) return null

    return {
      label: 'Generate SEO Tags',
      onHandle: async () => {
        try {
          await refreshAndGenerateTags(context, props, {patchDraft: true})
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

  const generateTagsAction = createGenerateTagsAction(context)

  const enhancedList = prev.map((action) => {
    if (!action) return action

      const wrapped: DocumentActionComponent = (props) => {
        const original = action(props)
        if (!original || !isProduct(props)) return original
        const originalName = typeof (original as any)?.name === 'string' ? (original as any).name : null
        if (originalName !== 'publish') return original

        return {
          ...original,
          label: 'Publish with Codes, Shipping, Sales & SEO Tags',
          onHandle: async () => {
            try {
              await ensureCodesBeforePublish(context, props)
              const result = original.onHandle?.()
              await Promise.resolve(result)
            await refreshAndGenerateTags(context, props, {patchDraft: false})
          } finally {
            props.onComplete()
          }
        },
      }
    }

    return Object.assign(wrapped, action)
  })

  const enhanced: TagActionArray = [...enhancedList, generateTagsAction]
  Object.defineProperty(enhanced, TAG_ACTIONS_FLAG, {value: true})

  return enhanced
}
