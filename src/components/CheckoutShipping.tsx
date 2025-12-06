import {useEffect, useState} from 'react'

export type CheckoutCartItem = {
  _id?: string
  productId?: string
  sku?: string
  title?: string
  image?: string
  price?: number
  stripePriceId?: string
  quantity: number
}

export type CheckoutShippingAddress = {
  name?: string
  phone?: string
  email?: string
  street?: string
  addressLine1?: string
  addressLine2?: string
  city?: string
  state?: string
  postalCode?: string
  country?: string
}

export type ShippingRate = {
  rateId: string
  carrier: string
  service: string
  amount: number
  deliveryDays: number | null
  accurateDeliveryDate?: string | null
  deliveryConfidence?: number | null
  carrierId?: string
  carrierCode?: string
  serviceCode?: string
  currency?: string
  estimatedDeliveryDate?: string | null
  timeInTransit?: Record<string, any> | null
  deliveryDateGuaranteed?: boolean
}

export type CheckoutShippingProps = {
  cart: CheckoutCartItem[]
  shippingAddress?: CheckoutShippingAddress | null
  onRateSelected: (rate: ShippingRate | null) => void
  onRatesLoaded?: (rates: ShippingRate[]) => void
  className?: string
}

function normalizeDestination(address?: CheckoutShippingAddress | null) {
  if (!address) return null
  const street = address.street || address.addressLine1
  const postalCode = address.postalCode
  if (!street || !postalCode) return null

  return {
    address_line1: street,
    address_line2: address.addressLine2,
    city_locality: address.city,
    state_province: address.state,
    postal_code: postalCode,
    country_code: address.country || 'US',
    name: address.name,
    phone: address.phone,
    email: address.email,
  }
}

function normalizeCart(cart: CheckoutCartItem[]) {
  return cart.map((item) => ({
    sku: item.sku,
    productId: item.productId || item._id,
    quantity: item.quantity ?? 1,
    title: item.title,
  }))
}

export function CheckoutShipping({
  cart,
  shippingAddress,
  onRateSelected,
  onRatesLoaded,
  className,
}: CheckoutShippingProps) {
  const [rates, setRates] = useState<ShippingRate[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedRate, setSelectedRate] = useState<ShippingRate | null>(null)

  useEffect(() => {
    if (!cart.length) {
      setRates([])
      setSelectedRate(null)
      return
    }

    const destination = normalizeDestination(shippingAddress)
    if (!destination) {
      setRates([])
      setSelectedRate(null)
      return
    }

    const controller = new AbortController()
    const fetchRates = async () => {
      setLoading(true)
      setError('')

      try {
        const response = await fetch('/.netlify/functions/getShippingQuoteBySkus', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            cart: normalizeCart(cart),
            destination,
          }),
          signal: controller.signal,
        })

        if (!response.ok) {
          throw new Error('Failed to fetch shipping rates')
        }

        const data = await response.json()

        if (data.installOnly) {
          setError('This order requires installation - no shipping available')
          setRates([])
          setSelectedRate(null)
          onRateSelected(null)
          return
        }

        if (data.freight) {
          setError('Freight shipping required - please contact us for a quote')
          setRates([])
          setSelectedRate(null)
          onRateSelected(null)
          return
        }

        const fetchedRates: ShippingRate[] = Array.isArray(data?.rates) ? data.rates : []
        const bestRateFromApi: ShippingRate | null =
          data?.bestRate && typeof data.bestRate === 'object' ? data.bestRate : null
        setRates(fetchedRates)
        onRatesLoaded?.(fetchedRates)

        if (fetchedRates.length > 0) {
          const preselected =
            fetchedRates.find((r) => r.rateId && r.rateId === bestRateFromApi?.rateId) ||
            fetchedRates[0]
          setSelectedRate(preselected)
          onRateSelected(preselected)
        }
      } catch (err) {
        console.error('Shipping rate error:', err)
        setError('Unable to calculate shipping. Please try again.')
        setRates([])
        setSelectedRate(null)
        onRateSelected(null)
      } finally {
        setLoading(false)
      }
    }

    fetchRates()
    return () => controller.abort()
  }, [cart, shippingAddress, onRateSelected, onRatesLoaded])

  return (
    <div className={className}>
      <h3>Shipping Method</h3>

      {loading && <p>Calculating shipping rates...</p>}
      {error && <p style={{color: 'red'}}>{error}</p>}

      {rates.length > 0 && (
        <div>
          {rates.map((rate) => {
            const key = rate.rateId || `${rate.carrier}-${rate.service}-${rate.amount}`
            const label = `${rate.carrier} ${rate.service}`.trim() || 'Shipping'
            const accurateDate = rate.accurateDeliveryDate || rate.estimatedDeliveryDate
            const confidence =
              typeof rate.deliveryConfidence === 'number'
                ? Math.round(rate.deliveryConfidence)
                : null

            return (
              <label key={key}>
                <input
                  type="radio"
                  name="shipping"
                  checked={selectedRate?.rateId === rate.rateId}
                  onChange={() => {
                    setSelectedRate(rate)
                    onRateSelected(rate)
                  }}
                />
                {label} - ${rate.amount.toFixed(2)}
                {accurateDate && (
                  <div className="delivery-estimate">
                    Delivers by {new Date(accurateDate).toLocaleDateString()}
                    {confidence !== null && <span> ({confidence}% confidence)</span>}
                  </div>
                )}
                {!accurateDate && rate.deliveryDays && (
                  <div className="delivery-estimate">{rate.deliveryDays} business days</div>
                )}
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}

export type StartCheckoutOptions = {
  cart: CheckoutCartItem[]
  shippingRate: ShippingRate
  customerEmail?: string
}

export async function startCheckoutSession(options: StartCheckoutOptions) {
  const {cart, shippingRate, customerEmail} = options
  const response = await fetch('/.netlify/functions/createCheckoutSession', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({cart, shippingRate, customerEmail}),
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = payload?.error || 'Failed to start checkout'
    throw new Error(message)
  }

  return payload as {sessionId?: string; url?: string}
}

export default CheckoutShipping
