import type {Handler} from '@netlify/functions'
import {runOnboardingCron} from '../lib/vendorOnboardingCampaign'

const JSON_HEADERS = {'Content-Type': 'application/json'}

const handler: Handler = async () => {
  try {
    const result = await runOnboardingCron()
    return {
      statusCode: 200,
      headers: JSON_HEADERS,
      body: JSON.stringify({success: true, ...result}),
    }
  } catch (error) {
    console.error('[vendor-onboarding-cron] failed', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return {
      statusCode: 500,
      headers: JSON_HEADERS,
      body: JSON.stringify({error: message}),
    }
  }
}

export {handler}
