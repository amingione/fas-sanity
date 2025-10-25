import {createClient} from '@sanity/client'
import {useContext, useMemo} from 'react'
import {useClient} from 'sanity'
import {WorkspaceContext} from 'sanity/_singletons'

type UseClientOptions = Parameters<typeof useClient>[0]

const DEFAULT_PROJECT_ID =
  process.env.SANITY_STUDIO_PROJECT_ID ||
  process.env.SANITY_PROJECT_ID ||
  'r4og35qd'
const DEFAULT_DATASET =
  process.env.SANITY_STUDIO_DATASET || process.env.SANITY_DATASET || 'production'
const FALLBACK_API_VERSION = '2024-10-01'

function useOptionalStudioClient(options?: UseClientOptions) {
  try {
    return options ? useClient(options) : useClient()
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('useWorkspaceClient: falling back to manual client', err)
    }
    return null
  }
}

export function useWorkspaceClient(options?: UseClientOptions) {
  const workspace = useContext(WorkspaceContext)
  const apiVersion = options?.apiVersion
  const studioClient = useOptionalStudioClient(options)

  const fallbackClient = useMemo(
    () =>
      createClient({
        projectId: DEFAULT_PROJECT_ID,
        dataset: DEFAULT_DATASET,
        apiVersion: apiVersion || FALLBACK_API_VERSION,
        useCdn: false,
        withCredentials: true,
        perspective: 'published',
        ignoreBrowserTokenWarning: true,
      }),
    [apiVersion],
  )

  if (workspace && studioClient) {
    return studioClient
  }

  return fallbackClient
}
