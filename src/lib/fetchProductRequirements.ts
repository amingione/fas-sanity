import {createClient, type SanityClient} from '@sanity/client'
import type {
  ProductCustomizationRequirement,
  ProductOptionRequirement,
} from '../../shared/cartValidation'

export type ProductRequirements = {
  id: string
  slug?: string
  title?: string
  productType?: string
  options: ProductOptionRequirement[]
  customizations: ProductCustomizationRequirement[]
}

export type FetchProductRequirementsOptions = {
  client?: SanityClient
  productId?: string
  productSlug?: string
  projectId?: string
  dataset?: string
  apiVersion?: string
  perspective?: 'published' | 'previewDrafts'
}

const DEFAULT_API_VERSION = '2024-04-10'

const PRODUCT_REQUIREMENTS_QUERY = `
  *[_type == "product" && (
    defined($productId) && (_id == $productId || _id == concat("drafts.", $productId)) ||
    defined($productSlug) && slug.current == $productSlug
  )][0]{
    _id,
    "slug": slug.current,
    title,
    productType,
    "options": coalesce(options, [])[]{
      "name": coalesce(title, ""),
      "required": coalesce(required, true)
    },
    "customizations": coalesce(customizations, [])[]{
      "name": coalesce(title, ""),
      "required": coalesce(required, false)
    }
  }
`

function normalizeOption(option: any): ProductOptionRequirement | null {
  if (!option) return null
  const name = typeof option.name === 'string' ? option.name.trim() : ''
  if (!name) return null
  return {
    name,
    required: option.required !== false,
  }
}

function normalizeCustomization(customization: any): ProductCustomizationRequirement | null {
  if (!customization) return null
  const name = typeof customization.name === 'string' ? customization.name.trim() : ''
  if (!name) return null
  return {
    name,
    required: customization.required === true,
  }
}

function resolveProjectId(explicit?: string): string | undefined {
  return (
    explicit ||
    process.env.SANITY_STUDIO_PROJECT_ID ||
    process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ||
    process.env.SANITY_PROJECT_ID ||
    undefined
  )
}

function resolveDataset(explicit?: string): string | undefined {
  return (
    explicit ||
    process.env.SANITY_STUDIO_DATASET ||
    process.env.NEXT_PUBLIC_SANITY_DATASET ||
    process.env.SANITY_DATASET ||
    undefined
  )
}

function resolveApiVersion(explicit?: string): string {
  return (
    explicit ||
    process.env.NEXT_PUBLIC_SANITY_API_VERSION ||
    process.env.SANITY_STUDIO_API_VERSION ||
    DEFAULT_API_VERSION
  )
}

export async function fetchProductRequirements({
  client,
  productId,
  productSlug,
  projectId,
  dataset,
  apiVersion,
  perspective,
}: FetchProductRequirementsOptions): Promise<ProductRequirements> {
  if (!client) {
    const resolvedProjectId = resolveProjectId(projectId)
    const resolvedDataset = resolveDataset(dataset)

    if (!resolvedProjectId || !resolvedDataset) {
      throw new Error('Missing Sanity project configuration for product requirement lookup')
    }

    client = createClient({
      projectId: resolvedProjectId,
      dataset: resolvedDataset,
      apiVersion: resolveApiVersion(apiVersion),
      useCdn: perspective !== 'previewDrafts',
      perspective,
    })
  }

  if (!productId && !productSlug) {
    throw new Error('A productId or productSlug is required to fetch product requirements')
  }

  const document = await client.fetch(PRODUCT_REQUIREMENTS_QUERY, {
    productId,
    productSlug,
  })

  if (!document) {
    throw new Error('Product not found when fetching requirements')
  }

  const options = (Array.isArray(document.options) ? document.options : [])
    .map(normalizeOption)
    .filter(
      (option: ReturnType<typeof normalizeOption>): option is ProductOptionRequirement =>
        Boolean(option),
    )

  const customizations = (Array.isArray(document.customizations) ? document.customizations : [])
    .map(normalizeCustomization)
    .filter(
      (
        customization: ReturnType<typeof normalizeCustomization>,
      ): customization is ProductCustomizationRequirement => Boolean(customization),
    )

  return {
    id: document._id as string,
    slug: typeof document.slug === 'string' ? document.slug : undefined,
    title: typeof document.title === 'string' ? document.title : undefined,
    productType:
      typeof document.productType === 'string' ? document.productType : undefined,
    options,
    customizations,
  }
}
