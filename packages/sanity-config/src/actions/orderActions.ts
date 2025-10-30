import type {DocumentActionComponent} from 'sanity'

const normalizeId = (id: string): string => id.replace(/^drafts\./, '')

const getContextClient = (props: Record<string, unknown>) => {
  const context = (props as any).context
  if (context?.getClient) {
    return context.getClient({apiVersion: '2024-10-01'})
  }
  return context?.client || null
}

const getApiBase = (): string => {
  if (typeof process !== 'undefined') {
    const envBase = (process as any)?.env?.SANITY_STUDIO_NETLIFY_BASE as string | undefined
    if (envBase) return envBase.replace(/\/$/, '')
  }
  if (typeof window !== 'undefined') {
    const origin = window.location?.origin
    if (origin) return origin.replace(/\/$/, '')
  }
  return ''
}

type ShipmentSummary = {
  _id: string
  labelStatus?: string | null
  labelUrl?: string | null
  packingSlipUrl?: string | null
  trackingNumber?: string | null
}

const shipmentCache = new Map<string, Promise<ShipmentSummary | null>>()

const fetchLatestShipment = async (
  props: Parameters<DocumentActionComponent>[0],
): Promise<ShipmentSummary | null> => {
  const id = normalizeId(props.id)
  if (!shipmentCache.has(id)) {
    const client = getContextClient(props as any)
    if (!client) return null
    const promise = client
      .fetch<ShipmentSummary | null>(
        '*[_type == "shipment" && references($orderId)] | order(purchasedAt desc, _updatedAt desc)[0]{_id, labelStatus, labelUrl, packingSlipUrl, trackingNumber}',
        {orderId: id},
      )
      .catch(() => null)
    shipmentCache.set(id, promise)
  }
  return shipmentCache.get(id) || null
}

const hasPurchasedLabel = (doc: Record<string, any> | null | undefined): boolean => {
  const tags: unknown = doc?.systemTags
  if (!Array.isArray(tags)) return false
  return tags.some((tag) => tag === 'Shipping label purchased')
}

const createOpenHandler = (url?: string | null) => () => {
  if (!url) {
    if (typeof window !== 'undefined') window.alert('Label unavailable.')
    return
  }
  try {
    if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener')
  } catch (err) {
    console.error('Unable to open url', err)
  }
}

const reprintShippingLabelAction: DocumentActionComponent = (props) => {
  const doc = (props.published || props.draft) as Record<string, any> | null
  if (!doc || !hasPurchasedLabel(doc)) return null
  return {
    label: 'Reprint shipping label',
    onHandle: async () => {
      const shipment = await fetchLatestShipment(props)
      createOpenHandler(shipment?.labelUrl)()
      props.onComplete()
    },
  }
}

const printDocumentsAction: DocumentActionComponent = (props) => {
  const doc = (props.published || props.draft) as Record<string, any> | null
  if (!doc || !hasPurchasedLabel(doc)) return null
  return {
    label: 'Print documents',
    onHandle: async () => {
      const shipment = await fetchLatestShipment(props)
      createOpenHandler(shipment?.packingSlipUrl || shipment?.labelUrl)()
      props.onComplete()
    },
  }
}

const voidShippingLabelAction: DocumentActionComponent = (props) => {
  const doc = (props.published || props.draft) as Record<string, any> | null
  if (!doc || !hasPurchasedLabel(doc)) return null
  return {
    label: 'Void shipping label',
    tone: 'critical',
    onHandle: async () => {
      try {
        const shipment = await fetchLatestShipment(props)
        if (!shipment?._id) {
          if (typeof window !== 'undefined') window.alert('No shipment found to void.')
          return props.onComplete()
        }
        const confirm =
          typeof window === 'undefined' ? true : window.confirm('Void this shipping label? This cannot be undone.')
        if (!confirm) return props.onComplete()
        const base = getApiBase()
        const response = await fetch(`${base}/api/shipments/${encodeURIComponent(shipment._id)}/void`, {
          method: 'POST',
        })
        if (!response.ok) {
          const message = await response.text()
          if (typeof window !== 'undefined') window.alert(`Void failed: ${message || response.statusText}`)
        } else if (typeof window !== 'undefined') {
          window.alert('Shipment void requested.')
        }
        shipmentCache.delete(normalizeId(props.id))
      } catch (err: any) {
        console.error('Void label failed', err)
        if (typeof window !== 'undefined') window.alert(`Void failed: ${err?.message || err}`)
      } finally {
        props.onComplete()
      }
    },
  }
}

const purchaseLabelAction: DocumentActionComponent = (props) => {
  const doc = (props.published || props.draft) as Record<string, any> | null
  if (doc && hasPurchasedLabel(doc)) return null
  return {
    label: 'Purchase label',
    tone: 'primary',
    onHandle: async () => {
      try {
        const base = getApiBase()
        const orderId = normalizeId(props.id)
        const response = await fetch(`${base}/api/orders/${encodeURIComponent(orderId)}/labels/purchase`, {
          method: 'POST',
        })
        if (!response.ok) {
          const message = await response.text()
          if (typeof window !== 'undefined') window.alert(`Purchase failed: ${message || response.statusText}`)
        } else if (typeof window !== 'undefined') {
          window.alert('Label purchase requested. Refresh to see updates.')
        }
        shipmentCache.delete(orderId)
      } catch (err: any) {
        console.error('Purchase label failed', err)
        if (typeof window !== 'undefined') window.alert(`Purchase failed: ${err?.message || err}`)
      } finally {
        props.onComplete()
      }
    },
  }
}

