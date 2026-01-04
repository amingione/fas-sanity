import {createClient, type SanityClient} from '@sanity/client'
import type {CatalogProduct} from './productQueries'
import {
  PHYSICAL_PRODUCTS_QUERY,
  SERVICE_PRODUCTS_QUERY,
  BUNDLE_PRODUCTS_QUERY,
} from './productQueries'

type BaseFetchOptions = {
  client?: SanityClient
  projectId?: string
  dataset?: string
  apiVersion?: string
  perspective?: 'published' | 'previewDrafts'
}

const DEFAULT_API_VERSION = '2024-04-10'

const resolveProjectId = (explicit?: string): string | undefined =>
  explicit || process.env.SANITY_STUDIO_PROJECT_ID

const resolveDataset = (explicit?: string): string | undefined =>
  explicit || process.env.SANITY_STUDIO_DATASET

const resolveApiVersion = (explicit?: string): string =>
  explicit ||
  process.env.SANITY_STUDIO_API_VERSION ||
  DEFAULT_API_VERSION

async function ensureClient(options: BaseFetchOptions): Promise<SanityClient> {
  if (options.client) return options.client
  const projectId = resolveProjectId(options.projectId)
  const dataset = resolveDataset(options.dataset)
  if (!projectId || !dataset) {
    throw new Error('Missing Sanity configuration for catalog queries')
  }
  return createClient({
    projectId,
    dataset,
    apiVersion: resolveApiVersion(options.apiVersion),
    useCdn: options.perspective !== 'previewDrafts',
    perspective: options.perspective,
  })
}

export type FetchCatalogOptions = BaseFetchOptions

export async function fetchPhysicalProducts(
  options: FetchCatalogOptions = {},
): Promise<CatalogProduct[]> {
  const client = await ensureClient(options)
  return client.fetch<CatalogProduct[]>(PHYSICAL_PRODUCTS_QUERY)
}

export async function fetchServiceProducts(
  options: FetchCatalogOptions = {},
): Promise<CatalogProduct[]> {
  const client = await ensureClient(options)
  return client.fetch<CatalogProduct[]>(SERVICE_PRODUCTS_QUERY)
}

export async function fetchBundleProducts(
  options: FetchCatalogOptions = {},
): Promise<CatalogProduct[]> {
  const client = await ensureClient(options)
  return client.fetch<CatalogProduct[]>(BUNDLE_PRODUCTS_QUERY)
}
