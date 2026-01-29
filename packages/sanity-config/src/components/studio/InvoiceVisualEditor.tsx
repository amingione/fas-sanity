import React, {useEffect, useMemo, useState} from 'react'
import {useClient} from 'sanity'
import {useToast} from '@sanity/ui'

type InvoiceAddress = {
  name?: string
  email?: string
  phone?: string
  address_line1?: string
  address_line2?: string
  city_locality?: string
  state_province?: string
  postal_code?: string
  country_code?: string
}

type ReferenceLike = {
  _type: 'reference'
  _ref: string
}

type InvoiceLineItem = {
  _key?: string
  _type?: 'invoiceLineItem'
  kind?: 'product' | 'custom'
  product?: ReferenceLike | null
  description?: string
  sku?: string
  quantity?: number
  unitPrice?: number
  lineTotal?: number
  upgradesTotal?: number
  metadata?: Array<{key?: string; value?: unknown}> | Record<string, unknown> | null
  metadataEntries?: Array<{key?: string; value?: unknown}> | null
}

type ShipmentWeight = {
  value?: number
  unit?: string
}

type PackageDimensions = {
  length?: number
  width?: number
  height?: number
}

type LegacySelectedService = {
  carrierId?: string
  carrier?: string
  service?: string
  serviceCode?: string
  amount?: number
  currency?: string
  deliveryDays?: number
  estimatedDeliveryDate?: string
}

type FulfillmentDetails = {
  carrier?: string
  service?: string
  deliveryDays?: number
  estimatedDeliveryDate?: string
  trackingNumber?: string
  trackingUrl?: string
  shippingLabelUrl?: string
}

type ShippingLogEntry = {
  _key?: string
  status?: string
  message?: string
  labelUrl?: string
  trackingUrl?: string
  trackingNumber?: string
  weight?: number
  createdAt?: string
}

type OrderShippingLike = {
  amountShipping?: number
  carrier?: string
  shippingCarrier?: string
  trackingNumber?: string
  trackingUrl?: string
  shippingLabelUrl?: string
  fulfillment?: FulfillmentDetails | null
  selectedService?: LegacySelectedService | null
} | null

type InvoiceDocument = {
  _id: string
  invoiceNumber?: string
  invoiceDate?: string
  dueDate?: string
  status?: string
  billTo?: InvoiceAddress
  shipTo?: InvoiceAddress
  lineItems?: InvoiceLineItem[]
  discountType?: 'amount' | 'percent'
  discountValue?: number
  taxRate?: number
  customerNotes?: string
  internalNotes?: string
  paymentTerms?: string
  serviceRenderedBy?: string
  paymentInstructions?: string
  depositAmount?: number
  subtotal?: number
  total?: number
  amountShipping?: number
  carrier?: string
  shippingCarrier?: string
  trackingNumber?: string
  trackingUrl?: string
  shippingLabelUrl?: string
  weight?: ShipmentWeight | null
  dimensions?: PackageDimensions | null
  fulfillment?: FulfillmentDetails | null
  selectedService?: LegacySelectedService | null
  shippingLog?: ShippingLogEntry[] | null
  orderRef?: OrderShippingLike
  order?: OrderShippingLike
}

type DocumentViewProps = {
  document?: {
    displayed?: InvoiceDocument | null
    draft?: InvoiceDocument | null
    published?: InvoiceDocument | null
  }
  schemaType?: unknown
}

type EditorLineItem = InvoiceLineItem & {
  quantity: number
  unitPrice: number
  lineTotal?: number
}

type EditorState = {
  invoiceDate: string
  dueDate: string
  billTo: InvoiceAddress
  shipTo: InvoiceAddress
  lineItems: EditorLineItem[]
  discountType: 'amount' | 'percent'
  discountValue: number
  taxRate: number
  customerNotes: string
  internalNotes: string
  paymentTerms: string
  serviceRenderedBy: string
  paymentInstructions: string
  depositAmount: number
  amountShipping: number
  shippingCarrier: string
  trackingNumber: string
  trackingUrl: string
  shippingLabelUrl: string
  weight: ShipmentWeight
  dimensions: PackageDimensions
  fulfillmentDetails: FulfillmentDetails | null
  shippingLog: ShippingLogEntry[]
}

type ProductSearchResult = {
  _id: string
  title: string
  sku?: string
  price: number
  shortPlain: string
  taxBehavior?: string
}

type Totals = {
  subtotal: number
  discount: number
  taxableBase: number
  tax: number
  shipping: number
  total: number
  balanceDue: number
}

const emptyAddress: InvoiceAddress = {
  name: '',
  email: '',
  phone: '',
  address_line1: '',
  address_line2: '',
  city_locality: '',
  state_province: '',
  postal_code: '',
  country_code: '',
}

const defaultEditorState: EditorState = {
  invoiceDate: '',
  dueDate: '',
  billTo: {...emptyAddress},
  shipTo: {...emptyAddress},
  lineItems: [],
  discountType: 'amount',
  discountValue: 0,
  taxRate: 0,
  customerNotes: '',
  internalNotes: '',
  paymentTerms: '',
  serviceRenderedBy: '',
  paymentInstructions: '',
  depositAmount: 0,
  amountShipping: 0,
  shippingCarrier: '',
  trackingNumber: '',
  trackingUrl: '',
  shippingLabelUrl: '',
  weight: {value: 0, unit: 'pound'},
  dimensions: {length: 0, width: 0, height: 0},
  fulfillmentDetails: null,
  shippingLog: [],
}

const sanitizeNumber = (value: unknown, fallback?: number): number => {
  if (value === '' || value === null || value === undefined) return fallback ?? 0
  const num = Number(value)
  return Number.isFinite(num) ? num : (fallback ?? 0)
}

const trimString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

const toDateInput = (value: string | undefined | null): string => {
  if (!value) return ''
  return value.slice(0, 10)
}

const generateKey = () => Math.random().toString(36).slice(2, 10)

function portableTextToPlain(blocks: any): string {
  if (!Array.isArray(blocks)) return ''
  return blocks
    .map((block) => {
      if (block?._type !== 'block' || !Array.isArray(block.children)) return ''
      return block.children.map((child: any) => child?.text || '').join('')
    })
    .filter(Boolean)
    .join('\n')
    .trim()
}

function fmt(n?: number): string {
  return typeof n === 'number' && !Number.isNaN(n) ? Number(n).toFixed(2) : '0.00'
}

function formatDate(value?: string): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString()
}

function formatDateTime(value?: string): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

