import {createClient, type SanityClient} from '@sanity/client'
import type {
  DrainProvider,
  DrainResponse,
  LogDrain,
  LogDrainConfig,
  LogDrainCreateInput,
  LogDrainUpdateInput,
  LogEvent,
  DrainTestResult,
} from './types'

const DEFAULT_API_VERSION = '2024-04-10'

type SanityLogDrain = {
  _id: string
  name: string
  provider: DrainProvider
  url: string
  headers?: Array<{key: string; value: string}>
  enabled: boolean
  lastTestedAt?: string
  lastTestResult?: DrainTestResult
}

const ensureFetch = () => {
  const fetchImpl = globalThis.fetch?.bind(globalThis)
  if (!fetchImpl) {
    throw new Error('Fetch API is not available in this environment')
  }
  return fetchImpl
}

const toHeadersArray = (headers?: Record<string, string>) =>
  headers
    ? Object.entries(headers).map(([key, value]) => ({key, value}))
    : undefined

const fromHeadersArray = (headers?: Array<{key: string; value: string}>) => {
  if (!headers?.length) {
    return undefined
  }
  return headers.reduce<Record<string, string>>((acc, entry) => {
    if (entry.key) {
      acc[entry.key] = entry.value
    }
    return acc
  }, {})
}

const mapToLogDrain = (doc: SanityLogDrain): LogDrain => ({
  id: doc._id,
  name: doc.name,
  provider: doc.provider,
  url: doc.url,
  enabled: doc.enabled,
  headers: fromHeadersArray(doc.headers),
  lastTestedAt: doc.lastTestedAt,
  lastTestResult: doc.lastTestResult,
})

export class LogDrainSDK {
  private client: SanityClient

  constructor(private config: LogDrainConfig) {
    if (!config.projectId || !config.dataset || !config.token) {
      throw new Error('LogDrainSDK requires projectId, dataset, and token')
    }

    this.client = createClient({
      projectId: config.projectId,
      dataset: config.dataset,
      token: config.token,
      apiVersion: config.apiVersion ?? DEFAULT_API_VERSION,
      useCdn: false,
      ignoreBrowserTokenWarning: true,
    })
  }

  async listDrains(): Promise<LogDrain[]> {
    const query = `*[_type == "logDrain"]{_id, name, provider, url, headers, enabled, lastTestedAt, lastTestResult}`
    const drains = await this.client.fetch<SanityLogDrain[]>(query)
    return (drains ?? []).map(mapToLogDrain)
  }

  async createDrain(drain: LogDrainCreateInput): Promise<LogDrain> {
    const payload = {
      _type: 'logDrain',
      name: drain.name,
      provider: drain.provider,
      url: drain.url,
      enabled: drain.enabled,
      headers: toHeadersArray(drain.headers),
    }

    const created = await this.client.create<SanityLogDrain>(payload)
    return mapToLogDrain(created)
  }

  async updateDrain(id: string, updates: LogDrainUpdateInput): Promise<LogDrain> {
    const existing = await this.client.getDocument<SanityLogDrain>(id)
    if (!existing) {
      throw new Error(`Log drain not found: ${id}`)
    }

    const patchPayload: Record<string, unknown> = {}

    if (updates.name) {
      patchPayload.name = updates.name
    }
    if (updates.provider) {
      patchPayload.provider = updates.provider
    }
    if (updates.url) {
      patchPayload.url = updates.url
    }
    if (typeof updates.enabled === 'boolean') {
      patchPayload.enabled = updates.enabled
    }
    if (updates.headers) {
      patchPayload.headers = toHeadersArray(updates.headers)
    }

    if (Object.keys(patchPayload).length === 0) {
      return mapToLogDrain(existing)
    }

    const updated = await this.client.patch(id).set(patchPayload).commit()
    return mapToLogDrain(updated)
  }

  async deleteDrain(id: string): Promise<void> {
    await this.client.delete(id)
  }

  async testDrain(id: string, event?: LogEvent): Promise<boolean> {
    const drain = await this.client.fetch<SanityLogDrain>(
      `*[_type == "logDrain" && _id == $id][0]{_id, url, headers}`,
      {id},
    )

    if (!drain) {
      throw new Error(`Log drain not found: ${id}`)
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(fromHeadersArray(drain.headers) ?? {}),
    }

    const fetchImpl = ensureFetch()

    const payload = event ?? {
      timestamp: new Date().toISOString(),
      level: 'test',
      message: 'Log drain connectivity test',
      metadata: {drainId: id},
    }

    let success = false
    try {
      const result = await fetchImpl(drain.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        keepalive: true,
      })
      success = result.ok
      await this.patchTestResult(id, success ? 'success' : 'failed')
      return success
    } catch (error) {
      await this.patchTestResult(id, 'failed')
      throw error
    }
  }

  private async patchTestResult(id: string, status: DrainTestResult): Promise<void> {
    await this.client.patch(id).set({lastTestedAt: new Date().toISOString(), lastTestResult: status}).commit()
  }
}

export type {LogDrain, LogDrainConfig, LogDrainCreateInput, LogDrainUpdateInput, LogEvent, DrainResponse, DrainProvider}
