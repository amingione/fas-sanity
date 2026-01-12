import {readFileSync} from 'node:fs'
import path from 'node:path'
import {describe, expect, it} from 'vitest'

describe('createCheckoutSession forbidden-path guards', () => {
  it('never references Stripe Shipping Rate objects (source guard)', () => {
    const sourcePath = path.resolve(process.cwd(), 'netlify/functions/createCheckoutSession.ts')
    const source = readFileSync(sourcePath, 'utf8')

    expect(source).not.toMatch(/STRIPE_SHIPPING_RATE_IDS/)
    expect(source).not.toMatch(/shippingRates\s*\.\s*create\s*\(/)

    expect(source).toMatch(/shipping_rate_data\s*:/)
    expect(source).not.toMatch(/shipping_rate\s*:/)
  })

  it('never creates invoices during checkout (source guard)', () => {
    const sourcePath = path.resolve(process.cwd(), 'netlify/functions/createCheckoutSession.ts')
    const source = readFileSync(sourcePath, 'utf8')

    expect(source).not.toMatch(/invoices\s*\.\s*create\s*\(/)
    expect(source).not.toMatch(/invoice_creation\s*:/)
  })

  it('never invokes EasyPost during checkout (source guard)', () => {
    const sourcePath = path.resolve(process.cwd(), 'netlify/functions/createCheckoutSession.ts')
    const source = readFileSync(sourcePath, 'utf8')

    expect(source).not.toMatch(/@easypost\/api/)
    expect(source).not.toMatch(/getEasyPostClient/)
    expect(source).not.toMatch(/easypost(GetRates|Webhook|Webhook|Client)/)
    expect(source).not.toMatch(/Shipment\s*\./)
  })
})
