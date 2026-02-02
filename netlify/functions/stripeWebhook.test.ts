import {describe, expect, it} from 'vitest'
import {updateCheckoutSessionOnComplete} from './stripeWebhook'

describe('stripeWebhook', () => {
  it('does not throw when cartId is missing', async () => {
    await expect(updateCheckoutSessionOnComplete({} as any, null)).resolves.toBeUndefined()
  })
})
