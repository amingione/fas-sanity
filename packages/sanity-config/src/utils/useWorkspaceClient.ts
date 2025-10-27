import {createClient} from '@sanity/client'
import type {ClientConfig} from '@sanity/client'
import {useContext, useMemo} from 'react'
import {WorkspaceContext} from 'sanity/_singletons'
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
  const workspace = useContext(WorkspaceContext)
  const apiVersion = options?.apiVersion || FALLBACK_API_VERSION

  const fallbackClient = useMemo(() => {
    const {
      dataset,
      perspective,
      projectId,
      stega,
      token,
      useCdn,
      withCredentials,
    } = options || {}

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
  }, [apiVersion, options])

  const studioClient = useMemo(() => {
    if (!workspace) return null
    try {
      return workspace.getClient({
        ...(options || {}),
        apiVersion,
      } as SourceClientOptions & Partial<ClientConfig>)
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('useWorkspaceClient: falling back to manual client', err)
      }
      return null
    }
  }, [workspace, options, apiVersion])

  return studioClient || fallbackClient
}
