import {createClient} from '@sanity/client'
import {useContext, useMemo} from 'react'
import {useClient} from 'sanity'
import {WorkspaceContext} from 'sanity/_singletons'

type UseClientOptions = Parameters<typeof useClient>[0]

const DEFAULT_PROJECT_ID = process.env.SANITY_STUDIO_PROJECT_ID || 'r4og35qd'
const DEFAULT_DATASET = process.env.SANITY_STUDIO_DATASET || 'production'
const FALLBACK_API_VERSION = '2024-10-01'

export function useWorkspaceClient(options?: UseClientOptions) {
  const workspace = useContext(WorkspaceContext)

  if (workspace) {
    return useClient(options)
  }

  const apiVersion = options?.apiVersion

  return useMemo(
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
}
