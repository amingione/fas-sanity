import type {Handler} from '@netlify/functions'

type Pack = {
  name: string
  version: string
  description: string
  author: string
  category: string
  tags: string[]
  documentation: string
  license: string
  repository: string
  endpoints: string[]
}

const PACKS: Pack[] = [
  {
    name: 'twilio-messaging',
    version: '0.1.0',
    description: 'Twilio messaging pack for SMS updates and two-way threads.',
    author: 'FAS Labs',
    category: 'messaging',
    tags: ['sms', 'notifications', 'twilio'],
    documentation: 'https://docs.example.com/twilio',
    license: 'MIT',
    repository: 'https://github.com/example/twilio-pack',
    endpoints: ['/api/twilio/send', '/api/twilio/webhook'],
  },
]

const handler: Handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return {statusCode: 405, body: 'Method Not Allowed'}
  }

  const url = new URL(event.rawUrl || `http://localhost${event.path || ''}`)
  const search = (url.searchParams.get('q') || '').toLowerCase()
  const category = (url.searchParams.get('category') || '').toLowerCase()
  const tag = (url.searchParams.get('tag') || '').toLowerCase()

  const filtered = PACKS.filter((pack) => {
    const matchesSearch =
      !search ||
      pack.name.toLowerCase().includes(search) ||
      pack.description.toLowerCase().includes(search) ||
      pack.tags.some((t) => t.toLowerCase().includes(search))
    const matchesCategory = !category || pack.category.toLowerCase() === category
    const matchesTag = !tag || pack.tags.some((t) => t.toLowerCase() === tag)
    return matchesSearch && matchesCategory && matchesTag
  })

  return {
    statusCode: 200,
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      packs: filtered,
      meta: {
        total: filtered.length,
        categories: Array.from(new Set(PACKS.map((p) => p.category))),
        tags: Array.from(new Set(PACKS.flatMap((p) => p.tags))),
      },
    }),
  }
}

export {handler}
