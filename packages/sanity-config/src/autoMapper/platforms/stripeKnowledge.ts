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
    // Customer
    'customer.created',
    'customer.updated',
    'customer.deleted',
    'customer.discount.created',
    'customer.discount.updated',
    'customer.discount.deleted',
    'customer.source.created',
    'customer.source.updated',
    'customer.source.deleted',
    // Payment Intent / Payment
    'payment_intent.created',
    'payment_intent.succeeded',
    'payment_intent.canceled',
    'payment_intent.processing',
    'payment_intent.requires_action',
    'payment_intent.payment_failed',
    'payment_intent.amount_capturable_updated',
    'payment_intent.partially_funded',
    // Charges
    'charge.succeeded',
    'charge.failed',
    'charge.captured',
    'charge.updated',
    'charge.pending',
    'charge.refunded',
    'charge.refund.updated',
    'charge.dispute.created',
    'charge.dispute.updated',
    'charge.dispute.closed',
    // Checkout
    'checkout.session.created',
    'checkout.session.completed',
    'checkout.session.expired',
    'checkout.session.async_payment_succeeded',
    'checkout.session.async_payment_failed',
    // Invoices / Subscriptions
    'invoice.created',
    'invoice.updated',
    'invoice.deleted',
    'invoice.finalized',
    'invoice.finalization_failed',
    'invoice.paid',
    'invoice.payment_failed',
    'invoice.payment_action_required',
    'invoice.payment_succeeded',
    'invoice.sent',
    'invoice.upcoming',
    'invoice.marked_uncollectible',
    'invoice.voided',
    // Connect / Accounts / Transfers
    'account.updated',
    'account.external_account.created',
    'account.external_account.updated',
    'account.external_account.deleted',
    'transfer.created',
    'transfer.updated',
    'transfer.paid',
    'transfer.failed',
    'transfer.reversed',
    'account.application.authorized',
    'account.application.deauthorized',
    'account.rejected',
    // Subscription schedule
    'subscription_schedule.created',
    'subscription_schedule.updated',
    'subscription_schedule.released',
    'subscription_schedule.canceled',
    'subscription_schedule.completed',
    'subscription_schedule.expiring',
    'subscription_schedule.aborted',
    // Products / Prices
    'product.created',
    'product.updated',
    'product.deleted',
    'price.created',
    'price.updated',
    'price.deleted',
    // Coupons / Promotions
    'coupon.created',
    'coupon.updated',
    'coupon.deleted',
    'promotion_code.created',
    'promotion_code.updated',
    // Radar / Fraud / Reviews
    'radar.early_fraud_warning.created',
    'radar.early_fraud_warning.updated',
    'review.closed',
    'review.opened',
    // Issuing
    'issuing_authorization.created',
    'issuing_authorization.updated',
    'issuing_authorization.request',
    'issuing_card.created',
    'issuing_card.updated',
    'issuing_cardholder.created',
    'issuing_cardholder.updated',
    'issuing_transaction.created',
    'issuing_transaction.updated',
    // Treasury
    'treasury.credit_reversal.created',
    'treasury.debit_reversal.created',
    'treasury.financial_account.created',
    'treasury.financial_account.features_status_updated',
    'treasury.inbound_transfer.created',
    'treasury.outbound_payment.created',
    'treasury.outbound_transfer.created',
    'treasury.received_credit.created',
    'treasury.received_debit.created',
    // Identity
    'identity.verification_session.created',
    'identity.verification_session.updated',
    // Financial Connections
    'financial_connections.account.created',
    'financial_connections.account.deactivated',
    'financial_connections.account.disconnected',
    'financial_connections.account.reactivated',
    'financial_connections.account.refreshed_balance',
    'financial_connections.account.refreshed_ownership',
    'financial_connections.account.refreshed_transactions',
    'financial_connections.session.created',
    'financial_connections.session.succeeded',
    // Terminal
    'terminal.reader.action_failed',
    'terminal.reader.action_succeeded',
    // Crypto / Onramp
    'crypto.onramp_session.created',
    'crypto.onramp_session.canceled',
    'crypto.onramp_session.expired',
    'crypto.onramp_session.processing',
    'crypto.onramp_session.succeeded',
    'crypto.onramp_session.failed',
    // Webhook endpoints
    'webhook_endpoint.created',
    'webhook_endpoint.updated',
    'webhook_endpoint.deleted',
    // Tax
    'tax.settings.updated',
    'tax.calculation.created',
    'tax.transaction.created',
    'tax.transaction.updated',
    // Balance / Cash balance / Refund
    'balance.available',
    'cash_balance.funds_available',
    'refund.created',
    'refund.updated',
    // Capability
    'capability.updated',
    // Credit notes
    'credit_note.created',
    'credit_note.updated',
    'credit_note.voided',
    // Files
    'file.created',
    // Invoice items
    'invoiceitem.created',
    'invoiceitem.updated',
    'invoiceitem.deleted',
    // Mandates
    'mandate.updated',
    // Orders
    'order.created',
    'order.payment_failed',
    'order.payment_succeeded',
    'order.updated',
    // Payment links / methods / payouts / persons
    'payment_link.created',
    'payment_link.updated',
    'payment_method.attached',
    'payment_method.automatically_updated',
    'payment_method.detached',
    'payment_method.updated',
    'payout.canceled',
    'payout.created',
    'payout.failed',
    'payout.paid',
    'payout.updated',
    'person.created',
    'person.deleted',
    'person.updated',
    // Reporting
    'reporting.report_run.failed',
    'reporting.report_run.succeeded',
    'reporting.report_type.updated',
    // Setup intents
    'setup_intent.canceled',
    'setup_intent.created',
    'setup_intent.requires_action',
    'setup_intent.setup_failed',
    'setup_intent.succeeded',
    // Sigma
    'sigma.scheduled_query_run.created',
    // Sources
    'source.canceled',
    'source.chargeable',
    'source.failed',
    'source.mandate_notification',
    'source.refund_attributes_required',
    'source.transaction.created',
    'source.transaction.updated',
    // Topups
    'topup.canceled',
    'topup.created',
    'topup.failed',
    'topup.reversed',
    'topup.succeeded',
    // Climate
    'climate.order.canceled',
    'climate.order.created',
    'climate.order.delayed',
    'climate.order.delivered',
    'climate.order.product_substituted',
    'climate.product.created',
    'climate.product.pricing_updated',
    // Quotes
    'quote.accepted',
    'quote.canceled',
    'quote.created',
    'quote.finalized',
    // Payment transactions
    'payment_transaction.created',
    'payment_transaction.updated',
    // Test helpers
    'test_helpers.test_clock.advancing',
    'test_helpers.test_clock.created',
    'test_helpers.test_clock.deleted',
    'test_helpers.test_clock.internal_failure',
    'test_helpers.test_clock.ready',
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
