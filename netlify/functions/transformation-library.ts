import type {Handler} from '@netlify/functions'

type TransformSnippet = {
  id: string
  name: string
  version: string
  description: string
  category: string
  code: string
}

const SNIPPETS: TransformSnippet[] = [
  {
    id: 'str-trim-upper',
    name: 'Trim + Uppercase',
    version: '1.0.0',
    description: 'Trims whitespace and uppercases the string.',
    category: 'string',
    code: `export default function transform(input) {
  if (typeof input !== 'string') return input
  return input.trim().toUpperCase()
}`,
  },
  {
    id: 'num-cents-to-dollars',
    name: 'Cents to Dollars',
    version: '1.0.0',
    description: 'Converts integer cents to floating dollars.',
    category: 'number',
    code: `export default function transform(input) {
  if (typeof input !== 'number') return input
  return input / 100
}`,
  },
  {
    id: 'date-iso',
    name: 'Unix to ISO',
    version: '1.0.0',
    description: 'Converts unix seconds to ISO string.',
    category: 'date',
    code: `export default function transform(input) {
  if (typeof input !== 'number') return input
  return new Date(input * 1000).toISOString()
}`,
  },
]

const handler: Handler = async (event) => {
  if (event.httpMethod === 'GET') {
    const url = new URL(event.rawUrl || `http://localhost${event.rawPath || ''}`)
    const category = (url.searchParams.get('category') || '').toLowerCase()
    const filtered = category ? SNIPPETS.filter((s) => s.category === category) : SNIPPETS
    return {
      statusCode: 200,
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({snippets: filtered}),
    }
  }

  return {statusCode: 405, body: 'Method Not Allowed'}
}

export {handler}
