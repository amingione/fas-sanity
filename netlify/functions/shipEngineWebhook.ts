import { Handler } from '@netlify/functions'

const handler: Handler = async () => {
  try {
    const shippingServices = [
      { title: 'UPS Ground', value: 'ups_ground' },
      { title: 'FedEx 2Day', value: 'fedex_2day' },
      { title: 'USPS Priority', value: 'usps_priority' },
      { title: 'DHL Express', value: 'dhl_express' }
    ]

    return {
      statusCode: 200,
      body: JSON.stringify({ services: shippingServices })
    }
  } catch (error: any) {
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Failed to load shipping services', error: error.message })
    }
  }
}

export { handler }
