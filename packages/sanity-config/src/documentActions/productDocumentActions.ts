import {useState} from 'react'
import {useToast} from '@sanity/ui'
import {CopyIcon, LaunchIcon} from '@sanity/icons'
import type {DocumentActionComponent, DocumentActionProps, DocumentActionsContext} from 'sanity'
import {generateProductTags, type ProductDocument} from '../utils/generateProductTags'
import {ensureProductCodes} from '../utils/generateProductCodes'
import {ensureShippingConfig} from '../utils/ensureShippingConfig'
import {ensureSalePricing} from '../utils/ensureSalePricing'
import {getNetlifyFunctionBaseCandidates} from '../utils/netlifyBase'
import {ensureProductMetaAndStatus} from '../utils/ensureProductMeta'

const API_VERSION = '2024-10-01'
const TAG_ACTIONS_FLAG = Symbol.for('fas.productTagsApplied')

type TagActionArray = DocumentActionComponent[] & {
  [TAG_ACTIONS_FLAG]?: boolean
}

function isProduct(props: DocumentActionProps) {
  return props.type === 'product'
}

const isServiceProduct = (props: DocumentActionProps): boolean => {
  if (!isProduct(props)) return false
  const source = (props.draft || props.published) as ProductDocument | undefined
  const productType = typeof source?.productType === 'string' ? source.productType.toLowerCase() : ''
  return productType === 'service'
}

const buildDraftId = () => {
  const suffix =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2)
  return `drafts.${suffix}`
}

const normalizeSlug = (value?: string | null) => {
  if (!value) return ''
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
}

const buildCopySlug = (source?: ProductDocument | null) => {
  const base =
    normalizeSlug(source?.slug?.current) ||
    normalizeSlug(source?.title || '') ||
    'performance-package'
  const suffix =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().slice(0, 6)
      : Math.random().toString(36).slice(2, 8)
  return `${base}-copy-${suffix}`.slice(0, 96)
}

