import type { NextApiRequest, NextApiResponse } from 'next'
import axios from 'axios'
import { createClient } from 'next-sanity'

// Initialize Sanity client
const sanityClient = createClient({
  projectId: 'r4og35qd',
  dataset: 'production',
  token: process.env.SANITY_API_TOKEN,
  apiVersion: '2023-01-01',
  useCdn: false
})

// Log shipping label to Sanity
async function logLabelToSanity(orderId: string, labelUrl: string) {
  return sanityClient.create({
    _type: 'shippingLabel',
    order: { _type: 'reference', _ref: orderId },
    url: labelUrl,
    createdAt: new Date().toISOString()
  })
}

// Create shipping label using ShipEngine API
async function generateLabel(orderId: string, weight: number) {
  const shipengineKey = process.env.SHIPENGINE_API_KEY
  if (!shipengineKey) throw new Error('Missing ShipEngine API Key')

  const shipmentData = {
    shipment: {
      service_code: 'usps_priority_mail',
      ship_to: {
        name: 'John Doe',
        address_line1: '123 Main St',
        city_locality: 'Austin',
        state_province: 'TX',
        postal_code: '78701',
        country_code: 'US'
      },
      ship_from: {
        name: 'FAS Motorsports',
        address_line1: '6161 Riverside Dr.',
        city_locality: 'Punta Gorda',
        state_province: 'FL',
        postal_code: '33982',
        country_code: 'US'
      },
      packages: [
        {
          weight: {
            value: weight || 1.2, // fallback if not provided
            unit: 'pound'
          }
        }
      ]
    }
  }

  const response = await axios.post('https://api.shipengine.com/v1/labels', shipmentData, {
    headers: {
      'Content-Type': 'application/json',
      'API-Key': shipengineKey
    }
  })

  const labelUrl = response.data.label_download.href
  await logLabelToSanity(orderId, labelUrl)

  return {
    success: true,
    labelUrl,
    labelId: response.data.label_id
  }
}

// API route handler
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' })
  }

  const { orderId, weight } = req.body

  try {
    const result = await generateLabel(orderId, weight)
    return res.status(200).json(result)
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal Server Error'
    })
  }
}