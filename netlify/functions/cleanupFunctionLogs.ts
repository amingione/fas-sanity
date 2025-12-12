import {schedule} from '@netlify/functions'
import {createClient} from '@sanity/client'
import {logFunctionExecution} from '../../utils/functionLogger'

const PROJECT_ID = process.env.SANITY_STUDIO_PROJECT_ID || process.env.SANITY_PROJECT_ID
const DATASET = process.env.SANITY_STUDIO_DATASET || process.env.SANITY_DATASET
const API_VERSION = process.env.SANITY_API_VERSION || '2024-10-01'
const TOKEN =
  process.env.SANITY_API_TOKEN ||
  process.env.SANITY_WRITE_TOKEN ||
  process.env.SANITY_ACCESS_TOKEN ||
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

const handler = schedule('0 5 * * *', async () => {
  const startTime = Date.now()
  const now = Date.now()
  const infoCutoff = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString()
  const errorCutoff = new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString()

  if (!sanity) {
    await logFunctionExecution({
      functionName: 'cleanupFunctionLogs',
      status: 'error',
      duration: Date.now() - startTime,
      eventData: {schedule: 'daily'},
      result: {reason: 'sanity client missing'},
    })
    return
  }

  try {
    const staleInfo = await sanity.fetch<number>(
      'count(*[_type == "functionLog" && status != "error" && executionTime < $cutoff])',
      {cutoff: infoCutoff},
    )
    const staleErrors = await sanity.fetch<number>(
      'count(*[_type == "functionLog" && status == "error" && executionTime < $cutoff])',
      {cutoff: errorCutoff},
    )

    if (staleInfo > 0) {
      await sanity.delete({
        query: '*[_type == "functionLog" && status != "error" && executionTime < $cutoff]',
        params: {cutoff: infoCutoff},
      })
    }

    if (staleErrors > 0) {
      await sanity.delete({
        query: '*[_type == "functionLog" && status == "error" && executionTime < $cutoff]',
        params: {cutoff: errorCutoff},
      })
    }

    await logFunctionExecution({
      functionName: 'cleanupFunctionLogs',
      status: 'success',
      duration: Date.now() - startTime,
      eventData: {schedule: 'daily'},
      result: {deleted: {errors: staleErrors, nonError: staleInfo}},
    })
  } catch (error) {
    await logFunctionExecution({
      functionName: 'cleanupFunctionLogs',
      status: 'error',
      duration: Date.now() - startTime,
      eventData: {schedule: 'daily'},
      error,
    })
    throw error
  }
})

export {handler}
export default handler
