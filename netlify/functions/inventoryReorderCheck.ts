import {schedule} from '@netlify/functions'
import {createClient} from '@sanity/client'
import {Resend} from 'resend'
import {resolveResendApiKey} from '../../shared/resendEnv'
import {generateReferenceCode} from '../../shared/referenceCodes'
import {applyInventoryChanges} from '../../shared/inventory'
import {INVENTORY_DOCUMENT_TYPE} from '../../shared/docTypes'
import {getMissingResendFields} from '../lib/resendValidation'

const resendApiKey = resolveResendApiKey()
const resendClient = resendApiKey ? new Resend(resendApiKey) : null
const alertRecipient =
  process.env.INVENTORY_ALERT_EMAIL ||
  process.env.ORDERS_ALERT_EMAIL ||
  process.env.SHIP_FROM_EMAIL ||
  ''
const alertSender = process.env.RESEND_FROM || 'Inventory Alerts <alerts@fasmotorsports.com>'

function getSanityClient() {
  const projectId = process.env.SANITY_STUDIO_PROJECT_ID || process.env.SANITY_PROJECT_ID
  const dataset = process.env.SANITY_STUDIO_DATASET || process.env.SANITY_DATASET
  const token = process.env.SANITY_API_TOKEN

  if (!projectId || !dataset || !token) {
    console.error('inventoryReorderCheck missing Sanity environment configuration', {
      projectId: Boolean(projectId),
      dataset: Boolean(dataset),
      hasToken: Boolean(token),
    })
    return null
  }

  return createClient({
    projectId,
    dataset,
    apiVersion: '2024-10-01',
    token,
    useCdn: false,
  })
}

type InventoryDoc = {
  _id: string
  product?: {_ref?: string; _id?: string; title?: string; sku?: string}
  quantityAvailable?: number
  quantityOnHand?: number
  quantityReserved?: number
  reorderPoint?: number
  reorderQuantity?: number
  source?: string
  lowStockAlert?: boolean
  supplier?: {companyName?: string} | null
}

const handler = schedule('0 9 * * *', async () => {
  const sanity = getSanityClient()
  if (!sanity) {
    return {
      statusCode: 500,
      body: JSON.stringify({error: 'Sanity not configured for inventory check'}),
    }
  }

  const inventory = await sanity.fetch<InventoryDoc[]>(
    `*[_type == "${INVENTORY_DOCUMENT_TYPE}"]{
      _id,
      quantityAvailable,
      quantityOnHand,
      quantityReserved,
      reorderPoint,
      reorderQuantity,
      source,
      lowStockAlert,
      product->{_id, title, sku},
      supplier->{companyName}
    }`,
  )

  const manufacturingCreated: string[] = []
  const purchasedAlerts: string[] = []

  for (const record of inventory) {
    const productId = record.product?._ref || record.product?._id
    if (!productId) continue
    const onHand = Number(record.quantityOnHand ?? 0)
    const reserved = Number(record.quantityReserved ?? 0)
    const available =
      record.quantityAvailable !== undefined
        ? Number(record.quantityAvailable)
        : onHand - reserved
    const reorderPoint = Number(record.reorderPoint ?? 0)
    const reorderQuantity = Math.max(1, Number(record.reorderQuantity ?? 0))
    const needsAlert = available <= reorderPoint

    if (needsAlert !== Boolean(record.lowStockAlert)) {
      await sanity
        .patch(record._id)
        .set({lowStockAlert: needsAlert})
        .commit({autoGenerateArrayKeys: true})
    }

    if (!needsAlert) continue

    if (record.source === 'manufactured') {
      const pending = await sanity.fetch<number>(
        `count(*[_type == "manufacturingOrder" && product._ref == $productId && status in ["queued","in_production","on_hold"]])`,
        {productId},
      )
      if (pending === 0) {
        const moNumber = await generateReferenceCode(sanity, {
          prefix: 'MO-',
          typeName: 'manufacturingOrder',
          fieldName: 'moNumber',
        })
        await sanity.create(
          {
            _type: 'manufacturingOrder',
            moNumber,
            product: {_type: 'reference', _ref: productId},
            quantityOrdered: reorderQuantity,
            quantityCompleted: 0,
            quantityRemaining: reorderQuantity,
            status: 'queued',
            priority: 'normal',
            reason: 'Auto-replenish',
            createdBy: 'inventory-scheduler',
          },
          {autoGenerateArrayKeys: true},
        )
        await applyInventoryChanges({
          client: sanity,
          inventoryId: record._id,
          productionDelta: reorderQuantity,
        })
        manufacturingCreated.push(
          `${record.product?.title || 'Product'} (${reorderQuantity} units)`,
        )
      }
    } else if (record.source === 'purchased' || record.source === 'dropship') {
      purchasedAlerts.push(
        `${record.product?.title || 'Product'} • Available ${Math.max(
          0,
          available,
        )} / Reorder ${reorderPoint} • Supplier: ${
          record.supplier?.companyName || 'n/a'
        }`,
      )
    }
  }

  if (resendClient && alertRecipient && (manufacturingCreated.length || purchasedAlerts.length)) {
    const sections: string[] = []
    if (manufacturingCreated.length) {
      sections.push(
        `Manufacturing orders created:\n- ${manufacturingCreated.join('\n- ')}`,
      )
    }
    if (purchasedAlerts.length) {
      sections.push(`Purchase alerts:\n- ${purchasedAlerts.join('\n- ')}`)
    }

    const subject = 'Inventory reorder alerts'
    const missing = getMissingResendFields({to: alertRecipient, from: alertSender, subject})
    if (missing.length) {
      console.warn('inventoryReorderCheck: missing Resend fields', {missing})
    } else {
      await resendClient.emails.send({
        from: alertSender,
        to: alertRecipient,
        subject,
        text: sections.join('\n\n'),
      })
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      processed: inventory.length,
      manufacturingOrders: manufacturingCreated.length,
      purchaseAlerts: purchasedAlerts.length,
    }),
  }
})

export {handler}