const extractStateFromDoc = (doc: InvoiceDocument | null | undefined): EditorState => {
  const invoiceDate = toDateInput(doc?.invoiceDate) || new Date().toISOString().slice(0, 10)
  const dueDate = toDateInput(doc?.dueDate) || ''

  const normalizeAddress = (input?: InvoiceAddress | null): InvoiceAddress => {
    if (!input) return {...emptyAddress}
    return {
      name: trimString(input.name),
      email: trimString(input.email),
      phone: trimString(input.phone),
      address_line1: trimString(input.address_line1),
      address_line2: trimString(input.address_line2),
      city_locality: trimString(input.city_locality),
      state_province: trimString(input.state_province),
      postal_code: trimString(input.postal_code),
      country_code: trimString(input.country_code),
    }
  }

  const lineItems: EditorLineItem[] = Array.isArray(doc?.lineItems)
    ? doc?.lineItems?.filter(Boolean).map((item) => ({
        _key: item?._key || generateKey(),
        _type: 'invoiceLineItem',
        kind:
          item?.kind === 'product' || (!item?.kind && item?.product?._ref) ? 'product' : 'custom',
        product: item?.product ?? null,
        description: trimString(item?.description),
        sku: trimString(item?.sku),
        quantity: sanitizeNumber(item?.quantity, 1),
        unitPrice: sanitizeNumber(item?.unitPrice, 0),
        lineTotal: typeof item?.lineTotal === 'number' ? item?.lineTotal : undefined,
      }))
    : []

  const paymentTerms = trimString(doc?.paymentTerms)
  const serviceRenderedBy = trimString(doc?.serviceRenderedBy)
  const paymentInstructions = trimString(doc?.paymentInstructions)
  const depositAmount = sanitizeNumber(doc?.depositAmount, 0)

  const pickNumber = (...values: Array<number | string | null | undefined>): number => {
    for (const value of values) {
      if (value === null || value === undefined || value === '') continue
      const num = Number(value)
      if (Number.isFinite(num)) return num
    }
    return 0
  }

  const normalizeWeight = (input?: ShipmentWeight | null): ShipmentWeight => {
    return {
      value: sanitizeNumber(input?.value, 0),
      unit: trimString(input?.unit) || 'pound',
    }
  }

  const normalizeDimensions = (input?: PackageDimensions | null): PackageDimensions => ({
    length: sanitizeNumber(input?.length, 0),
    width: sanitizeNumber(input?.width, 0),
    height: sanitizeNumber(input?.height, 0),
  })

  const normalizeFulfillmentDetails = (
    input?: FulfillmentDetails | null,
  ): FulfillmentDetails | null => {
    if (!input) return null
    const normalized: FulfillmentDetails = {}
    if (trimString(input.carrier)) normalized.carrier = trimString(input.carrier)
    if (trimString(input.service)) normalized.service = trimString(input.service)
    const days = Number((input as any)?.deliveryDays ?? input?.deliveryDays)
    if (Number.isFinite(days)) normalized.deliveryDays = days
    if (trimString(input.estimatedDeliveryDate))
      normalized.estimatedDeliveryDate = trimString(input.estimatedDeliveryDate)
    if (trimString((input as any).trackingNumber))
      normalized.trackingNumber = trimString((input as any).trackingNumber)
    if (trimString((input as any).trackingUrl))
      normalized.trackingUrl = trimString((input as any).trackingUrl)
    if (trimString((input as any).shippingLabelUrl))
      normalized.shippingLabelUrl = trimString((input as any).shippingLabelUrl)
    return Object.keys(normalized).length ? normalized : null
  }

  const normalizeLegacySelectedService = (
    input?: LegacySelectedService | null,
  ): FulfillmentDetails | null => {
    if (!input) return null
    const normalized: FulfillmentDetails = {}
    if (trimString(input.carrier)) normalized.carrier = trimString(input.carrier)
    else if (trimString(input.carrierId)) normalized.carrier = trimString(input.carrierId)
    if (trimString(input.service)) normalized.service = trimString(input.service)
    else if (trimString(input.serviceCode)) normalized.service = trimString(input.serviceCode)
    const days = Number(input.deliveryDays)
    if (Number.isFinite(days)) normalized.deliveryDays = days
    if (trimString(input.estimatedDeliveryDate))
      normalized.estimatedDeliveryDate = trimString(input.estimatedDeliveryDate)
    return Object.keys(normalized).length ? normalized : null
  }

  const fulfillmentDetails =
    normalizeFulfillmentDetails(doc?.fulfillment) ||
    normalizeFulfillmentDetails(doc?.orderRef?.fulfillment) ||
    normalizeFulfillmentDetails(doc?.order?.fulfillment) ||
    normalizeLegacySelectedService(doc?.selectedService) ||
    normalizeLegacySelectedService(doc?.orderRef?.selectedService) ||
    normalizeLegacySelectedService(doc?.order?.selectedService) ||
    null

  const amountShipping = pickNumber(
    doc?.amountShipping,
    doc?.orderRef?.amountShipping,
    doc?.order?.amountShipping,
  )

  const shippingCarrier =
    trimString(doc?.carrier) ||
    trimString(doc?.shippingCarrier) ||
    trimString(fulfillmentDetails?.carrier) ||
    trimString(doc?.orderRef?.carrier) ||
    trimString(doc?.orderRef?.shippingCarrier) ||
    trimString(doc?.order?.carrier) ||
    trimString(doc?.order?.shippingCarrier) ||
    ''

  const trackingNumber =
    trimString(doc?.trackingNumber) ||
    trimString(doc?.orderRef?.trackingNumber) ||
    trimString(doc?.order?.trackingNumber) ||
    ''

  const trackingUrl =
    trimString(doc?.trackingUrl) ||
    trimString(fulfillmentDetails?.trackingUrl) ||
    trimString(doc?.orderRef?.trackingUrl) ||
    trimString(doc?.order?.trackingUrl) ||
    ''

  const shippingLabelUrl =
    trimString(doc?.shippingLabelUrl) ||
    trimString(fulfillmentDetails?.shippingLabelUrl) ||
    trimString(doc?.orderRef?.shippingLabelUrl) ||
    trimString(doc?.order?.shippingLabelUrl) ||
    ''

  const shippingLog: ShippingLogEntry[] = Array.isArray(doc?.shippingLog)
    ? (doc?.shippingLog || []).filter(Boolean)
    : []

  return {
    invoiceDate,
    dueDate,
    billTo: normalizeAddress(doc?.billTo),
    shipTo: normalizeAddress(doc?.shipTo),
    lineItems,
    discountType: doc?.discountType === 'percent' ? 'percent' : 'amount',
    discountValue: sanitizeNumber(doc?.discountValue, 0),
    taxRate: sanitizeNumber(doc?.taxRate, 0),
    customerNotes: trimString(doc?.customerNotes),
    internalNotes: trimString(doc?.internalNotes),
    paymentTerms,
    serviceRenderedBy,
    paymentInstructions,
    depositAmount,
    amountShipping,
    shippingCarrier,
    trackingNumber,
    trackingUrl,
    shippingLabelUrl,
    weight: normalizeWeight(doc?.weight),
    dimensions: normalizeDimensions(doc?.dimensions),
    fulfillmentDetails,
    shippingLog,
  }
}

