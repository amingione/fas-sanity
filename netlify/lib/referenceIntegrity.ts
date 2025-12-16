import type {SanityClient} from '@sanity/client'

export type ReferenceValue = {_type: 'reference'; _ref: string}

function normalizeId(value?: string | null): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.startsWith('drafts.') ? trimmed.slice(7) : trimmed
}

function asReference(id?: string | null): ReferenceValue | undefined {
  const normalized = normalizeId(id)
  return normalized ? {_type: 'reference', _ref: normalized} : undefined
}

async function safePatch(
  client: SanityClient,
  documentId: string | null,
  setter: (patch: ReturnType<SanityClient['patch']>) => ReturnType<SanityClient['patch']>,
) {
  const normalizedId = normalizeId(documentId)
  if (!normalizedId) return
  try {
    await setter(client.patch(normalizedId)).commit({autoGenerateArrayKeys: true})
  } catch (error) {
    console.warn('referenceIntegrity: failed to patch document', {documentId: normalizedId, error})
  }
}

export async function linkOrderToInvoice(
  client: SanityClient,
  orderId?: string | null,
  invoiceId?: string | null,
) {
  const normalizedOrderId = normalizeId(orderId)
  const normalizedInvoiceId = normalizeId(invoiceId)
  if (!normalizedOrderId || !normalizedInvoiceId) return

  try {
    await client
      .transaction()
      .patch(normalizedOrderId, (patch) =>
        patch.set({invoiceRef: asReference(normalizedInvoiceId)}),
      )
      .patch(normalizedInvoiceId, (patch) =>
        patch.set({orderRef: asReference(normalizedOrderId)}),
      )
      .commit({autoGenerateArrayKeys: true})
  } catch (error) {
    console.warn('referenceIntegrity: failed to link order & invoice', {
      orderId: normalizedOrderId,
      invoiceId: normalizedInvoiceId,
      error,
    })
  }
}

export async function linkOrderToCustomer(
  client: SanityClient,
  orderId?: string | null,
  customerId?: string | null,
) {
  await safePatch(client, orderId || null, (patch) =>
    patch.setIfMissing({customerRef: asReference(customerId)}).set({
      customerRef: asReference(customerId),
    }),
  )
}

export async function linkInvoiceToCustomer(
  client: SanityClient,
  invoiceId?: string | null,
  customerId?: string | null,
) {
  await safePatch(client, invoiceId || null, (patch) =>
    patch.set({customerRef: asReference(customerId)}),
  )
}

export async function linkCheckoutSessionToCustomer(
  client: SanityClient,
  checkoutSessionDocId?: string | null,
  customerId?: string | null,
) {
  await safePatch(client, checkoutSessionDocId || null, (patch) =>
    patch.set({customerRef: asReference(customerId)}),
  )
}

export async function linkShipmentToOrder(
  client: SanityClient,
  shipmentId?: string | null,
  orderId?: string | null,
) {
  await safePatch(client, shipmentId || null, (patch) =>
    patch.set({order: asReference(orderId)}),
  )
}
