import type {SanityClient} from '@sanity/client'
import {INVENTORY_DOCUMENT_TYPE} from './docTypes'
import {generateReferenceCode} from './referenceCodes'

type SanityInventoryClient = Pick<SanityClient, 'fetch' | 'create' | 'patch'>

const API_VERSION = '2024-10-01'

export type InventoryCartItem = {
  productRef?: {_ref?: string | null} | null
  quantity?: number | null
  name?: string | null
  sku?: string | null
}

export type InventorySnapshot = {
  _id: string
  productId?: string
  productTitle?: string
  productSku?: string
  quantityOnHand: number
  quantityReserved: number
  quantityAvailable: number
  quantityInProduction: number
  reorderPoint: number
  reorderQuantity: number
  unitCost: number
  totalValue: number
  lowStockAlert: boolean
  outOfStock: boolean
  overstocked: boolean
  source?: string
}

export type InventoryReservationResult = {
  reserved: Array<{productId: string; productTitle?: string; quantity: number}>
  insufficient: Array<{
    productId: string
    productTitle?: string
    required: number
    available: number
  }>
  missing: Array<{productId?: string; reason: string}>
}

export type InventoryConsumptionResult = {
  consumed: Array<{productId: string; productTitle?: string; quantity: number}>
  shortages: Array<{productId: string; productTitle?: string; required: number; onHand: number}>
  missing: Array<{productId?: string; reason: string}>
}

export type InventoryManufactureResult = {
  produced: Array<{productId: string; productTitle?: string; quantity: number}>
  missing: Array<{productId?: string; reason: string}>
}

type InventoryChangeOptions = {
  client: SanityInventoryClient
  inventoryId?: string
  productId?: string
  snapshot?: InventorySnapshot | null
  onHandDelta?: number
  reservedDelta?: number
  productionDelta?: number
  unitCostOverride?: number
  setLastRestocked?: boolean
  setLastSold?: boolean
  timestampOverride?: string
}

type TransactionInput = {
  client: SanityInventoryClient
  productId: string
  type: string
  quantity: number
  unitCost?: number
  quantityBefore?: number
  quantityAfter?: number
  reference?: string
  referenceDocId?: string
  notes?: string
  createdBy?: string
  transactionDate?: string
}

type TransactionSumFilters = {
  client: SanityInventoryClient
  productId: string
  referenceDocId?: string
  type?: string
}

const INVENTORY_FIELDS = `{
  _id,
  quantityOnHand,
  quantityReserved,
  quantityAvailable,
  quantityInProduction,
  reorderPoint,
  reorderQuantity,
  unitCost,
  totalValue,
  lowStockAlert,
  outOfStock,
  overstocked,
  source,
  product->{
    "_id": _id,
    "title": title,
    "sku": sku
  }
}`

const toNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const toPositive = (value: number) => (Number.isFinite(value) && value > 0 ? value : 0)

const sanitizeSnapshot = (doc: any | null): InventorySnapshot | null => {
  if (!doc?._id) return null
  return {
    _id: doc._id,
    productId: doc.product?._id || doc.product?._ref || undefined,
    productTitle: doc.product?.title || undefined,
    productSku: doc.product?.sku || undefined,
    quantityOnHand: toNumber(doc.quantityOnHand),
    quantityReserved: Math.max(0, toNumber(doc.quantityReserved)),
    quantityAvailable: toNumber(
      doc.quantityAvailable,
      toNumber(doc.quantityOnHand) - toNumber(doc.quantityReserved),
    ),
    quantityInProduction: Math.max(0, toNumber(doc.quantityInProduction)),
    reorderPoint: Math.max(0, toNumber(doc.reorderPoint)),
    reorderQuantity: Math.max(0, toNumber(doc.reorderQuantity)),
    unitCost: toNumber(doc.unitCost),
    totalValue: toNumber(doc.totalValue),
    lowStockAlert: Boolean(doc.lowStockAlert),
    outOfStock: Boolean(doc.outOfStock),
    overstocked: Boolean(doc.overstocked),
    source: doc.source || undefined,
  }
}