const buildPreviewBaseUrl = () => {
  const envSite =
    (typeof process !== 'undefined' &&
      (process.env.SANITY_STUDIO_SITE_URL || process.env.VITE_SITE_URL)) ||
    ''
  const isDev =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  const normalizedEnv = envSite.replace(/\/$/, '')
  if (isDev) return 'http://localhost:3000'
  if (normalizedEnv) return normalizedEnv
  if (typeof window !== 'undefined') return window.location.origin.replace(/\/$/, '')
  return 'https://fasmotorsports.com'
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
    await ensureProductMetaAndStatus(targetId, client, {
      log: (...args: unknown[]) => console.log('[product-meta]', ...args),
    })
  } catch (error) {
    console.warn(
      'Failed to auto-generate SKU/MPN, shipping config, sale pricing, or meta before publish',
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

const createDuplicateServicePackageAction =
  (context: DocumentActionsContext): DocumentActionComponent =>
  (props) => {
    const toast = useToast()
    const [busy, setBusy] = useState(false)
    const client = context.getClient({apiVersion: API_VERSION})
    const source = (props.draft || props.published) as ProductDocument | undefined

    if (!isServiceProduct(props) || !source) return null

    return {
      label: 'Duplicate Package',
      icon: CopyIcon,
      disabled: busy,
      onHandle: async () => {
        setBusy(true)
        try {
          const {
            _id,
            _rev,
            _createdAt,
            _updatedAt,
            sku,
            mpn,
            slug,
            stripeProductId,
            stripeDefaultPriceId,
            stripePriceId,
            stripeActive,
            ...rest
          } = source as any

          const duplicateTitle = source.title ? `${source.title} (Copy)` : 'Performance Package Copy'
          const draftId = buildDraftId()
          const copySlug = buildCopySlug(source)
          const payload: {_type: 'product'; _id: string} & Record<string, unknown> = {
            ...rest,
            _id: draftId,
            _type: 'product',
            title: duplicateTitle,
            status: 'draft',
            productType: 'service',
            slug: copySlug ? {_type: 'slug', current: copySlug} : undefined,
            stripeProductId: undefined,
            stripeDefaultPriceId: undefined,
            stripePriceId: undefined,
            stripeActive: false,
            sku: undefined,
            mpn: undefined,
          }

          const created = await client.create(payload)
          const codes = await ensureProductCodes(created._id, client, {
            log: (...args: unknown[]) => console.log('[duplicate-service-package]', ...args),
          })
          const canonicalId = toPublishedId(created._id)
          if (typeof window !== 'undefined') {
            const studioBase = window.location.origin.replace(/\/$/, '')
            window.open(`${studioBase}/desk/product;${canonicalId}`, '_blank', 'noopener')
          }
          toast.push({
            status: 'success',
            title: 'Package duplicated',
            description:
              codes?.sku && codes.generated
                ? `Created ${duplicateTitle} with SKU ${codes.sku}.`
                : `Created ${duplicateTitle}.`,
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          toast.push({status: 'error', title: 'Duplicate failed', description: message})
        } finally {
          setBusy(false)
          props.onComplete()
        }
      },
    }
  }

const createPreviewServicePackageAction =
  (_context: DocumentActionsContext): DocumentActionComponent =>
  (props) => {
    const toast = useToast()
    const source = (props.draft || props.published) as ProductDocument | undefined
    const slug = source?.slug?.current
    const title = source?.title || 'Performance Package'

    if (!isServiceProduct(props)) return null

    return {
      label: 'Preview on Site',
      icon: LaunchIcon,
      disabled: !slug,
      title: slug ? undefined : 'Add a slug to preview this package',
      onHandle: () => {
        if (!slug) {
          toast.push({
            status: 'warning',
            title: 'Missing slug',
            description: 'Add a URL slug to preview this performance package.',
          })
          props.onComplete()
          return
        }

        const baseUrl = buildPreviewBaseUrl()
        const previewUrl = `${baseUrl}/products/${slug}`
        if (typeof window !== 'undefined') {
          window.open(previewUrl, '_blank', 'noopener')
        }
        toast.push({status: 'success', title: 'Opening preview', description: title})
        props.onComplete()
      },
    }
  }

const createSyncStripeAction =
  (_context: DocumentActionsContext): DocumentActionComponent =>
  (props) => {
    const toast = useToast()
    const bases = getNetlifyFunctionBaseCandidates()

    if (!isProduct(props)) return null

    return {
      label: 'Sync to Stripe',
      icon: LaunchIcon,
      tone: 'primary',
      onHandle: async () => {
        const targetId = props.draft?._id || props.published?._id || props.id
        if (!targetId) {
          toast.push({status: 'warning', title: 'Missing product id'})
          props.onComplete()
          return
        }

        let lastError: string | null = null
        for (const base of bases) {
          try {
            const response = await fetch(`${base}/.netlify/functions/syncStripeCatalog`, {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({mode: 'ids', ids: [targetId]}),
            })
            if (response.ok) {
              toast.push({status: 'success', title: 'Stripe sync triggered'})
              props.onComplete()
              return
            }
            const message = await response.text()
            lastError = message || response.statusText
          } catch (error) {
            lastError =
              error instanceof Error ? error.message : typeof error === 'string' ? error : 'Error'
          }
        }

        toast.push({
          status: 'warning',
          title: 'Unable to trigger Stripe sync',
          description: lastError || 'No Netlify base responded',
        })
        props.onComplete()
      },
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
  const duplicateServicePackageAction = createDuplicateServicePackageAction(context)
  const previewServicePackageAction = createPreviewServicePackageAction(context)
  const syncStripeAction = createSyncStripeAction(context)

  const enhancedList = prev.map((action) => {
    if (!action) return action

    const wrapped: DocumentActionComponent = (props) => {
      const original = action(props)
      if (!original || !isProduct(props)) return original
      const originalName =
        typeof (original as any)?.name === 'string' ? (original as any).name : null
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

  const enhanced: TagActionArray = [
    ...enhancedList,
    generateTagsAction,
    duplicateServicePackageAction,
    previewServicePackageAction,
    syncStripeAction,
  ]
  Object.defineProperty(enhanced, TAG_ACTIONS_FLAG, {value: true})

  return enhanced
}
