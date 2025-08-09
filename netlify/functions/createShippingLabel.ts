import { Handler } from '@netlify/functions'
import { createClient } from '@sanity/client'
import axios from 'axios'

const SHIPENGINE_API_KEY = process.env.SHIPENGINE_API_KEY!

const sanity = createClient({
  projectId: process.env.SANITY_STUDIO_PROJECT_ID!,
  dataset: process.env.SANITY_STUDIO_DATASET!,
  apiVersion: '2024-04-10',
  token: process.env.PUBLIC_SANITY_WRITE_TOKEN,
  useCdn: false
})

export const handler: Handler = async (event) => {
  const { customerId, labelDescription, invoiceId, weight, dimensions, carrier, customerEmail, serviceCode } = JSON.parse(event.body || '{}')

  if (!serviceCode) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing serviceCode' })
    }
  }

  if (!weight) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing weight' })
    }
  }

  if (!dimensions || !dimensions.length || !dimensions.width || !dimensions.height) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing or incomplete dimensions' })
    }
  }

  try {
    const customer = await sanity.fetch(
      `*[_type == "customer" && _id == $id][0]{
        firstName, lastName, phone, email,
        billingAddress, address
      }`,
      { id: customerId }
    )

    const toAddress = {
      name: `${customer.firstName} ${customer.lastName}`,
      phone: customer.phone,
      address_line1: customer.billingAddress.street,
      city_locality: customer.billingAddress.city,
      state_province: customer.billingAddress.state,
      postal_code: customer.billingAddress.postalCode,
      country_code: customer.billingAddress.country,
      email: customerEmail || customer.email
    }

    const fromAddress = {
      name: "FAS Motorsports",
      phone: "555-555-5555",
      address_line1: "123 Performance Ln",
      city_locality: "Dayton",
      state_province: "OH",
      postal_code: "45402",
      country_code: "US"
    }

    const shipment = {
      ship_to: toAddress,
      ship_from: fromAddress,
      packages: [
        {
          weight: {
            value: weight,
            unit: "pound"
          },
          dimensions: {
            length: dimensions.length,
            width: dimensions.width,
            height: dimensions.height,
            unit: "inch"
          }
        }
      ]
    }

    // Dynamically fetch rates from ShipEngine
    const ratesResponse = await axios.post(
      'https://api.shipengine.com/v1/rates/estimate',
      {
        rate_options: {
          carrier_ids: [carrier]
        },
        shipment: {
          ship_to: toAddress,
          ship_from: fromAddress,
          packages: shipment.packages
        }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'API-Key': SHIPENGINE_API_KEY
        }
      }
    )

    const rates = ratesResponse.data.rate_response.rates

    if (!rates || rates.length === 0) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'No shipping rates found for this shipment.' })
      }
    }

    const selectedRate = rates[0]

    // Create shipping label with selected rate details
    const labelResponse = await axios.post(
      'https://api.shipengine.com/v1/labels',
      {
        shipment: {
          service_code: selectedRate.service_code,
          carrier_id: selectedRate.carrier_id,
          ship_to: toAddress,
          ship_from: fromAddress,
          packages: shipment.packages
        },
        label_format: "pdf",
        label_download_type: "url",
        external_order_id: invoiceId,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'API-Key': SHIPENGINE_API_KEY
        }
      }
    )

    const labelData = labelResponse.data

    await sanity.patch(invoiceId).set({ status: 'Shipped' }).commit()

    return {
      statusCode: 200,
      body: JSON.stringify({
        trackingNumber: labelData.tracking_number,
        labelUrl: labelData.label_download.href,
        invoiceUpdated: true,
        price: labelData.price,
        estimatedDeliveryDate: labelData.estimated_delivery_date,
        selectedRate
      })
    }
  } catch (err: any) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    }
  }
}
