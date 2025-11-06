export interface SanityClient {
  fetch<T = unknown>(query: string, params?: Record<string, unknown>): Promise<T>
}

export interface SanityClientConfig {
  projectId: string
  dataset: string
  apiVersion?: string
  token?: string
  useCdn?: boolean
}

export function createClient(config: SanityClientConfig): SanityClient
