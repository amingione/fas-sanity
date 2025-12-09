export type StripeEndpoint = {
  path: string
  method: 'GET' | 'POST'
  title: string
  summary: string
  params?: string[]
  returns?: string[]
}

export type StripeField = {
  name: string
  type: string
  description: string
  tags?: string[]
}

export type StripeKnowledge = {
  endpoints: StripeEndpoint[]
  events: string[]
  fields: StripeField[]
}

export const stripeKnowledge: StripeKnowledge = {
  endpoints: [
    {
      path: '/v1/events',
      method: 'GET',
      title: 'List events',
      summary:
        'List events created in your account. Supports filtering by created date, delivery success, types, pagination.',
      params: [
        'created.gt/gte/lt/lte',
        'delivery_success',
        'ending_before',
        'limit (1-100)',
        'starting_after',
        'type',
        'types[] (up to 20)',
      ],
      returns: ['list<event>'],
    },
  ],
  events: [
    'charge.succeeded',
    'charge.failed',
    'payment_intent.succeeded',
    'payment_intent.payment_failed',
    'customer.created',
    'customer.updated',
    'invoice.created',
    'invoice.paid',
    'invoice.payment_failed',
    'checkout.session.completed',
    'setup_intent.created',
  ],
  fields: [
    {name: 'id', type: 'string', description: 'Resource identifier', tags: ['identifier']},
    {name: 'type', type: 'string', description: 'Event type', tags: ['status']},
    {name: 'created', type: 'number', description: 'Unix timestamp', tags: ['temporal']},
    {name: 'livemode', type: 'boolean', description: 'Live vs test mode', tags: ['boolean']},
    {name: 'data.object', type: 'object', description: 'Event payload object', tags: ['metadata']},
    {
      name: 'request.id',
      type: 'string',
      description: 'Request ID that triggered the event',
      tags: ['identifier'],
    },
    {
      name: 'pending_webhooks',
      type: 'number',
      description: 'Outstanding webhooks for the event',
      tags: ['quantity'],
    },
  ],
}
