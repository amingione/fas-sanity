import {createClient} from '@sanity/client'

const PROJECT_ID = process.env.SANITY_STUDIO_PROJECT_ID
const DATASET = process.env.SANITY_STUDIO_DATASET
const API_VERSION = process.env.SANITY_STUDIO_API_VERSION || '2024-10-01'
const TOKEN =
  process.env.SANITY_API_TOKEN ||
  ''

const sanity =
  PROJECT_ID && DATASET && TOKEN
    ? createClient({
        projectId: PROJECT_ID,
        dataset: DATASET,
        apiVersion: API_VERSION,
        token: TOKEN,
        useCdn: false,
      })
    : null

type LogStatus = 'success' | 'error' | 'warning' | string

const safeStringify = (value: unknown) => {
  if (value === undefined) return undefined
  try {
    return JSON.stringify(
      value,
      (_, v) => {
        if (v instanceof Error) {
          return {
            name: v.name,
            message: v.message,
            stack: v.stack,
          }
        }
        return v
      },
      2,
    )
  } catch {
    return typeof value === 'string' ? value : String(value)
  }
}

export type FunctionLogParams = {
  functionName: string
  status: LogStatus
  executionTime?: string
  duration?: number
  eventData?: unknown
  result?: unknown
  error?: unknown
  metadata?: Record<string, unknown>
}

export const logFunctionExecution = async ({
  functionName,
  status,
  executionTime,
  duration,
  eventData,
  result,
  error,
  metadata,
}: FunctionLogParams) => {
  if (!sanity) {
    console.warn('[functionLogger] Sanity client not configured; skipping log for', functionName)
    return
  }

  try {
    const errorMessage =
      error && typeof error === 'object' && 'message' in error && typeof (error as any).message === 'string'
        ? (error as any).message
        : typeof error === 'string'
          ? error
          : undefined
    const errorStack =
      error && typeof error === 'object' && 'stack' in error && typeof (error as any).stack === 'string'
        ? (error as any).stack
        : undefined

    await sanity.create(
      {
        _type: 'functionLog',
        functionName,
        status,
        executionTime: executionTime || new Date().toISOString(),
        duration: typeof duration === 'number' && Number.isFinite(duration) ? duration : undefined,
        eventData: safeStringify(eventData),
        result: safeStringify(result),
        errorMessage,
        errorStack,
        metadata: metadata || {},
      },
      {autoGenerateArrayKeys: true},
    )
  } catch (err) {
    console.error('[functionLogger] failed to write function log', {functionName, status}, err)
  }
}