export async function fetchInventoryByProduct(
  client: SanityInventoryClient,
  productId?: string | null,
): Promise<InventorySnapshot | null> {
  if (!productId) return null
  const doc = await client.fetch(
    `*[_type == "${INVENTORY_DOCUMENT_TYPE}" && product._ref == $productId][0]${INVENTORY_FIELDS}`,
    {productId},
  )
  return sanitizeSnapshot(doc)
}

export async function fetchInventoryById(
  client: SanityInventoryClient,
  inventoryId?: string | null,
): Promise<InventorySnapshot | null> {
  if (!inventoryId) return null
  const doc = await client.fetch(
    `*[_type == "${INVENTORY_DOCUMENT_TYPE}" && _id == $id][0]${INVENTORY_FIELDS}`,
    {
      id: inventoryId,
    },
  )
  return sanitizeSnapshot(doc)
}

const deriveState = (params: {
  quantityOnHand: number
  quantityReserved: number
  reorderPoint: number
  unitCost: number
}) => {
  const quantityAvailable = params.quantityOnHand - params.quantityReserved
  const totalValue = params.quantityOnHand * params.unitCost
  const lowStockAlert = quantityAvailable <= params.reorderPoint
  const outOfStock = quantityAvailable <= 0
  const overstocked =
    params.reorderPoint > 0 ? params.quantityOnHand > params.reorderPoint * 3 : false
  return {quantityAvailable, totalValue, lowStockAlert, outOfStock, overstocked}
}

export async function applyInventoryChanges(options: InventoryChangeOptions) {
  const {
    client,
    inventoryId,
    productId,
    snapshot,
    onHandDelta = 0,
    reservedDelta = 0,
    productionDelta = 0,
    unitCostOverride,
    setLastRestocked,
    setLastSold,
    timestampOverride,
  } = options

  const current =
    snapshot ||
    (inventoryId
      ? await fetchInventoryById(client, inventoryId)
      : await fetchInventoryByProduct(client, productId))

  if (!current) {
    throw new Error('Inventory record not found')
  }

  const quantityOnHand = toNumber(current.quantityOnHand + onHandDelta)
  const quantityReserved = Math.max(0, toNumber(current.quantityReserved + reservedDelta))
  const quantityInProduction = Math.max(0, toNumber(current.quantityInProduction + productionDelta))
  const unitCost = unitCostOverride !== undefined ? unitCostOverride : toNumber(current.unitCost)
  const derived = deriveState({
    quantityOnHand,
    quantityReserved,
    reorderPoint: toNumber(current.reorderPoint),
    unitCost,
  })

  const now = timestampOverride || new Date().toISOString()
  const patchData: Record<string, any> = {
    quantityOnHand,
    quantityReserved,
    quantityAvailable: derived.quantityAvailable,
    quantityInProduction,
    unitCost,
    totalValue: derived.totalValue,
    lowStockAlert: derived.lowStockAlert,
    outOfStock: derived.outOfStock,
    overstocked: derived.overstocked,
  }
  if (setLastRestocked) patchData.lastRestocked = now
  if (setLastSold) patchData.lastSold = now

  await client.patch(current._id).set(patchData).commit({autoGenerateArrayKeys: true})

  return {
    ...current,
    ...patchData,
  } satisfies InventorySnapshot
}

export async function recordInventoryTransaction(input: TransactionInput) {
  const {
    client,
    productId,
    type,
    quantity,
    unitCost,
    quantityBefore,
    quantityAfter,
    reference,
    referenceDocId,
    notes,
    createdBy,
    transactionDate,
  } = input
  const transactionNumber = await generateReferenceCode(client, {
    prefix: 'IT-',
    typeName: 'inventoryTransaction',
    fieldName: 'transactionNumber',
  })

  const payload: Record<string, any> = {
    _type: 'inventoryTransaction' as const,
    transactionNumber,
    product: {_type: 'reference', _ref: productId},
    type,
    quantity,
    quantityBefore,
    quantityAfter,
    unitCost,
    totalValue: unitCost !== undefined ? Number(unitCost) * quantity : undefined,
    reference,
    notes,
    createdBy,
    transactionDate: transactionDate || new Date().toISOString(),
  }
  if (referenceDocId) {
    payload.referenceDoc = {_type: 'reference', _ref: referenceDocId}
  }

  await client.create(payload as any, {autoGenerateArrayKeys: true})
}

