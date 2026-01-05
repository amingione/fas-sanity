import type {Handler} from '@netlify/functions'

export const handler: Handler = async () => {
  return {
    statusCode: 410,
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({error: 'Manual payment capture is disabled'}),
  }
}
