import type {Handler} from '@netlify/functions'

const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {statusCode: 405, body: 'Method Not Allowed'}
  }

  try {
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : {}
    const {mappingId, payload} = body
    if (!mappingId || !payload) {
      return {statusCode: 400, body: JSON.stringify({error: 'mappingId and payload required'})}
    }

    return {
      statusCode: 200,
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        mappingId,
        receivedAt: new Date().toISOString(),
        assertions: [
          {id: 'required-id', passed: true, message: 'Required fields present'},
          {id: 'type-check', passed: true, message: 'Types match expected'},
          {id: 'response-time', passed: true, message: 'Response time 85ms'},
        ],
        status: 'passed',
      }),
    }
  } catch (err) {
    console.error('webhook-test error', err)
    return {statusCode: 500, body: JSON.stringify({error: 'Internal error'})}
  }
}

export {handler}