export async function sumInventoryTransactions(filters: TransactionSumFilters): Promise<number> {
  const {client, productId, referenceDocId, type} = filters
  const clauses = [`_type == "inventoryTransaction"`, `product._ref == $productId`]
  const params: Record<string, any> = {productId}
  if (referenceDocId) {
    clauses.push('referenceDoc._ref == $referenceDocId')
    params.referenceDocId = referenceDocId
  }
  if (type) {
    clauses.push('type == $type')
    params.type = type
  }
  const query = `coalesce(sum(*[${clauses.join(' && ')}].quantity), 0)`
  return toNumber(await client.fetch(query, params))
}

const getItemQuantity = (item?: InventoryCartItem | null): number => {
  if (!item) return 0
  const qty = Number(item.quantity)
  if (Number.isFinite(qty)) return qty
  return 0
}

type ReservationOptions = {
  client: SanityInventoryClient
  items: InventoryCartItem[]
  referenceDocId?: string
  referenceLabel?: string
  createdBy?: string
}

export async function reserveInventoryForItems(
  options: ReservationOptions,
): Promise<InventoryReservationResult> {
  const {client, items, referenceDocId, referenceLabel, createdBy} = options
  const reserved: InventoryReservationResult['reserved'] = []
  const insufficient: InventoryReservationResult['insufficient'] = []
  const missing: InventoryReservationResult['missing'] = []

  const inventoryCache = new Map<string, InventorySnapshot | null>()
  const reservationCache = new Map<string, number>()

  for (const item of items) {
    const productId = item?.productRef?._ref
    const quantityNeeded = toPositive(getItemQuantity(item) || 1)
    if (!productId || quantityNeeded <= 0) continue

    let inventory = inventoryCache.get(productId)
    if (inventory === undefined) {
      inventory = await fetchInventoryByProduct(client, productId)
      inventoryCache.set(productId, inventory)
    }
    if (!inventory) {
      missing.push({productId, reason: 'Inventory not initialized'})
      continue
    }

    const cacheKey = `${productId}-${referenceDocId || 'none'}`
    let existingReserved = reservationCache.get(cacheKey)
    if (existingReserved === undefined) {
      existingReserved = await sumInventoryTransactions({
        client,
        productId,
        referenceDocId,
        type: 'reserved',
      })
      reservationCache.set(cacheKey, existingReserved)
    }

    const outstanding = Math.max(0, quantityNeeded - existingReserved)
    if (outstanding <= 0) continue

    const available = toNumber(inventory.quantityOnHand - inventory.quantityReserved)
    if (available < outstanding) {
      insufficient.push({
        productId,
        productTitle: inventory.productTitle,
        required: quantityNeeded,
        available,
      })
      continue
    }

    const updated = await applyInventoryChanges({
      client,
      snapshot: inventory,
      reservedDelta: outstanding,
    })

    await recordInventoryTransaction({
      client,
      productId,
      type: 'reserved',
      quantity: outstanding,
      unitCost: inventory.unitCost,
      quantityBefore: inventory.quantityOnHand,
      quantityAfter: inventory.quantityOnHand,
      reference: referenceLabel,
      referenceDocId,
      createdBy,
      notes: item?.name ? `Reserved for ${item.name}` : undefined,
    })

    reservationCache.set(cacheKey, existingReserved + outstanding)
    inventoryCache.set(productId, updated)
    reserved.push({
      productId,
      productTitle: inventory.productTitle,
      quantity: outstanding,
    })
    inventory = updated
  }

  return {reserved, insufficient, missing}
}

type ConsumptionOptions = {
  client: SanityInventoryClient
  items: InventoryCartItem[]
  type: 'sold' | 'used'
  referenceDocId?: string
  referenceLabel?: string
  createdBy?: string
  setLastSold?: boolean
}

