import type {Handler} from '@netlify/functions'
import {z} from 'zod'
import {easypost, getWarehouseAddress} from './_easypost'
import {sanityClient} from '../lib/sanityClient'
import {getEasyPostAddressMissingFields, getEasyPostParcelMissingFields} from '../lib/easypostValidation'

const requestSchema = z.object({
  orderId: z.string().min(1),
  serviceLevel: z.enum(['cheapest', 'fastest', 'ground', 'priority']).optional(),
  source: z.string().min(1)
})

const json = (statusCode: number, body: any) => ({
  statusCode,
  headers: {'content-type': 'application/json; charset=utf-8'},
  body: JSON.stringify(body),
})

export const handler: Handler = async (event) => {
  try {
    const body = JSON.parse(event.body || '{}')
    const validation = requestSchema.safeParse(body)
    if (!validation.success) {
      return json(400, {error: 'Invalid request', details: validation.error.format()})
    }

    const {orderId, serviceLevel = 'cheapest', source} = validation.data
    if (source !== 'sanity-manual') {
      throw new Error('LABEL_PURCHASE_REQUIRES_MANUAL_SANITY_ACTION')
    }

    const attempts =
      (await sanityClient.fetch<number | null>(
        '*[_id == $id][0].fulfillmentAttempts',
        {id: orderId},
      )) || 0

    await sanityClient
      .patch(orderId)
      .set({
        fulfillmentStatus: 'creating_label',
        fulfillmentAttempts: attempts + 1,
      })
      .commit()

    try {
      const order = await sanityClient.fetch<{
        weight?: {value?: number}
        dimensions?: {length?: number; width?: number; height?: number}
        shippingAddress?: {
          name?: string
          phone?: string
          email?: string
          addressLine1?: string
          addressLine2?: string
          city?: string
          state?: string
          postalCode?: string
          country?: string
        }
        cart?: any[]
        customerEmail?: string
        orderNumber?: string
      }>(
        `*[_id == $id][0]{
          weight,
          dimensions,
          shippingAddress,
          cart,
          customerEmail,
          orderNumber
        }`,
        {id: orderId},
      )

      if (!order) {
        throw new Error('Order not found')
      }

      if (!order.shippingAddress?.addressLine1) {
        throw new Error('Missing shipping address')
      }

      if (!order.weight?.value || !order.dimensions?.length) {
        throw new Error('Missing package weight or dimensions')
      }

      const shipmentPayload = {
        to_address: {
          name: order.shippingAddress.name || 'Customer',
          street1: order.shippingAddress.addressLine1,
          street2: order.shippingAddress.addressLine2 || '',
          city: order.shippingAddress.city || '',
          state: order.shippingAddress.state || '',
          zip: order.shippingAddress.postalCode || '',
          country: order.shippingAddress.country || 'US',
          phone: order.shippingAddress.phone || '',
          email: order.customerEmail || '',
        },
        from_address: getWarehouseAddress(),
        parcel: {
          weight: order.weight.value,
          length: order.dimensions.length,
          width: order.dimensions.width,
          height: order.dimensions.height,
        },
        reference: order.orderNumber || orderId,
      }
      const missingTo = getEasyPostAddressMissingFields(shipmentPayload.to_address)
      if (missingTo.length) {
        throw new Error(`Missing to_address fields: ${missingTo.join(', ')}`)
      }
      const missingFrom = getEasyPostAddressMissingFields(shipmentPayload.from_address)
      if (missingFrom.length) {
        throw new Error(`Missing from_address fields: ${missingFrom.join(', ')}`)
      }
      const missingParcel = getEasyPostParcelMissingFields(shipmentPayload.parcel)
      if (missingParcel.length) {
        throw new Error(`Missing parcel fields: ${missingParcel.join(', ')}`)
      }
      const shipment = await easypost.Shipment.create(shipmentPayload)

      const rates = Array.isArray(shipment?.rates) ? shipment.rates : []
      let selectedRate: any = null

      if (serviceLevel === 'cheapest') {
        try {
          selectedRate = shipment.lowestRate()
        } catch {
          selectedRate = rates[0] || null
        }
      } else if (serviceLevel === 'fastest') {
        selectedRate = rates.reduce((fastest, rate) => {
          const fastestDays = fastest?.delivery_days ?? 999
          const rateDays = rate?.delivery_days ?? 999
          return rateDays < fastestDays ? rate : fastest
        }, null as any)
      } else {
        const serviceLowerCase = serviceLevel.toLowerCase()
        selectedRate =
          rates.find((rate) => rate?.service?.toLowerCase().includes(serviceLowerCase)) ||
          rates[0] ||
          null
      }

      if (!selectedRate) {
        throw new Error('No shipping rates available for this address')
      }

      let purchasedShipment: any
      try {
        purchasedShipment = await (shipment as any).buy(selectedRate)
      } catch (err) {
        if (selectedRate?.id && typeof (shipment as any).buy === 'function') {
          purchasedShipment = await (shipment as any).buy({rate: selectedRate.id})
        } else {
          throw err
        }
      }

      await sanityClient
        .patch(orderId)
        .set({
          trackingNumber: purchasedShipment.tracking_code || '',
          trackingUrl: purchasedShipment.tracker?.public_url || '',
          carrier: selectedRate.carrier || '',
          service: selectedRate.service || '',
          shippingLabelUrl: purchasedShipment.postage_label?.label_url || '',
          easyPostShipmentId: purchasedShipment.id || '',
          fulfillmentStatus: 'label_created',
          fulfillmentError: null,
          labelCreatedAt: new Date().toISOString(),
        })
        .commit()

      await sanityClient.create({
        _type: 'shippingLabel',
        name: order.orderNumber || `Order ${orderId}`,
        orderRef: { _type: 'reference', _ref: orderId },
        trackingNumber: purchasedShipment.tracking_code || '',
        labelUrl: purchasedShipment.postage_label?.label_url || '',
        carrier: selectedRate.carrier || '',
        service: selectedRate.service || '',
        shipmentId: purchasedShipment.id || '',
        rate: selectedRate.rate ? Number.parseFloat(selectedRate.rate) : 0,
        createdAt: new Date().toISOString(),
      })

      return json(200, {
        success: true,
        trackingNumber: purchasedShipment.tracking_code,
        trackingUrl: purchasedShipment.tracker?.public_url,
        labelUrl: purchasedShipment.postage_label?.label_url,
      })
    } catch (shipmentError: any) {
      await sanityClient
        .patch(orderId)
        .set({
          fulfillmentStatus: 'label_creation_failed',
          fulfillmentError: shipmentError.message,
        })
        .commit()

      throw shipmentError
    }
  } catch (error: any) {
    console.error('[create-shipping-label] error', error)
    return json(500, {error: error.message || 'Failed to create shipping label'})
  }
}
