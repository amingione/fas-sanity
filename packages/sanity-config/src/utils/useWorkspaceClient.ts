import {createClient} from '@sanity/client'
import type {ClientConfig} from '@sanity/client'
import {useMemo} from 'react'
import {useClient} from 'sanity'
import type {SourceClientOptions} from 'sanity'

type UseClientOptions = (SourceClientOptions & Partial<ClientConfig>) | undefined

const DEFAULT_PROJECT_ID =
  process.env.SANITY_STUDIO_PROJECT_ID || 'r4og35qd'
const DEFAULT_DATASET =
  process.env.SANITY_STUDIO_DATASET || 'production'
const FALLBACK_API_VERSION = '2024-10-01'

export function useWorkspaceClient(options?: UseClientOptions) {
  const {apiVersion = FALLBACK_API_VERSION, ...restOptions} = options || {}
  const normalizedOptions = restOptions ?? {}
  const {
    dataset,
    perspective,
    projectId,
    stega,
    token,
    useCdn,
    withCredentials,
  } = normalizedOptions as Partial<ClientConfig> & SourceClientOptions

  let baseClient: ReturnType<typeof useClient> | null = null

  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- The hook is always invoked, we simply catch context errors.
    baseClient = useClient({apiVersion})
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('useWorkspaceClient: workspace context unavailable, using fallback client', err)
    }
  }

  const fallbackClient = useMemo(() => {
    return createClient({
      projectId: projectId || DEFAULT_PROJECT_ID,
      dataset: dataset || DEFAULT_DATASET,
      apiVersion,
      useCdn: useCdn ?? false,
      withCredentials: withCredentials ?? false,
      perspective: perspective || 'published',
      token,
      stega,
      ignoreBrowserTokenWarning: true,
    })
  }, [apiVersion, dataset, perspective, projectId, stega, token, useCdn, withCredentials])

  const studioClient = useMemo(() => {
    const config: Partial<ClientConfig> = {}

    if (projectId) config.projectId = projectId
    if (dataset) config.dataset = dataset
    if (perspective) config.perspective = perspective
    if (typeof useCdn === 'boolean') config.useCdn = useCdn
    if (typeof withCredentials === 'boolean') config.withCredentials = withCredentials
    if (token) config.token = token
    if (stega) config.stega = stega

    if (!baseClient) return null

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
  }, [baseClient, dataset, perspective, projectId, stega, token, useCdn, withCredentials])

  return studioClient || fallbackClient
}