export async function consumeInventoryForItems(
  options: ConsumptionOptions,
): Promise<InventoryConsumptionResult> {
  const {
    client,
    items,
    type,
    referenceDocId,
    referenceLabel,
    createdBy,
    setLastSold = true,
  } = options
  const consumed: InventoryConsumptionResult['consumed'] = []
  const shortages: InventoryConsumptionResult['shortages'] = []
  const missing: InventoryConsumptionResult['missing'] = []

  const inventoryCache = new Map<string, InventorySnapshot | null>()
  const consumptionCache = new Map<string, number>()
  const reservationCache = new Map<string, number>()

  for (const item of items) {
    const productId = item?.productRef?._ref
    const quantityNeeded = toPositive(getItemQuantity(item) || 1)
    if (!productId || quantityNeeded <= 0) continue

    let inventory = inventoryCache.get(productId)
    if (inventory === undefined) {
      inventory = await fetchInventoryByProduct(client, productId)
      inventoryCache.set(productId, inventory)
    }
    if (!inventory) {
      missing.push({productId, reason: 'Inventory not initialized'})
      continue
    }

    const consumptionKey = `${productId}-${referenceDocId || 'none'}-${type}`
    let existingConsumed = consumptionCache.get(consumptionKey)
    if (existingConsumed === undefined) {
      existingConsumed = await sumInventoryTransactions({
        client,
        productId,
        referenceDocId,
        type,
      })
      consumptionCache.set(consumptionKey, existingConsumed)
    }

    const outstanding = Math.max(0, quantityNeeded - existingConsumed)
    if (outstanding <= 0) continue

    const reservationKey = `${productId}-${referenceDocId || 'none'}`
    let reservedForRef = reservationCache.get(reservationKey)
    if (reservedForRef === undefined) {
      reservedForRef = await sumInventoryTransactions({
        client,
        productId,
        referenceDocId,
        type: 'reserved',
      })
      reservationCache.set(reservationKey, reservedForRef)
    }

    const available = toNumber(inventory.quantityOnHand)
    if (available < outstanding) {
      shortages.push({
        productId,
        productTitle: inventory.productTitle,
        required: outstanding,
        onHand: available,
      })
    }

    const releaseAmount = Math.min(outstanding, reservedForRef)

    const updated = await applyInventoryChanges({
      client,
      snapshot: inventory,
      onHandDelta: -outstanding,
      reservedDelta: releaseAmount ? -releaseAmount : 0,
      setLastSold,
    })

    await recordInventoryTransaction({
      client,
      productId,
      type,
      quantity: outstanding,
      quantityBefore: inventory.quantityOnHand,
      quantityAfter: updated.quantityOnHand,
      unitCost: inventory.unitCost,
      reference: referenceLabel,
      referenceDocId,
      createdBy,
      notes: item?.name ? `${type === 'used' ? 'Used' : 'Sold'} ${item.name}` : undefined,
    })

    consumptionCache.set(consumptionKey, existingConsumed + outstanding)
    reservationCache.set(reservationKey, Math.max(0, reservedForRef - releaseAmount))
    inventoryCache.set(productId, updated)
    consumed.push({
      productId,
      productTitle: inventory.productTitle,
      quantity: outstanding,
    })
    inventory = updated
  }

  return {consumed, shortages, missing}
}

type ManufactureOptions = {
  client: SanityInventoryClient
  productId: string
  quantity: number
  referenceDocId?: string
  referenceLabel?: string
  createdBy?: string
}

export async function recordManufacturedInventory(
  options: ManufactureOptions,
): Promise<InventoryManufactureResult> {
  const {client, productId, quantity, referenceDocId, referenceLabel, createdBy} = options
  const produced: InventoryManufactureResult['produced'] = []
  const missing: InventoryManufactureResult['missing'] = []
  if (!productId || quantity <= 0) {
    missing.push({productId, reason: 'Invalid product/quantity'})
    return {produced, missing}
  }

  const inventory = await fetchInventoryByProduct(client, productId)
  if (!inventory) {
    missing.push({productId, reason: 'Inventory not initialized'})
    return {produced, missing}
  }

  const updated = await applyInventoryChanges({
    client,
    snapshot: inventory,
    onHandDelta: quantity,
    productionDelta: -quantity,
    setLastRestocked: true,
  })

  await recordInventoryTransaction({
    client,
    productId,
    type: 'manufactured',
    quantity,
    quantityBefore: inventory.quantityOnHand,
    quantityAfter: updated.quantityOnHand,
    unitCost: inventory.unitCost,
    reference: referenceLabel,
    referenceDocId,
    createdBy,
    notes: 'Production complete',
  })

  produced.push({productId, productTitle: inventory.productTitle, quantity})
  return {produced, missing}
}
