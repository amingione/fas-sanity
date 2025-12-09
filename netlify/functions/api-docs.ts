import type {Handler} from '@netlify/functions'

const handler: Handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return {statusCode: 405, body: 'Method Not Allowed'}
  }

  return {
    statusCode: 200,
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      version: 'v1',
      baseUrl: 'https://api.example.com',
      endpoints: [
        {method: 'POST', path: '/mappings', description: 'Create a mapping'},
        {method: 'GET', path: '/mappings/{id}', description: 'Get mapping by id'},
        {method: 'POST', path: '/webhooks/test', description: 'Send test webhook'},
        {method: 'GET', path: '/integrations', description: 'List integrations'},
      ],
      sdk: {
        javascript: 'npm install @sanity/auto-mapper',
        python: 'pip install sanity-auto-mapper',
      },
      cli: {
        install: 'npm install -g @sanity/auto-mapper-cli',
        examples: ['auto-mapper mappings create --file mapping.json'],
      },
    }),
  }
}

export {handler}
