export type DrainProvider = 'datadog' | 'logflare' | 'custom'

export type DrainTestResult = 'success' | 'failed'

export interface LogDrainConfig {
  projectId: string
  dataset: string
  token: string
  apiVersion?: string
}

export interface LogDrain {
  id: string
  name: string
  provider: DrainProvider
  url: string
  headers?: Record<string, string>
  enabled: boolean
  lastTestedAt?: string
  lastTestResult?: DrainTestResult
}

export type LogDrainCreateInput = Omit<LogDrain, 'id' | 'lastTestedAt' | 'lastTestResult'>

export interface LogDrainUpdateInput extends Partial<Omit<LogDrain, 'id' | 'lastTestedAt' | 'lastTestResult'>> {
  enabled?: boolean
}

export interface LogEvent {
  timestamp: string
  level: 'info' | 'warn' | 'error' | 'debug' | 'test'
  message: string
  metadata?: Record<string, any>
  source?: string
}

export interface DrainResponse {
  success: boolean
  drainId: string
  message?: string
}
