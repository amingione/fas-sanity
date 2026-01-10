import {LogDrainSDK} from '../index'
import type {LogDrainConfig} from '../types'
import type {SanityClient} from '@sanity/client'
import {describe, expect, it, vi, beforeEach, afterEach} from 'vitest'

const mockFetch = vi.fn()
const mockCreate = vi.fn()
const mockDelete = vi.fn()
const mockGetDocument = vi.fn()
let mockPatchSet: ReturnType<typeof vi.fn>
const mockPatch = vi.fn()

const mockClient: SanityClient = {
  fetch: mockFetch,
  create: mockCreate,
  delete: mockDelete,
  getDocument: mockGetDocument,
  patch: () => mockPatch(),
} as unknown as SanityClient

const mockCreateClientMock = vi.fn()

vi.mock('@sanity/client', () => ({
  createClient: (config: LogDrainConfig) => {
    mockCreateClientMock(config)
    return mockClient
  },
}))

describe('LogDrainSDK', () => {
  const baseConfig: LogDrainConfig = {
    projectId: 'proj',
    dataset: 'prod',
    token: 'token',
  }
  const sampleDoc = {
    _id: 'drain-1',
    name: 'Datadog',
    provider: 'datadog' as const,
    url: 'https://example.com',
    headers: [{key: 'Authorization', value: 'Bearer secret'}],
    enabled: true,
  }

  let sdk: LogDrainSDK
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateClientMock.mockClear()
    mockPatch.mockClear()
    mockPatchSet = vi.fn().mockReturnValue({commit: () => Promise.resolve(sampleDoc)})
    mockPatch.mockReturnValue({set: mockPatchSet})
    mockFetch.mockReset()
    mockCreate.mockResolvedValue(sampleDoc)
    mockGetDocument.mockResolvedValue(sampleDoc)
    mockDelete.mockResolvedValue(undefined)
    sdk = new LogDrainSDK(baseConfig)
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('initializes Sanity client with provided config', () => {
    expect(mockCreateClientMock).toHaveBeenCalledWith(
      expect.objectContaining({projectId: 'proj', dataset: 'prod', token: 'token'}),
    )
  })

  it('lists drains', async () => {
    mockFetch.mockResolvedValue([sampleDoc])
    const drains = await sdk.listDrains()
    expect(drains).toHaveLength(1)
    expect(drains[0]).toMatchObject({id: 'drain-1', name: 'Datadog', provider: 'datadog'})
  })

  it('creates a new drain', async () => {
    const created = await sdk.createDrain({
      name: 'Logflare',
      provider: 'logflare',
      url: 'https://logflare.app/example',
      enabled: true,
      headers: {Authorization: 'Bearer x'},
    })
    expect(mockCreate).toHaveBeenCalled()
    expect(created.name).toBe('Datadog')
  })

  it('updates a drain when fields change', async () => {
    const updated = await sdk.updateDrain('drain-1', {name: 'Updated', enabled: false})
    expect(updated).toMatchObject({name: 'Datadog'})
    expect(mockPatch).toHaveBeenCalled()
    expect(mockPatchSet).toHaveBeenCalled()
  })

  it('deletes a drain by id', async () => {
    await sdk.deleteDrain('drain-1')
    expect(mockDelete).toHaveBeenCalledWith('drain-1')
  })

  it('tests a drain and updates test status', async () => {
    mockFetch.mockResolvedValue(sampleDoc)
    globalThis.fetch = vi.fn(() => Promise.resolve({ok: true})) as typeof globalThis.fetch

    const success = await sdk.testDrain('drain-1')
    expect(success).toBe(true)
    expect(globalThis.fetch).toHaveBeenCalled()
    expect(mockPatch).toHaveBeenCalled()
  })
})
