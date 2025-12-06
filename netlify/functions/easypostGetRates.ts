import type {Handler} from '@netlify/functions'
import EasyPost from '@easypost/api'
import {getEasyPostFromAddress} from '../lib/ship-from'

const client = new EasyPost(process.env.EASYPOST_API_KEY || '')

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({error: 'Method not allowed'}),
    }
  }

  try {
    const {address, parcel} = JSON.parse(event.body || '{}')
    const defaultFrom = getEasyPostFromAddress()

    if (
      !address ||
      !address.street1 ||
      !address.city ||
      !address.state ||
      !address.postalCode ||
      !address.country
    ) {
      return {
        statusCode: 400,
        body: JSON.stringify({error: 'Incomplete destination address'}),
      }
    }

    const shipment = await client.Shipment.create({
      to_address: {
        street1: address.street1,
        street2: address.street2 || undefined,
        city: address.city,
        state: address.state,
        zip: address.postalCode,
        country: address.country,
      },
      from_address: {
        street1: process.env.SENDER_STREET1 || defaultFrom.street1,
        street2: process.env.SENDER_STREET2 || defaultFrom.street2,
        city: process.env.SENDER_CITY || defaultFrom.city,
        state: process.env.SENDER_STATE || defaultFrom.state,
        zip: process.env.SENDER_ZIP || defaultFrom.zip,
        country: process.env.SENDER_COUNTRY || defaultFrom.country || 'US',
      },
      parcel: {
        weight: Math.max(1, Number(parcel.weight) || 0),
        length: parcel.length,
        width: parcel.width,
        height: parcel.height,
      },
    })

    return {
      statusCode: 200,
      body: JSON.stringify({
        rates: shipment.rates,
      }),
    }
  } catch (error: any) {
    console.error('EasyPost error:', error)
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error.message || 'Failed to fetch rates',
      }),
    }
  }
}
