import type {Handler} from '@netlify/functions'
import {getResendEnvStatus} from '../../shared/resendEnv'

export const handler: Handler = async () => {
  const status = getResendEnvStatus()
  return {
    statusCode: 200,
    headers: {'content-type': 'application/json'},
    body: JSON.stringify(status),
  }
}
