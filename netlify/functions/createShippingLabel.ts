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
  const { customerId, labelDescription } = JSON.parse(event.body || '{}')

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

    let serviceCode = 'usps_priority_mail' // default fallback

    switch (labelDescription?.toLowerCase()) {
      case 'overnight':
      case 'next day':
        serviceCode = 'fedex_overnight'
        break
      case '2nd day':
      case 'second day':
        serviceCode = 'ups_2nd_day_air'
        break
      case 'standard':
      case 'priority':
      default:
        serviceCode = 'usps_priority_mail'
        break
    }

    const response = await axios.post(
      'https://api.shipengine.com/v1/labels',
      {
        shipment: {
          service_code: serviceCode,
          ship_to: toAddress,
          ship_from: fromAddress,
          packages: [
            {
              weight: {
                value: 2,
                unit: "pound"
              }
            }
          ]
        },
        label_format: "pdf",
        label_download_type: "url"
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'API-Key': SHIPENGINE_API_KEY
        }
      }
    )

    const labelData = response.data

    return {
      statusCode: 200,
      body: JSON.stringify({
        trackingNumber: labelData.tracking_number,
        labelUrl: labelData.label_download.href
      })
    }
  } catch (err: any) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    }
  }
}
