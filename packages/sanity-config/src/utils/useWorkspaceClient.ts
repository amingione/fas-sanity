import {createClient} from '@sanity/client'
import {useContext, useMemo} from 'react'
import {WorkspaceContext} from 'sanity/_singletons'

type UseClientOptions = Parameters<typeof createClient>[0]

const DEFAULT_PROJECT_ID =
  process.env.SANITY_STUDIO_PROJECT_ID ||
  process.env.SANITY_PROJECT_ID ||
  'r4og35qd'
const DEFAULT_DATASET =
  process.env.SANITY_STUDIO_DATASET || process.env.SANITY_DATASET || 'production'
const FALLBACK_API_VERSION = '2024-10-01'

export function useWorkspaceClient(options?: UseClientOptions) {
  const workspace = useContext(WorkspaceContext)

  const projectId = options?.projectId || DEFAULT_PROJECT_ID
  const dataset = options?.dataset || DEFAULT_DATASET
  const apiVersion = options?.apiVersion || FALLBACK_API_VERSION
  const useCdn = options?.useCdn ?? false
  const perspective = options?.perspective || 'published'
  const requestTagPrefix = options?.requestTagPrefix
  const stega = (options as any)?.stega
  const token = options?.token

  const workspaceOptions = useMemo(
    () => (options ? {...options} : undefined),
    [options],
  )

  const workspaceClient = useMemo(() => {
    if (!workspace) return null
    try {
      return workspace.getClient(workspaceOptions || {})
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('useWorkspaceClient: falling back to manual client', err)
      }
      return null
    }
  }, [workspace, workspaceOptions])

  const fallbackClientConfig = useMemo(
    () => ({
      projectId,
      dataset,
      apiVersion,
      useCdn,
      withCredentials: true,
      perspective,
      ignoreBrowserTokenWarning: true,
      requestTagPrefix,
      stega,
      token,
    }),
    [apiVersion, dataset, perspective, projectId, requestTagPrefix, stega, token, useCdn],
  )

  const fallbackClient = useMemo(
    () => createClient(fallbackClientConfig),
    [fallbackClientConfig],
  )

  return workspaceClient || fallbackClient
}
