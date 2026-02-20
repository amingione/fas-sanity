import type {Handler} from '@netlify/functions'

type ClaudeMessage = {
  role: 'user' | 'assistant'
  content: unknown
}

type ClaudeTool = {
  name: string
  description?: string
  input_schema?: Record<string, unknown>
}

type ClaudeRequest = {
  model?: string
  max_tokens?: number
  messages: ClaudeMessage[]
  system?: string | Array<{type: 'text'; text: string}>
  tools?: ClaudeTool[]
  tool_choice?: unknown
  temperature?: number
  top_p?: number
  stop_sequences?: string[]
  metadata?: Record<string, unknown>
}

const readBearer = (value?: string) => (value || '').replace(/^Bearer\s+/i, '').trim()

const requireSecret = (event: Parameters<Handler>[0]) => {
  const expected = (process.env.CLAUDE_API_SECRET || '').trim()
  if (!expected) return {ok: true as const}
  const presented = readBearer(event.headers?.authorization || event.headers?.Authorization)
  if (!presented || presented !== expected) return {ok: false as const, statusCode: 401, body: 'Unauthorized'}
  return {ok: true as const}
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') return {statusCode: 405, body: 'Method Not Allowed'}

  const auth = requireSecret(event)
  if (!auth.ok) return {statusCode: auth.statusCode, body: auth.body}

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return {statusCode: 500, body: 'ANTHROPIC_API_KEY is not configured'}

  let body: ClaudeRequest
  try {
    body = ((event.body ? JSON.parse(event.body) : {}) || {}) as ClaudeRequest
  } catch {
    return {statusCode: 400, body: 'Invalid JSON body'}
  }

  if (!body?.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    return {statusCode: 400, body: 'messages must be a non-empty array'}
  }

  const payload = {
    model: body.model || process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-latest',
    max_tokens: body.max_tokens ?? 1024,
    messages: body.messages,
    system: body.system,
    tools: body.tools,
    tool_choice: body.tool_choice,
    temperature: body.temperature,
    top_p: body.top_p,
    stop_sequences: body.stop_sequences,
    metadata: body.metadata,
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': apiKey,
      },
      body: JSON.stringify(payload),
    })

    const text = await response.text()
    return {
      statusCode: response.status,
      headers: {'Content-Type': 'application/json'},
      body: text,
    }
  } catch (error) {
    console.error('claude-chat error', error)
    return {statusCode: 500, body: 'Failed to reach Claude API'}
  }
}
