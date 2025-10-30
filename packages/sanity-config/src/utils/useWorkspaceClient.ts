import {createClient} from '@sanity/client'
import type {ClientConfig, SanityClient} from '@sanity/client'
import {useContext, useMemo} from 'react'
import {SourceContext} from 'sanity/_singletons'
import type {SourceClientOptions} from 'sanity'

type UseClientOptions = (SourceClientOptions & Partial<ClientConfig>) | undefined

const DEFAULT_PROJECT_ID =
  process.env.SANITY_STUDIO_PROJECT_ID ||
  process.env.SANITY_PROJECT_ID ||
  'r4og35qd'
const DEFAULT_DATASET =
  process.env.SANITY_STUDIO_DATASET || process.env.SANITY_DATASET || 'production'
const FALLBACK_API_VERSION = '2024-10-01'

export function useWorkspaceClient(options?: UseClientOptions) {
  const {apiVersion = FALLBACK_API_VERSION, ...restOptions} = options || {}
  const {dataset, perspective, projectId, stega, token, useCdn, withCredentials} = restOptions

  const source = useContext(SourceContext)

  const {baseClient, baseClientError} = useMemo<{
    baseClient: SanityClient | null
    baseClientError: unknown
  }>(() => {
    if (!source) {
      return {baseClient: null, baseClientError: null}
    }

    try {
      return {
        baseClient: source.getClient({apiVersion}),
        baseClientError: null,
      }
    } catch (err) {
      return {baseClient: null, baseClientError: err}
    }
  }, [apiVersion, source])

  const fallbackClient = useMemo(() => {
    return createClient({
      projectId: projectId || DEFAULT_PROJECT_ID,
      dataset: dataset || DEFAULT_DATASET,
      apiVersion,
      useCdn: useCdn ?? false,
      withCredentials: withCredentials ?? true,
      perspective: perspective || 'published',
      token,
      stega,
      ignoreBrowserTokenWarning: true,
    })
  }, [apiVersion, dataset, perspective, projectId, stega, token, useCdn, withCredentials])

  const studioClient = useMemo(() => {
    if (!baseClient) {
      if (baseClientError && process.env.NODE_ENV !== 'production') {
        console.warn(
          'useWorkspaceClient: missing Sanity context, falling back to manual client',
          baseClientError,
        )
      }

      return null
    }

    const config: Partial<ClientConfig> = {}

    if (projectId) config.projectId = projectId
    if (dataset) config.dataset = dataset
    if (perspective) config.perspective = perspective
    if (typeof useCdn === 'boolean') config.useCdn = useCdn
    if (typeof withCredentials === 'boolean') config.withCredentials = withCredentials
    if (token) config.token = token
    if (stega) config.stega = stega

    try {
      if (Object.keys(config).length > 0) {
        return baseClient.withConfig(config)
      }
      return baseClient
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('useWorkspaceClient: falling back to manual client', err)
      }
      return null
    }
  }, [
    baseClient,
    baseClientError,
    dataset,
    perspective,
    projectId,
    stega,
    token,
    useCdn,
    withCredentials,
  ])

  return studioClient || fallbackClient
}