const archiveAction: DocumentActionComponent = (props) => {
  const doc = (props.published || props.draft) as Record<string, any> | null
  if (!doc) return null
  const client = getContextClient(props as any)
  if (!client) return null
  const id = props.id
  const publishedId = normalizeId(id)
  const isArchived = Boolean(doc.archivedAt)
  const label = isArchived ? 'Unarchive' : 'Archive'

  return {
    label,
    onHandle: async () => {
      try {
        if (isArchived) {
          await Promise.all([
            client.patch(id).unset(['archivedAt']).commit({autoGenerateArrayKeys: true}).catch(() => null),
            client.patch(publishedId).unset(['archivedAt']).commit({autoGenerateArrayKeys: true}).catch(() => null),
          ])
        } else {
          const timestamp = new Date().toISOString()
          await Promise.all([
            client.patch(id).set({archivedAt: timestamp}).commit({autoGenerateArrayKeys: true}).catch(() => null),
            client.patch(publishedId).set({archivedAt: timestamp}).commit({autoGenerateArrayKeys: true}).catch(() => null),
          ])
        }
      } catch (err) {
        console.error('Archive toggle failed', err)
        if (typeof window !== 'undefined') window.alert(`Unable to update archive status: ${(err as any)?.message || err}`)
      } finally {
        props.onComplete()
      }
    },
  }
}

const refundAction: DocumentActionComponent = (props) => {
  return {
    label: 'Refund',
    tone: 'critical',
    onHandle: async () => {
      try {
        const orderId = normalizeId(props.id)
        const base = getApiBase()
        const response = await fetch(`${base}/api/orders/${encodeURIComponent(orderId)}/refunds`, {
          method: 'POST',
        })
        if (!response.ok) {
          const message = await response.text()
          if (typeof window !== 'undefined') window.alert(`Refund request failed: ${message || response.statusText}`)
        } else if (typeof window !== 'undefined') {
          window.alert('Refund requested.')
        }
      } catch (err: any) {
        console.error('Refund action failed', err)
        if (typeof window !== 'undefined') window.alert(`Refund request failed: ${err?.message || err}`)
      } finally {
        props.onComplete()
      }
    },
  }
}

const createReturnLabelAction: DocumentActionComponent = (props) => {
  return {
    label: 'Create return label',
    onHandle: async () => {
      try {
        const base = getApiBase()
        const orderId = normalizeId(props.id)
        const response = await fetch(`${base}/api/orders/${encodeURIComponent(orderId)}/labels/return`, {
          method: 'POST',
        })
        if (!response.ok) {
          const message = await response.text()
          if (typeof window !== 'undefined') window.alert(`Return label failed: ${message || response.statusText}`)
        } else if (typeof window !== 'undefined') {
          window.alert('Return label requested.')
        }
      } catch (err: any) {
        console.error('Create return label failed', err)
        if (typeof window !== 'undefined') window.alert(`Return label failed: ${err?.message || err}`)
      } finally {
        props.onComplete()
      }
    },
  }
}

const addNoteAction: DocumentActionComponent = (props) => {
  const client = getContextClient(props as any)
  if (!client) return null
  return {
    label: 'Add note',
    onHandle: async () => {
      try {
        if (typeof window === 'undefined') return props.onComplete()
        const message = window.prompt('Add an internal note to this order:')
        if (!message || !message.trim()) return props.onComplete()
        const trimmed = message.trim()
        const orderId = props.id
        const publishedId = normalizeId(orderId)
        const author = (props as any)?.context?.currentUser?.name || 'System'
        const note = {
          _type: 'orderNote',
          message: trimmed,
          createdAt: new Date().toISOString(),
          author,
        }
        await Promise.all([
          client
            .patch(orderId)
            .setIfMissing({notes: []})
            .append('notes', [note])
            .commit({autoGenerateArrayKeys: true})
            .catch(() => null),
          client
            .patch(publishedId)
            .setIfMissing({notes: []})
            .append('notes', [note])
            .commit({autoGenerateArrayKeys: true})
            .catch(() => null),
        ])
      } catch (err: any) {
        console.error('Add note failed', err)
        if (typeof window !== 'undefined') window.alert(`Unable to add note: ${err?.message || err}`)
      } finally {
        props.onComplete()
      }
    },
  }
}

export const orderDocumentActions: DocumentActionComponent[] = [
  reprintShippingLabelAction,
  printDocumentsAction,
  voidShippingLabelAction,
  purchaseLabelAction,
  archiveAction,
  refundAction,
  createReturnLabelAction,
  addNoteAction,
]
