import type {SourceField} from '../types'

export type StripeObjectType = 'product' | 'price' | 'customer' | 'subscription'

export const stripeSourceTemplates: Record<StripeObjectType, SourceField[]> = {
  product: [
    {name: 'id', type: 'string', semanticTags: ['identifier'], description: 'Stripe product id'},
    {name: 'name', type: 'string', description: 'Product name'},
    {name: 'description', type: 'text', description: 'Product description'},
    {name: 'active', type: 'boolean', description: 'Is active'},
    {name: 'images', type: 'array', description: 'Image URLs'},
    {name: 'metadata', type: 'object', semanticTags: ['metadata'], description: 'Custom metadata'},
    {name: 'created', type: 'datetime', semanticTags: ['temporal'], description: 'Created timestamp'},
    {name: 'updated', type: 'datetime', semanticTags: ['temporal'], description: 'Last updated'},
  ],
  price: [
    {name: 'id', type: 'string', semanticTags: ['identifier'], description: 'Stripe price id'},
    {name: 'product', type: 'string', semanticTags: ['identifier'], description: 'Parent product id'},
    {name: 'currency', type: 'string', semanticTags: ['monetary']},
    {name: 'unit_amount', type: 'number', semanticTags: ['monetary'], description: 'Amount in cents'},
    {name: 'recurring', type: 'object', description: 'Recurring details'},
    {name: 'nickname', type: 'string', description: 'Nickname'},
    {name: 'active', type: 'boolean', description: 'Is active'},
    {name: 'metadata', type: 'object', semanticTags: ['metadata'], description: 'Custom metadata'},
  ],
  customer: [
    {name: 'id', type: 'string', semanticTags: ['identifier']},
    {name: 'email', type: 'string', semanticTags: ['contact'], description: 'Primary email'},
    {name: 'name', type: 'string'},
    {name: 'phone', type: 'string', semanticTags: ['contact']},
    {name: 'address', type: 'object', semanticTags: ['location']},
    {name: 'shipping', type: 'object', semanticTags: ['location']},
    {name: 'created', type: 'datetime', semanticTags: ['temporal']},
    {name: 'metadata', type: 'object', semanticTags: ['metadata']},
  ],
  subscription: [
    {name: 'id', type: 'string', semanticTags: ['identifier']},
    {name: 'customer', type: 'string', semanticTags: ['identifier']},
    {name: 'status', type: 'string', semanticTags: ['status']},
    {name: 'items', type: 'array', description: 'Subscription items'},
    {name: 'current_period_start', type: 'datetime', semanticTags: ['temporal']},
    {name: 'current_period_end', type: 'datetime', semanticTags: ['temporal']},
    {name: 'cancel_at', type: 'datetime', semanticTags: ['temporal']},
    {name: 'canceled_at', type: 'datetime', semanticTags: ['temporal']},
    {name: 'metadata', type: 'object', semanticTags: ['metadata']},
  ],
}

type Requester = (resource: string, params?: Record<string, unknown>) => Promise<unknown>

export interface StripeConnectorOptions {
  requester?: Requester
  apiBase?: string
  apiKey?: string
}

export class StripeConnector {
  private requester?: Requester
  private apiBase?: string
  private apiKey?: string

  constructor(options: StripeConnectorOptions = {}) {
    this.requester = options.requester
    this.apiBase = options.apiBase
    this.apiKey = options.apiKey
  }

  private async request(resource: string, params?: Record<string, unknown>) {
    if (this.requester) return this.requester(resource, params)

    if (this.apiBase && this.apiKey) {
      const url = new URL(`${this.apiBase.replace(/\/$/, '')}/${resource}`)
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (typeof value !== 'undefined') url.searchParams.set(key, String(value))
        })
      }
      const response = await fetch(url.toString(), {
        headers: {Authorization: `Bearer ${this.apiKey}`},
      })
      if (!response.ok) throw new Error(`Stripe request failed: ${response.status}`)
      return response.json()
    }

    // Fallback for local testing without hitting the API.
    return null
  }

  listProducts(params?: Record<string, unknown>) {
    return this.request('products', params)
  }

  listPrices(params?: Record<string, unknown>) {
    return this.request('prices', params)
  }

  listCustomers(params?: Record<string, unknown>) {
    return this.request('customers', params)
  }

  listSubscriptions(params?: Record<string, unknown>) {
    return this.request('subscriptions', params)
  }
}

export const centsToDollars = (value?: number | null) =>
  typeof value === 'number' ? value / 100 : undefined

export const unixToIso = (value?: number | null) =>
  typeof value === 'number' ? new Date(value * 1000).toISOString() : undefined