const computeTotals = (state: EditorState): Totals => {
  const subtotal = state.lineItems.reduce((sum, item) => {
    const manual = typeof item.lineTotal === 'number' ? item.lineTotal : undefined
    const qty = sanitizeNumber(item.quantity || 0, 0)
    const unit = sanitizeNumber(item.unitPrice || 0, 0)
    const line = manual ?? qty * unit
    return sum + (Number.isFinite(line) ? line : 0)
  }, 0)

  const discount =
    state.discountType === 'percent'
      ? subtotal * (sanitizeNumber(state.discountValue, 0) / 100)
      : sanitizeNumber(state.discountValue, 0)

  const taxableBase = Math.max(0, subtotal - discount)
  const tax = taxableBase * (sanitizeNumber(state.taxRate, 0) / 100)
  const shipping = sanitizeNumber(state.amountShipping, 0)
  const total = Math.max(0, taxableBase + tax + shipping)
  const deposit = sanitizeNumber(state.depositAmount, 0)
  const balanceDue = Math.max(0, total - deposit)

  return {subtotal, discount, taxableBase, tax, shipping, total, balanceDue}
}

const toDraftId = (id?: string): string => {
  if (!id) return ''
  return id.startsWith('drafts.') ? id : `drafts.${id}`
}

const InvoiceVisualEditor: React.FC<DocumentViewProps> = ({document}) => {
  const displayed = document?.displayed || document?.draft || document?.published
  const baseId =
    document?.draft?._id ||
    document?.displayed?._id ||
    document?.published?._id ||
    displayed?._id ||
    ''
  const draftId = toDraftId(baseId || displayed?._id)

  const [state, setState] = useState<EditorState>(defaultEditorState)
  const [lastSnapshot, setLastSnapshot] = useState<string>('')
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const client = useClient({apiVersion: '2024-10-01'})
  const toast = useToast()

  useEffect(() => {
    if (!displayed) {
      setState(defaultEditorState)
      setLastSnapshot(JSON.stringify(defaultEditorState))
      setIsDirty(false)
      return
    }
    const nextState = extractStateFromDoc(displayed)
    const serialized = JSON.stringify(nextState)
    if (!isDirty) {
      setState(nextState)
      setLastSnapshot(serialized)
    } else if (!lastSnapshot) {
      setLastSnapshot(serialized)
    }
  }, [displayed, isDirty, lastSnapshot])

  const totals = useMemo(() => computeTotals(state), [state])

  const updateState = <K extends keyof EditorState>(key: K, value: EditorState[K]) => {
    setState((prev) => ({...prev, [key]: value}))
    setIsDirty(true)
  }

  const updateAddress = (key: 'billTo' | 'shipTo', field: keyof InvoiceAddress, value: string) => {
    setState((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] || {...emptyAddress}),
        [field]: value,
      },
    }))
    setIsDirty(true)
  }

  const copyBillToToShipTo = () => {
    setState((prev) => ({
      ...prev,
      shipTo: {...prev.billTo},
    }))
    setIsDirty(true)
  }

  const clearLineItems = () => {
    setState((prev) => {
      if (prev.lineItems.length === 0) {
        return prev
      }
      setIsDirty(true)
      return {...prev, lineItems: []}
    })
  }

  const updateWeightValue = (value: string) => {
    setState((prev) => ({
      ...prev,
      weight: {
        value: sanitizeNumber(value, 0),
        unit: trimString(prev.weight?.unit) || 'pound',
      },
    }))
    setIsDirty(true)
  }

  const updateWeightUnit = (unit: string) => {
    setState((prev) => ({
      ...prev,
      weight: {
        value: sanitizeNumber(prev.weight?.value, 0),
        unit: unit || 'pound',
      },
    }))
    setIsDirty(true)
  }

  const updateDimension = (field: keyof PackageDimensions, value: string) => {
    setState((prev) => ({
      ...prev,
      dimensions: {
        ...(prev.dimensions || {length: 0, width: 0, height: 0}),
        [field]: sanitizeNumber(value, 0),
      },
    }))
    setIsDirty(true)
  }

  const updateLineItem = <K extends keyof EditorLineItem>(
    index: number,
    key: K,
    value: EditorLineItem[K],
  ) => {
    setState((prev) => {
      const next = [...prev.lineItems]
      const target = {...next[index]}
      target[key] = value
      if (key === 'quantity' || key === 'unitPrice') {
        const qty = sanitizeNumber(key === 'quantity' ? value : target.quantity, 0)
        const unit = sanitizeNumber(key === 'unitPrice' ? value : target.unitPrice, 0)
        target.lineTotal = target.lineTotal ?? qty * unit
      }
      next[index] = target
      return {...prev, lineItems: next}
    })
    setIsDirty(true)
  }

  const setLineItemKind = (index: number, kind: 'product' | 'custom') => {
    setState((prev) => {
      const next = [...prev.lineItems]
      const target = {...next[index]}
      target.kind = kind
      if (kind === 'custom') {
        target.product = undefined
      }
      next[index] = target
      return {...prev, lineItems: next}
    })
    setIsDirty(true)
  }

  const applyProductSelection = (index: number, product: ProductSearchResult) => {
    setState((prev) => {
      const next = [...prev.lineItems]
      const target = {...next[index]}
      target.kind = 'product'
      target.product = {_type: 'reference', _ref: product._id}
      target.description = product.shortPlain || product.title
      target.sku = product.sku || ''
      const quantity = Math.max(1, sanitizeNumber(target.quantity, 1))
      target.quantity = quantity
      target.unitPrice = sanitizeNumber(product.price, 0)
      target.lineTotal = undefined
      next[index] = target
      return {...prev, lineItems: next}
    })
    setIsDirty(true)
  }

  const addLineItem = () => {
    setState((prev) => ({
      ...prev,
      lineItems: [
        ...prev.lineItems,
        {
          _key: generateKey(),
          _type: 'invoiceLineItem',
          kind: 'product',
          product: null,
          description: '',
          quantity: 1,
          unitPrice: 0,
        },
      ],
    }))
    setIsDirty(true)
  }

  const removeLineItem = (index: number) => {
    setState((prev) => ({
      ...prev,
      lineItems: prev.lineItems.filter((_, idx) => idx !== index),
    }))
    setIsDirty(true)
  }

  const resetChanges = () => {
    if (!lastSnapshot) return
    try {
      const parsed = JSON.parse(lastSnapshot) as EditorState
      setState(parsed)
    } catch {
      setState(defaultEditorState)
    }
    setIsDirty(false)
  }

  const handleSave = async () => {
    if (!draftId) {
      toast.push({
        status: 'error',
        title: 'Unable to determine invoice ID',
        description: 'Try saving from the default form view.',
      })
      return
    }

    setIsSaving(true)
    try {
      const sanitizedAddress = (address: InvoiceAddress): InvoiceAddress => {
        const trimmed = Object.fromEntries(
          Object.entries(address || {}).map(([key, value]) => [key, trimString(value)]),
        ) as InvoiceAddress
        const cleaned: InvoiceAddress = {}
        for (const [key, value] of Object.entries(trimmed)) {
          if (value) {
            cleaned[key as keyof InvoiceAddress] = value
          }
        }
        return cleaned
      }

      const sanitizedLineItems: InvoiceLineItem[] = state.lineItems.map((item) => ({
        _key: item._key || generateKey(),
        _type: 'invoiceLineItem',
        kind: item.kind === 'product' ? 'product' : 'custom',
        product: item.kind === 'product' ? (item.product ?? null) : null,
        description: trimString(item.description),
        sku: trimString(item.sku),
        quantity: sanitizeNumber(item.quantity, 0),
        unitPrice: sanitizeNumber(item.unitPrice, 0),
        lineTotal:
          typeof item.lineTotal === 'number' && Number.isFinite(item.lineTotal)
            ? Number(item.lineTotal)
            : undefined,
      }))

      const paymentTermsValue = trimString(state.paymentTerms)
      const serviceRenderedValue = trimString(state.serviceRenderedBy)
      const paymentInstructionsValue = trimString(state.paymentInstructions)
      const depositAmountValue = sanitizeNumber(state.depositAmount, 0)

      const shippingAmount = sanitizeNumber(state.amountShipping, 0)
      const weightValue = sanitizeNumber(state.weight?.value, 0)
      const sanitizedWeight =
        Number.isFinite(weightValue) && weightValue > 0
          ? {
              value: weightValue,
              unit: trimString(state.weight?.unit) || 'pound',
            }
          : null
      const length = sanitizeNumber(state.dimensions?.length, 0)
      const width = sanitizeNumber(state.dimensions?.width, 0)
      const height = sanitizeNumber(state.dimensions?.height, 0)
      const hasDimensions = length > 0 && width > 0 && height > 0
      const sanitizedDimensions = hasDimensions ? {length, width, height} : null
      const shippingCarrier = trimString(state.shippingCarrier)
      const trackingNumber = trimString(state.trackingNumber)
      const trackingUrl = trimString(state.trackingUrl)
      const shippingLabelUrl = trimString(state.shippingLabelUrl)

      await client
        .patch(draftId)
        .setIfMissing({_type: 'invoice'})
        .set({
          invoiceDate: state.invoiceDate || null,
          dueDate: state.dueDate || null,
          billTo: sanitizedAddress(state.billTo),
          shipTo: sanitizedAddress(state.shipTo),
          lineItems: sanitizedLineItems,
          discountType: state.discountType,
          discountValue: sanitizeNumber(state.discountValue, 0),
          taxRate: sanitizeNumber(state.taxRate, 0),
          customerNotes: state.customerNotes || '',
          internalNotes: state.internalNotes || '',
          paymentTerms: paymentTermsValue || null,
          serviceRenderedBy: serviceRenderedValue || null,
          paymentInstructions: paymentInstructionsValue,
          depositAmount: depositAmountValue,
          subtotal: totals.subtotal,
          total: totals.total,
          amountSubtotal: totals.subtotal,
          amountTax: totals.tax,
          amountShipping: shippingAmount,
          carrier: shippingCarrier || null,
          trackingNumber: trackingNumber || null,
          trackingUrl: trackingUrl || null,
          shippingLabelUrl: shippingLabelUrl || null,
          weight: sanitizedWeight,
          dimensions: sanitizedDimensions,
        })
        .commit({autoGenerateArrayKeys: true})

      const snapshot = JSON.stringify(state)
      setLastSnapshot(snapshot)
      setIsDirty(false)
      toast.push({
        status: 'success',
        title: 'Invoice updated',
        description: 'Changes saved to draft.',
      })
    } catch (error: any) {
      toast.push({
        status: 'error',
        title: 'Failed to save invoice',
        description: error?.message || String(error),
      })
    } finally {
      setIsSaving(false)
    }
  }

  const taxRateValue = sanitizeNumber(state.taxRate, 0)
  const depositValue = sanitizeNumber(state.depositAmount, 0)
  const paymentTermSuggestions = ['Due on receipt', 'Net 15', 'Net 30', 'Net 45', 'Net 60']

  type LineItemRowProps = {
    item: EditorLineItem
    index: number
    taxRate: number
    onUpdate: typeof updateLineItem
    onRemove: (index: number) => void
    onKindChange: (index: number, kind: 'product' | 'custom') => void
    onProductPick: (index: number, product: ProductSearchResult) => void
    client: ReturnType<typeof useClient>
  }

  const LineItemRow: React.FC<LineItemRowProps> = ({
    item,
    index,
    taxRate,
    onUpdate,
    onRemove,
    onKindChange,
    onProductPick,
    client,
  }) => {
    const [query, setQuery] = useState(item.kind === 'product' ? item.description || '' : '')
    const [results, setResults] = useState<ProductSearchResult[]>([])
    const [loadingOptions, setLoadingOptions] = useState(false)
    const [dropdownVisible, setDropdownVisible] = useState(false)

    const productRef = item.product?._ref

    useEffect(() => {
      if (item.kind === 'product') {
        setQuery(item.description || '')
      } else {
        setQuery('')
        setResults([])
        setDropdownVisible(false)
      }
    }, [item.kind, item.description, productRef])

    useEffect(() => {
      if (item.kind !== 'product') {
        return
      }
      const term = query.trim()
      if (term.length === 0) {
        setResults([])
        return
      }
      let cancelled = false
      setLoadingOptions(true)
      const handle = setTimeout(async () => {
        try {
          const fetched = await client.fetch(
            `*[_type == "product" && (title match $term || sku match $term)][0...8]{
              _id,
              title,
              sku,
              price,
              salePrice,
              onSale,
              shortDescription,
              taxBehavior
            }`,
            {term: `${term}*`},
          )
          if (cancelled) return
          const mapped: ProductSearchResult[] = (Array.isArray(fetched) ? fetched : []).map(
            (prod: any) => {
              const resolvedPrice =
                prod?.onSale && typeof prod?.salePrice === 'number' ? prod.salePrice : prod?.price
              return {
                _id: prod?._id,
                title: prod?.title || 'Untitled product',
                sku: prod?.sku || '',
                price: sanitizeNumber(resolvedPrice, 0),
                shortPlain: portableTextToPlain(prod?.shortDescription) || prod?.title || 'Product',
                taxBehavior: prod?.taxBehavior || 'taxable',
              }
            },
          )
          setResults(mapped)
          setDropdownVisible(true)
        } catch {
          if (!cancelled) {
            setResults([])
          }
        } finally {
          if (!cancelled) {
            setLoadingOptions(false)
          }
        }
      }, 220)

      return () => {
        cancelled = true
        clearTimeout(handle)
      }
    }, [client, item.kind, query])

    const amount = useMemo(() => {
      if (typeof item.lineTotal === 'number' && Number.isFinite(item.lineTotal)) {
        return Number(item.lineTotal)
      }
      const qty = sanitizeNumber(item.quantity, 0)
      const unit = sanitizeNumber(item.unitPrice, 0)
      return Number((qty * unit).toFixed(2))
    }, [item.lineTotal, item.quantity, item.unitPrice])

    const estimatedTax = useMemo(() => {
      if (!taxRate) return 0
      return Number((amount * (taxRate / 100)).toFixed(2))
    }, [amount, taxRate])

    const handleProductSelect = (product: ProductSearchResult) => {
      onProductPick(index, product)
      setQuery(product.title)
      setDropdownVisible(false)
      setResults([])
    }

    const handleAmountChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const raw = event.currentTarget.value
      const parsedValue: EditorLineItem['lineTotal'] =
        raw === '' ? undefined : sanitizeNumber(raw, 0)
      onUpdate(index, 'lineTotal', parsedValue)
    }

    return (
      <tr className="border-b border-[var(--studio-border)] last:border-b-0">
        <td className="px-3 py-4 align-top text-sm text-[var(--studio-muted)]">{index + 1}</td>
        <td className="relative px-3 py-3 align-top">
          <input
            type="text"
            value={query}
            placeholder="Search product or SKU…"
            onFocus={() => {
              if (results.length > 0) setDropdownVisible(true)
            }}
            onBlur={() => {
              setTimeout(() => setDropdownVisible(false), 150)
            }}
            onChange={(event) => setQuery(event.currentTarget.value)}
            className="w-full rounded-lg border border-[var(--studio-border-strong)] px-3 py-2 text-sm text-[var(--studio-text)] shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
          {loadingOptions ? (
            <div className="pointer-events-none absolute right-3 top-2.5 h-4 w-4 animate-spin rounded-full border-2 border-[var(--studio-border-strong)] border-t-slate-500" />
          ) : null}
          {dropdownVisible && results.length > 0 ? (
            <div className="absolute left-0 right-0 top-full z-20 mt-2 max-h-56 overflow-auto rounded-lg border border-[var(--studio-border)] bg-[var(--studio-surface-strong)] shadow-xl">
              {results.map((product) => (
                <button
                  key={product._id}
                  type="button"
                  className="flex w-full flex-col gap-1 px-3 py-2 text-left hover:bg-[var(--studio-surface-soft)]"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => handleProductSelect(product)}
                >
                  <span className="text-sm font-semibold text-[var(--studio-text)]">
                    {product.title}
                  </span>
                  <span className="text-xs text-[var(--studio-muted)]">
                    {product.sku ? `SKU: ${product.sku}` : 'No SKU'} · ${fmt(product.price)}
                  </span>
                  {product.shortPlain ? (
                    <span className="text-xs text-[var(--studio-muted)]">{product.shortPlain}</span>
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}
          {dropdownVisible &&
          !loadingOptions &&
          results.length === 0 &&
          query.trim().length >= 2 ? (
            <div className="absolute left-0 right-0 top-full z-20 mt-2 rounded-lg border border-[var(--studio-border)] bg-[var(--studio-surface-strong)] px-3 py-2 text-sm text-[var(--studio-muted)] shadow-xl">
              No products found.
            </div>
          ) : null}
        </td>
        <td className="px-3 py-3 align-top">
          <input
            type="text"
            value={item.sku || ''}
            onChange={(event) => onUpdate(index, 'sku', event.currentTarget.value)}
            className="w-full rounded-lg border border-[var(--studio-border-strong)] px-3 py-2 text-sm text-[var(--studio-text)] shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            placeholder="SKU"
          />
        </td>
        <td className="px-3 py-3 align-top">
          <textarea
            value={item.description || ''}
            onChange={(event) => onUpdate(index, 'description', event.currentTarget.value)}
            rows={2}
            className="h-full w-full rounded-lg border border-[var(--studio-border-strong)] px-3 py-2 text-sm text-[var(--studio-text)] shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            placeholder="Description"
          />
        </td>
        <td className="px-3 py-3 align-top">
          <input
            type="number"
            min={0}
            step="1"
            value={item.quantity ?? ''}
            onChange={(event) =>
              onUpdate(index, 'quantity', sanitizeNumber(event.currentTarget.value, 0))
            }
            className="w-full rounded-lg border border-[var(--studio-border-strong)] px-3 py-2 text-right text-sm text-[var(--studio-text)] shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            placeholder="Qty"
          />
        </td>
        <td className="px-3 py-3 align-top">
          <input
            type="number"
            step="0.01"
            value={item.unitPrice ?? ''}
            onChange={(event) =>
              onUpdate(index, 'unitPrice', sanitizeNumber(event.currentTarget.value, 0))
            }
            className="w-full rounded-lg border border-[var(--studio-border-strong)] px-3 py-2 text-right text-sm text-[var(--studio-text)] shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            placeholder="Rate"
          />
        </td>
        <td className="px-3 py-3 align-top">
          <input
            type="number"
            step="0.01"
            value={Number.isFinite(amount) ? amount : ''}
            onChange={handleAmountChange}
            className="w-full rounded-lg border border-[var(--studio-border-strong)] px-3 py-2 text-right text-sm text-[var(--studio-text)] shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            placeholder="Amount"
          />
          {taxRate > 0 ? (
            <p className="mt-2 text-xs text-[var(--studio-muted)]">
              Est. tax ({taxRate.toFixed(2)}%): ${fmt(estimatedTax)}
            </p>
          ) : null}
        </td>
        <td className="px-3 py-3 align-top text-right text-sm font-semibold text-[var(--studio-text)]">
          {taxRate > 0 ? `$${fmt(estimatedTax)}` : '—'}
        </td>
        <td className="px-3 py-3 align-top">
          <div className="flex flex-col items-stretch gap-2">
            <div className="flex overflow-hidden rounded-md border border-[var(--studio-border-strong)]">
              <button
                type="button"
                className={`flex-1 px-3 py-1 text-xs font-semibold transition ${
                  item.kind === 'product'
                    ? 'bg-slate-900 text-white'
                    : 'bg-[var(--studio-surface-strong)] text-[var(--studio-muted)] hover:bg-[var(--studio-surface-soft)]'
                }`}
                onClick={() => onKindChange(index, 'product')}
              >
                Product
              </button>
              <button
                type="button"
                className={`flex-1 px-3 py-1 text-xs font-semibold transition ${
                  item.kind === 'custom'
                    ? 'bg-slate-900 text-white'
                    : 'bg-[var(--studio-surface-strong)] text-[var(--studio-muted)] hover:bg-[var(--studio-surface-soft)]'
                }`}
                onClick={() => onKindChange(index, 'custom')}
              >
                Custom
              </button>
            </div>
            <button
              type="button"
              onClick={() => onRemove(index)}
              className="text-sm font-semibold text-rose-600 hover:text-rose-500"
            >
              Remove
            </button>
          </div>
        </td>
      </tr>
    )
  }

  if (!displayed) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--studio-surface-soft)] text-[var(--studio-muted)]">
        <p>No invoice data available.</p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto bg-[var(--studio-surface-soft)] p-6">
      <div className="mx-auto grid max-w-6xl gap-6">
        <div className="overflow-hidden rounded-xl bg-[var(--studio-surface-strong)] shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--studio-border)] bg-[var(--studio-surface-soft)] px-6 py-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--studio-muted)]">
                Invoice
              </p>
              <h1 className="text-2xl font-bold text-[var(--studio-text)]">
                {displayed.invoiceNumber || 'Untitled Invoice'}
              </h1>
              <p className="text-sm text-[var(--studio-muted)]">
                Status:{' '}
                <span className="font-medium text-[var(--studio-text)]">
                  {displayed.status || 'Pending'}
                </span>
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={resetChanges}
                disabled={!isDirty || isSaving}
                className="rounded-lg border border-[var(--studio-border-strong)] px-4 py-2 text-sm font-medium text-[var(--studio-text)] transition hover:bg-[var(--studio-surface-soft)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!isDirty || isSaving}
                className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-300"
              >
                {isSaving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>

          <div className="grid gap-6 border-b border-[var(--studio-border)] px-6 py-6 lg:grid-cols-2">
            <div className="grid gap-4">
              <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-[var(--studio-muted)]">
                Invoice Date
                <input
                  type="date"
                  value={state.invoiceDate}
                  onChange={(event) => updateState('invoiceDate', event.currentTarget.value)}
                  className="rounded-lg border border-[var(--studio-border-strong)] px-3 py-2 text-sm text-[var(--studio-text)] shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-[var(--studio-muted)]">
                Due Date
                <input
                  type="date"
                  value={state.dueDate}
                  onChange={(event) => updateState('dueDate', event.currentTarget.value)}
                  className="rounded-lg border border-[var(--studio-border-strong)] px-3 py-2 text-sm text-[var(--studio-text)] shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-[var(--studio-muted)]">
                Payment Terms
                <input
                  type="text"
                  value={state.paymentTerms}
                  onChange={(event) => updateState('paymentTerms', event.currentTarget.value)}
                  list="invoice-payment-terms"
                  className="rounded-lg border border-[var(--studio-border-strong)] px-3 py-2 text-sm text-[var(--studio-text)] shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  placeholder="Due on receipt"
                />
                <datalist id="invoice-payment-terms">
                  {paymentTermSuggestions.map((term) => (
                    <option key={term} value={term} />
                  ))}
                </datalist>
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-[var(--studio-muted)]">
                Service Rendered By
                <input
                  type="text"
                  value={state.serviceRenderedBy}
                  onChange={(event) => updateState('serviceRenderedBy', event.currentTarget.value)}
                  className="rounded-lg border border-[var(--studio-border-strong)] px-3 py-2 text-sm text-[var(--studio-text)] shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  placeholder="Technician name"
                />
              </label>
            </div>
            <div>
              <dl className="space-y-2 text-sm text-[var(--studio-muted)]">
                <div className="flex justify-between">
                  <dt>Subtotal</dt>
                  <dd className="font-medium text-[var(--studio-text)]">
                    ${totals.subtotal.toFixed(2)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt>
                    Discount
                    {state.discountType === 'percent'
                      ? ` (${sanitizeNumber(state.discountValue, 0).toFixed(2)}%)`
                      : ''}
                  </dt>
                  <dd className="font-medium text-[var(--studio-text)]">
                    -${totals.discount.toFixed(2)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt>Taxable Subtotal</dt>
                  <dd className="font-medium text-[var(--studio-text)]">
                    ${totals.taxableBase.toFixed(2)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt>Shipping</dt>
                  <dd className="font-medium text-[var(--studio-text)]">
                    ${totals.shipping.toFixed(2)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt>Tax ({sanitizeNumber(state.taxRate, 0).toFixed(2)}%)</dt>
                  <dd className="font-medium text-[var(--studio-text)]">
                    ${totals.tax.toFixed(2)}
                  </dd>
                </div>
                <div className="flex justify-between border-t border-[var(--studio-border)] pt-2 text-base font-semibold text-[var(--studio-text)]">
                  <dt>Total</dt>
                  <dd>${totals.total.toFixed(2)}</dd>
                </div>
                <div className="flex justify-between text-base font-semibold text-[var(--studio-text)]">
                  <dt>Deposit</dt>
                  <dd>-${depositValue.toFixed(2)}</dd>
                </div>
                <div className="flex justify-between text-lg font-bold text-emerald-600">
                  <dt>Balance Due</dt>
                  <dd>${totals.balanceDue.toFixed(2)}</dd>
                </div>
              </dl>
            </div>
          </div>

          <div className="grid gap-4 px-6 pb-6 lg:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-[var(--studio-muted)]">
              Discount Type
              <select
                value={state.discountType}
                onChange={(event) =>
                  updateState('discountType', event.currentTarget.value as 'amount' | 'percent')
                }
                className="rounded-lg border border-[var(--studio-border-strong)] px-3 py-2 text-sm text-[var(--studio-text)] shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              >
                <option value="amount">Amount ($)</option>
                <option value="percent">Percent (%)</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-[var(--studio-muted)]">
              Discount Value
              <input
                type="number"
                step="0.01"
                value={state.discountValue}
                onChange={(event) =>
                  updateState('discountValue', sanitizeNumber(event.currentTarget.value, 0))
                }
                className="rounded-lg border border-[var(--studio-border-strong)] px-3 py-2 text-sm text-[var(--studio-text)] shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-[var(--studio-muted)]">
              Tax Rate (%)
              <input
                type="number"
                step="0.01"
                value={state.taxRate}
                onChange={(event) =>
                  updateState('taxRate', sanitizeNumber(event.currentTarget.value, 0))
                }
                className="rounded-lg border border-[var(--studio-border-strong)] px-3 py-2 text-sm text-[var(--studio-text)] shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-[var(--studio-muted)]">
              Deposit Received
              <input
                type="number"
                step="0.01"
                value={state.depositAmount}
                onChange={(event) =>
                  updateState('depositAmount', sanitizeNumber(event.currentTarget.value, 0))
                }
                className="rounded-lg border border-[var(--studio-border-strong)] px-3 py-2 text-sm text-[var(--studio-text)] shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                placeholder="0.00"
              />
            </label>
            <label className="lg:col-span-2 flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-[var(--studio-muted)]">
              Payment Instructions
              <textarea
                value={state.paymentInstructions}
                onChange={(event) => updateState('paymentInstructions', event.currentTarget.value)}
                rows={3}
                className="rounded-lg border border-[var(--studio-border-strong)] px-3 py-2 text-sm text-[var(--studio-text)] shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                placeholder="Tell your customer how to pay (e.g., card, bank, Venmo)."
              />
            </label>
          </div>
        </div>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl bg-[var(--studio-surface-strong)] p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[var(--studio-text)]">Bill To</h2>
              <button
                type="button"
                className="text-sm font-semibold text-blue-600 hover:text-blue-500"
                onClick={copyBillToToShipTo}
              >
                Copy to Ship To
              </button>
            </div>
            <div className="mt-4 grid gap-3 text-sm text-[var(--studio-text)]">
              {(
                [
                  ['name', 'Full Name'],
                  ['email', 'Email'],
                  ['phone', 'Phone'],
                  ['address_line1', 'Address Line 1'],
                  ['address_line2', 'Address Line 2'],
                  ['city_locality', 'City'],
                  ['state_province', 'State / Province'],
                  ['postal_code', 'Postal Code'],
                  ['country_code', 'Country'],
                ] as Array<[keyof InvoiceAddress, string]>
              ).map(([field, label]) => (
                <label key={field} className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium uppercase tracking-wide text-[var(--studio-muted)]">
                    {label}
                  </span>
                  <input
                    type="text"
                    value={state.billTo[field] || ''}
                    onChange={(event) => updateAddress('billTo', field, event.currentTarget.value)}
                    className="rounded-lg border border-[var(--studio-border-strong)] px-3 py-2 text-sm text-[var(--studio-text)] shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="rounded-xl bg-[var(--studio-surface-strong)] p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-[var(--studio-text)]">Ship To</h2>
            <div className="mt-4 grid gap-3 text-sm text-[var(--studio-text)]">
              {(
                [
                  ['name', 'Full Name'],
                  ['email', 'Email'],
                  ['phone', 'Phone'],
                  ['address_line1', 'Address Line 1'],
                  ['address_line2', 'Address Line 2'],
                  ['city_locality', 'City'],
                  ['state_province', 'State / Province'],
                  ['postal_code', 'Postal Code'],
                  ['country_code', 'Country'],
                ] as Array<[keyof InvoiceAddress, string]>
              ).map(([field, label]) => (
                <label key={field} className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium uppercase tracking-wide text-[var(--studio-muted)]">
                    {label}
                  </span>
                  <input
                    type="text"
                    value={state.shipTo[field] || ''}
                    onChange={(event) => updateAddress('shipTo', field, event.currentTarget.value)}
                    className="rounded-lg border border-[var(--studio-border-strong)] px-3 py-2 text-sm text-[var(--studio-text)] shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </label>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl bg-[var(--studio-surface-strong)] p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-[var(--studio-text)]">
              Shipping Charge & Tracking
            </h2>
            <div className="mt-4 grid gap-4">
              <label className="flex flex-col gap-2 text-sm font-medium text-[var(--studio-text)]">
                Shipping Amount (USD)
                <input
                  type="number"
                  step="0.01"
                  value={state.amountShipping}
                  onChange={(event) =>
                    updateState('amountShipping', sanitizeNumber(event.currentTarget.value, 0))
                  }
                  className="rounded-lg border border-[var(--studio-border-strong)] px-3 py-2 text-sm text-[var(--studio-text)] shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  placeholder="0.00"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium text-[var(--studio-text)]">
                Carrier
                <input
                  type="text"
                  value={state.shippingCarrier}
                  onChange={(event) => updateState('shippingCarrier', event.currentTarget.value)}
                  className="rounded-lg border border-[var(--studio-border-strong)] px-3 py-2 text-sm text-[var(--studio-text)] shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  placeholder="UPS, USPS, FedEx…"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium text-[var(--studio-text)]">
                Tracking Number
                <input
                  type="text"
                  value={state.trackingNumber}
                  onChange={(event) => updateState('trackingNumber', event.currentTarget.value)}
                  className="rounded-lg border border-[var(--studio-border-strong)] px-3 py-2 text-sm text-[var(--studio-text)] shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  placeholder="1Z…"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium text-[var(--studio-text)]">
                Tracking URL
                <input
                  type="url"
                  value={state.trackingUrl}
                  onChange={(event) => updateState('trackingUrl', event.currentTarget.value)}
                  className="rounded-lg border border-[var(--studio-border-strong)] px-3 py-2 text-sm text-[var(--studio-text)] shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  placeholder="https://tracking.example.com/…"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium text-[var(--studio-text)]">
                Shipping Label URL
                <input
                  type="url"
                  value={state.shippingLabelUrl}
                  onChange={(event) => updateState('shippingLabelUrl', event.currentTarget.value)}
                  className="rounded-lg border border-[var(--studio-border-strong)] px-3 py-2 text-sm text-[var(--studio-text)] shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  placeholder="https://label.example.com/…"
                />
              </label>
            </div>
          </div>

          <div className="rounded-xl bg-[var(--studio-surface-strong)] p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-[var(--studio-text)]">Package Details</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-2 text-sm font-medium text-[var(--studio-text)] sm:col-span-1">
                Weight
                <input
                  type="number"
                  step="0.01"
                  value={state.weight?.value ?? 0}
                  onChange={(event) => updateWeightValue(event.currentTarget.value)}
                  className="rounded-lg border border-[var(--studio-border-strong)] px-3 py-2 text-sm text-[var(--studio-text)] shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  placeholder="5"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium text-[var(--studio-text)] sm:col-span-1">
                Unit
                <select
                  value={state.weight?.unit || 'pound'}
                  onChange={(event) => updateWeightUnit(event.currentTarget.value)}
                  className="rounded-lg border border-[var(--studio-border-strong)] px-3 py-2 text-sm text-[var(--studio-text)] shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                >
                  <option value="pound">Pounds</option>
                  <option value="ounce">Ounces</option>
                  <option value="kilogram">Kilograms</option>
                  <option value="gram">Grams</option>
                </select>
              </label>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              {(
                [
                  ['length', 'Length (in)'],
                  ['width', 'Width (in)'],
                  ['height', 'Height (in)'],
                ] as Array<[keyof PackageDimensions, string]>
              ).map(([field, label]) => (
                <label
                  key={field}
                  className="flex flex-col gap-2 text-sm font-medium text-[var(--studio-text)]"
                >
                  {label}
                  <input
                    type="number"
                    step="0.01"
                    value={(state.dimensions?.[field] as number | undefined) ?? 0}
                    onChange={(event) => updateDimension(field, event.currentTarget.value)}
                    className="rounded-lg border border-[var(--studio-border-strong)] px-3 py-2 text-sm text-[var(--studio-text)] shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    placeholder="0"
                  />
                </label>
              ))}
            </div>

            <div className="mt-6 rounded-lg border border-[var(--studio-border)] bg-[var(--studio-surface-soft)] p-4 text-sm text-[var(--studio-text)]">
              <h3 className="text-sm font-semibold text-[var(--studio-text)]">Shipping Details</h3>
              {state.fulfillmentDetails || state.amountShipping ? (
                <dl className="mt-3 space-y-1.5">
                  <div className="flex justify-between gap-4">
                    <dt>Service</dt>
                    <dd className="font-medium text-[var(--studio-text)]">
                      {state.fulfillmentDetails?.service || '—'}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt>Carrier</dt>
                    <dd className="font-medium text-[var(--studio-text)]">
                      {state.fulfillmentDetails?.carrier || '—'}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt>Amount</dt>
                    <dd className="font-medium text-[var(--studio-text)]">
                      {typeof state.amountShipping === 'number' && state.amountShipping > 0
                        ? `$${fmt(state.amountShipping)}`
                        : '—'}
                    </dd>
                  </div>
                  {typeof state.fulfillmentDetails?.deliveryDays === 'number' ? (
                    <div className="flex justify-between gap-4">
                      <dt>Est. Days</dt>
                      <dd className="font-medium text-[var(--studio-text)]">
                        {state.fulfillmentDetails.deliveryDays}
                      </dd>
                    </div>
                  ) : null}
                  {state.fulfillmentDetails?.estimatedDeliveryDate ? (
                    <div className="flex justify-between gap-4">
                      <dt>Est. Delivery</dt>
                      <dd className="font-medium text-[var(--studio-text)]">
                        {formatDate(state.fulfillmentDetails.estimatedDeliveryDate)}
                      </dd>
                    </div>
                  ) : null}
                </dl>
              ) : (
                <p className="text-sm text-[var(--studio-muted)]">
                  Shipping rate details appear once a rate is selected or a label is generated.
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-xl bg-[var(--studio-surface-strong)] p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-[var(--studio-text)]">Shipping History</h2>
          {state.shippingLog.length > 0 ? (
            <ul className="mt-4 space-y-3">
              {state.shippingLog.map((entry, index) => (
                <li
                  key={entry._key || `${entry.status || 'event'}-${index}`}
                  className="rounded-lg border border-[var(--studio-border)] bg-[var(--studio-surface-strong)] p-4 text-sm text-[var(--studio-text)] shadow-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--studio-muted)]">
                    <span>{trimString(entry.status) || 'Update'}</span>
                    <span>{formatDateTime(entry.createdAt)}</span>
                  </div>
                  {trimString(entry.message) ? (
                    <p className="mt-2 text-sm text-[var(--studio-text)]">{entry.message}</p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-4 text-xs text-[var(--studio-muted)]">
                    {trimString(entry.trackingNumber) ? (
                      <span>
                        Tracking:{' '}
                        <span className="font-medium text-[var(--studio-text)]">
                          {entry.trackingNumber}
                        </span>
                      </span>
                    ) : null}
                    {typeof entry.weight === 'number' && Number.isFinite(entry.weight) ? (
                      <span>Weight: {entry.weight} lb</span>
                    ) : null}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs font-semibold">
                    {trimString(entry.trackingUrl) ? (
                      <a
                        href={entry.trackingUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 hover:text-blue-500"
                      >
                        Tracking Link
                      </a>
                    ) : null}
                    {trimString(entry.labelUrl) ? (
                      <a
                        href={entry.labelUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 hover:text-blue-500"
                      >
                        Label PDF
                      </a>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-[var(--studio-muted)]">
              No shipping events recorded yet.
            </p>
          )}
        </section>

        <section className="rounded-xl bg-[var(--studio-surface-strong)] p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[var(--studio-text)]">
                Products & Services
              </h2>
              <p className="text-sm text-[var(--studio-muted)]">
                Add each line exactly as it should appear on the printed invoice.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={addLineItem}
                className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-700"
              >
                Add product or service
              </button>
              <button
                type="button"
                onClick={clearLineItems}
                disabled={state.lineItems.length === 0}
                className="inline-flex items-center justify-center rounded-lg border border-[var(--studio-border-strong)] px-4 py-2 text-sm font-semibold text-[var(--studio-text)] transition hover:bg-[var(--studio-surface-soft)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Clear all lines
              </button>
            </div>
          </div>

          <div className="mt-6 overflow-hidden rounded-xl border border-[var(--studio-border)]">
            <table className="min-w-full table-fixed">
              <thead className="bg-[var(--studio-surface-soft)] text-[11px] font-semibold uppercase tracking-wide text-[var(--studio-muted)]">
                <tr>
                  <th className="w-12 px-3 py-2 text-left">#</th>
                  <th className="w-64 px-3 py-2 text-left">Product / Service</th>
                  <th className="w-40 px-3 py-2 text-left">SKU</th>
                  <th className="px-3 py-2 text-left">Description</th>
                  <th className="w-28 px-3 py-2 text-right">Qty</th>
                  <th className="w-32 px-3 py-2 text-right">Rate</th>
                  <th className="w-32 px-3 py-2 text-right">Amount</th>
                  <th className="w-24 px-3 py-2 text-right">Tax</th>
                  <th className="w-40 px-3 py-2 text-right">Type</th>
                </tr>
              </thead>
              <tbody className="bg-[var(--studio-surface-strong)]">
                {state.lineItems.length === 0 ? (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-6 py-10 text-center text-sm text-[var(--studio-muted)]"
                    >
                      No line items yet. Click “Add product or service” to get started.
                    </td>
                  </tr>
                ) : (
                  state.lineItems.map((item, index) => (
                    <LineItemRow
                      key={item._key || index}
                      item={item}
                      index={index}
                      taxRate={taxRateValue}
                      onUpdate={updateLineItem}
                      onRemove={removeLineItem}
                      onKindChange={setLineItemKind}
                      onProductPick={applyProductSelection}
                      client={client}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl bg-[var(--studio-surface-strong)] p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-[var(--studio-text)]">Customer Notes</h2>
            <textarea
              value={state.customerNotes}
              onChange={(event) => updateState('customerNotes', event.currentTarget.value)}
              rows={6}
              placeholder="Visible to the customer on the invoice."
              className="mt-4 w-full rounded-lg border border-[var(--studio-border-strong)] px-3 py-2 text-sm text-[var(--studio-text)] shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>

          <div className="rounded-xl bg-[var(--studio-surface-strong)] p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-[var(--studio-text)]">Internal Notes</h2>
            <textarea
              value={state.internalNotes}
              onChange={(event) => updateState('internalNotes', event.currentTarget.value)}
              rows={6}
              placeholder="Private notes for your team."
              className="mt-4 w-full rounded-lg border border-[var(--studio-border-strong)] px-3 py-2 text-sm text-[var(--studio-text)] shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
        </section>
      </div>
    </div>
  )
}

export default InvoiceVisualEditor
