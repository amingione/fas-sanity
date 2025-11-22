import {useCallback, useEffect, useRef, useState} from 'react'
import type {ChangeEvent} from 'react'
import {
  Box,
  Button,
  Card,
  Flex,
  Grid,
  Heading,
  Spinner,
  Stack,
  Text,
  TextArea,
  TextInput,
  Select,
  useToast,
} from '@sanity/ui'
import {useClient} from 'sanity'
import type {DocumentActionComponent} from 'sanity'
import {useRouter} from 'sanity/router'
import {generateReferenceCode} from '../../../../../shared/referenceCodes'
import {consumeInventoryForItems} from '../../../../../shared/inventory'

const API_VERSION = '2024-10-01'
const DEFAULT_LABOR_RATE = 150
const BAY_OPTIONS = [
  {label: 'Assign later', value: ''},
  {label: 'Bay 1', value: 'bay1'},
  {label: 'Bay 2', value: 'bay2'},
  {label: 'Bay 3', value: 'bay3'},
  {label: 'Bay 4', value: 'bay4'},
]

const asReference = (id?: string | null) => (id ? {_type: 'reference', _ref: id} : undefined)
const uniqueKey = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)

const formatCustomerName = (customer?: CustomerInfo) => {
  if (!customer) return 'Customer'
  const label = [customer.firstName, customer.lastName].filter(Boolean).join(' ')
  return label || customer.name || 'Customer'
}

const buildBillToPayload = (customer?: CustomerInfo) => {
  if (!customer) return undefined
  const primaryAddress = customer.addresses?.[0]
  return {
    name: formatCustomerName(customer),
    email: customer.email,
    phone: customer.phone,
    address_line1: primaryAddress?.street,
    address_line2: undefined,
    city_locality: primaryAddress?.city,
    state_province: primaryAddress?.state,
    postal_code: primaryAddress?.zip,
    country_code: primaryAddress?.country || 'US',
  }
}

const calculateHoursFromRange = (start?: string, end?: string) => {
  if (!start || !end) return 0
  const startDate = new Date(start)
  const endDate = new Date(end)
  if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime())) return 0
  const diff = Math.max(0, endDate.getTime() - startDate.getTime())
  return Number((diff / 3_600_000).toFixed(2))
}

type CustomerInfo = {
  _id: string
  firstName?: string
  lastName?: string
  name?: string
  email?: string
  phone?: string
  vehicles?: string[]
  addresses?: Array<{_key: string; street?: string; city?: string; state?: string; zip?: string; country?: string}>
}

type VehicleInfo = {
  _id?: string
  year?: number
  make?: string
  model?: string
  serviceHistoryIds?: string[]
}

type ServiceInfo = {
  _id?: string
  title?: string
  basePrice?: number
  estimatedHours?: number
}

type AppointmentDetails = {
  _id: string
  appointmentNumber?: string
  bay?: string
  customer?: CustomerInfo
  vehicle?: VehicleInfo
  service?: ServiceInfo
}

type WorkOrderDetails = {
  _id: string
  workOrderNumber?: string
  status?: string
  bay?: string
  startedAt?: string
  completedAt?: string
  laborHours?: number
  laborRate?: number
  technicianNotes?: string
  customerNotes?: string
  invoice?: {_ref: string}
  appointment?: {_id: string; appointmentNumber?: string; scheduledDate?: string}
  customer?: CustomerInfo
  vehicle?: VehicleInfo
  service?: ServiceInfo
  partsUsed?: Array<{
    _key: string
    quantity?: number
    price?: number
    part?: {_id: string; title?: string; sku?: string; price?: number}
  }>
  additionalCharges?: Array<{_key: string; description?: string; amount?: number}>
}

type ProductOption = {
  _id: string
  title?: string
  sku?: string
  price?: number
}

const ensureVehicleRelationships = async (options: {
  client: ReturnType<typeof useClient>
  customerId?: string
  vehicleId?: string
  workOrderId: string
  customerVehicleIds?: string[]
  vehicleHistoryIds?: string[]
}) => {
  const {client, customerId, vehicleId, workOrderId, customerVehicleIds, vehicleHistoryIds} = options
  const ops: Promise<unknown>[] = []
  if (vehicleId && !vehicleHistoryIds?.includes(workOrderId)) {
    ops.push(
      client
        .patch(vehicleId)
        .setIfMissing({serviceHistory: []})
        .append('serviceHistory', [asReference(workOrderId)])
        .commit({autoGenerateArrayKeys: true})
        .catch(() => undefined),
    )
  }
  if (customerId && vehicleId && !customerVehicleIds?.includes(vehicleId)) {
    ops.push(
      client
        .patch(customerId)
        .setIfMissing({vehicles: []})
        .append('vehicles', [asReference(vehicleId)])
        .commit({autoGenerateArrayKeys: true})
        .catch(() => undefined),
    )
  }
  if (ops.length) {
    await Promise.all(ops)
  }
}

export const startWorkOrderAction: DocumentActionComponent = (props) => {
  const doc = (props.draft || props.published) as AppointmentDetails | null
  const toast = useToast()
  const client = useClient({apiVersion: API_VERSION})
  const router = useRouter()
  const [isOpen, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [baySelection, setBaySelection] = useState(doc?.bay || '')

  if (!doc) return null

  if ((doc as any)?.workOrder?._ref) {
    const workOrderRef = (doc as any).workOrder._ref
    return {
      label: 'Open Work Order',
      tone: 'primary',
      onHandle: () => router.navigateIntent('edit', {id: workOrderRef, type: 'workOrder'}),
    }
  }

  if ((doc as any)?.status === 'completed' || (doc as any)?.status === 'cancelled') {
    return null
  }

  const handleStart = async () => {
    setBusy(true)
    try {
      const baseId = props.id.replace(/^drafts\./, '')
      const appointment = await client.fetch<AppointmentDetails & {
        customer?: CustomerInfo & {vehicles?: string[]}
        vehicle?: VehicleInfo
        service?: ServiceInfo
      }>(
        `*[_id == $id][0]{
          _id,
          appointmentNumber,
          bay,
          customer->{
            _id,
            firstName,
            lastName,
            name,
            email,
            phone,
            "vehicles": vehicles[]->_ref
          },
          vehicle->{
            _id,
            year,
            make,
            model,
            "serviceHistoryIds": serviceHistory[]->_ref
          },
          service->{_id, title, basePrice, estimatedHours}
        }`,
        {id: baseId},
      )

      if (!appointment?.customer?._id || !appointment?.service?._id) {
        toast.push({status: 'warning', title: 'Customer and service are required before starting work'})
        setBusy(false)
        return
      }

      const workOrderNumber = await generateReferenceCode(client, {
        prefix: 'WO-',
        typeName: 'workOrder',
        fieldName: 'workOrderNumber',
      })
      const startedAt = new Date().toISOString()
      const payload: Record<string, any> = {
        _type: 'workOrder',
        workOrderNumber,
        status: 'in_progress',
        startedAt,
        bay: baySelection || appointment.bay || undefined,
        customer: asReference(appointment.customer._id),
        appointment: asReference(baseId),
        service: asReference(appointment.service._id),
        laborRate: appointment.service.basePrice ?? DEFAULT_LABOR_RATE,
        laborHours: appointment.service.estimatedHours ?? 0,
      }
      if (appointment.vehicle?._id) {
        payload.vehicle = asReference(appointment.vehicle._id)
      }
      const created = await client.create(payload, {autoGenerateArrayKeys: true})

      const patchOps: Record<string, any> = {
        status: 'in_progress',
        workOrder: asReference(created._id),
        bay: baySelection || appointment.bay || undefined,
      }

      const tx = client.transaction()
      if (props.published) tx.patch(baseId, (patch) => patch.set(patchOps))
      if (props.draft) tx.patch(`drafts.${baseId}`, (patch) => patch.set(patchOps))
      await tx.commit({autoGenerateArrayKeys: true})

      await ensureVehicleRelationships({
        client,
        customerId: appointment.customer._id,
        vehicleId: appointment.vehicle?._id,
        workOrderId: created._id,
        customerVehicleIds: appointment.customer.vehicles,
        vehicleHistoryIds: appointment.vehicle?.serviceHistoryIds,
      })

      toast.push({status: 'success', title: 'Work order started'})
      setOpen(false)
      props.onComplete()
      router.navigateIntent('edit', {id: created._id, type: 'workOrder'})
    } catch (error: any) {
      console.error('start work order failed', error)
      toast.push({status: 'error', title: 'Unable to start work order', description: error?.message || 'Unknown error'})
    } finally {
      setBusy(false)
    }
  }

  return {
    label: 'Start Work',
    tone: 'primary',
    disabled: (doc as any)?.status === 'cancelled',
    onHandle: () => setOpen(true),
    dialog: isOpen
      ? {
          type: 'dialog',
          header: `Start work on ${doc.appointmentNumber || 'appointment'}`,
          onClose: () => {
            setOpen(false)
            props.onComplete()
          },
          content: (
            <Box padding={4}>
              <Stack space={4}>
                <Text>Select a service bay and confirm to generate the linked work order.</Text>
                <Stack space={2}>
                  <Text size={1} muted>
                    Bay
                  </Text>
                  <Select value={baySelection} onChange={(event) => setBaySelection(event.currentTarget.value)}>
                    {BAY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </Stack>
                <Flex justify="flex-end" gap={3}>
                  <Button text="Cancel" mode="ghost" disabled={busy} onClick={() => setOpen(false)} />
                  <Button text="Start Work" tone="primary" loading={busy} disabled={busy} onClick={handleStart} />
                </Flex>
              </Stack>
            </Box>
          ),
        }
      : undefined,
  }
}

export const manageWorkOrderAction: DocumentActionComponent = (props) => {
  const doc = (props.draft || props.published) as WorkOrderDetails | null
  const toast = useToast()
  const client = useClient({apiVersion: API_VERSION})
  const router = useRouter()
  const [isOpen, setOpen] = useState(false)
  const [detail, setDetail] = useState<WorkOrderDetails | null>(null)
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [searching, setSearching] = useState(false)
  const [productResults, setProductResults] = useState<ProductOption[]>([])
  const [selectedProduct, setSelectedProduct] = useState('')
  const [partQuantity, setPartQuantity] = useState('1')
  const [partPrice, setPartPrice] = useState('')
  const [chargeLabel, setChargeLabel] = useState('')
  const [chargeAmount, setChargeAmount] = useState('')
  const [laborHoursInput, setLaborHoursInput] = useState('')
  const [laborRateInput, setLaborRateInput] = useState('')
  const [notesValue, setNotesValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [completing, setCompleting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const docId = props.id?.replace(/^drafts\./, '') ?? ''

  const loadDetail = useCallback(async () => {
    if (!docId) return
    setLoading(true)
    try {
      const result = await client.fetch<WorkOrderDetails>(
        `*[_id == $id][0]{
          _id,
          workOrderNumber,
          status,
          bay,
          startedAt,
          completedAt,
          laborHours,
          laborRate,
          technicianNotes,
          customerNotes,
          invoice,
          appointment->{_id, appointmentNumber, scheduledDate},
          customer->{
            _id,
            firstName,
            lastName,
            name,
            email,
            phone,
            "vehicles": vehicles[]->_ref,
            addresses[]{_key, street, city, state, zip, country}
          },
          vehicle->{
            _id,
            year,
            make,
            model,
            "serviceHistoryIds": serviceHistory[]->_ref
          },
          service->{_id, title, basePrice, estimatedHours},
          partsUsed[]{
            _key,
            quantity,
            price,
            part->{_id, title, sku, price}
          },
          additionalCharges[]{_key, description, amount}
        }`,
        {id: docId},
      )
      setDetail(result)
      setLaborHoursInput(result?.laborHours ? String(result.laborHours) : '')
      setLaborRateInput(result?.laborRate ? String(result.laborRate) : '')
      setNotesValue(result?.technicianNotes || '')
    } catch (error) {
      console.error('load work order detail failed', error)
      toast.push({status: 'error', title: 'Unable to load work order details'})
    } finally {
      setLoading(false)
    }
  }, [client, docId ?? null, toast])

  useEffect(() => {
    if (!isOpen || !doc) return
    loadDetail()
  }, [isOpen, doc?._id ?? null, loadDetail])

  if (!doc) return null

  const resetDialogState = () => {
    setSearchTerm('')
    setProductResults([])
    setSelectedProduct('')
    setPartQuantity('1')
    setPartPrice('')
    setChargeLabel('')
    setChargeAmount('')
    setSaving(false)
    setCompleting(false)
  }

  const closeDialog = () => {
    setOpen(false)
    resetDialogState()
    props.onComplete()
  }

  const handleSearchProducts = async () => {
    const term = searchTerm.trim()
    if (term.length < 2) {
      toast.push({status: 'warning', title: 'Enter at least two characters to search products'})
      return
    }
    setSearching(true)
    try {
      const matches = await client.fetch<ProductOption[]>(
        `*[_type == "product" && (title match $term || sku match $term)][0...20]{
          _id,
          title,
          sku,
          price
        }`,
        {term: `${term}*`},
      )
      setProductResults(matches)
      if (matches.length === 1) {
        setSelectedProduct(matches[0]._id)
        setPartPrice(matches[0].price ? String(matches[0].price) : '')
      }
    } finally {
      setSearching(false)
    }
  }

  const handleAddPart = async () => {
    if (!selectedProduct) {
      toast.push({status: 'warning', title: 'Select a product to add'})
      return
    }
    const quantity = Math.max(1, Number(partQuantity) || 1)
    const unitPrice = Number(partPrice) || 0
    setSaving(true)
    try {
      await client
        .patch(docId)
        .setIfMissing({partsUsed: []})
        .append('partsUsed', [
          {
            _key: uniqueKey(),
            part: asReference(selectedProduct),
            quantity,
            price: unitPrice * quantity,
          },
        ])
        .commit({autoGenerateArrayKeys: true})
      await loadDetail()
      setSelectedProduct('')
      setPartQuantity('1')
      setPartPrice('')
    } catch (error) {
      console.error('add part failed', error)
      toast.push({status: 'error', title: 'Unable to add part'})
    } finally {
      setSaving(false)
    }
  }

  const handleRemovePart = async (key: string) => {
    try {
      await client.patch(docId).unset([`partsUsed[_key == "${key}"]`]).commit({autoGenerateArrayKeys: true})
      await loadDetail()
    } catch (error) {
      console.error('remove part failed', error)
      toast.push({status: 'error', title: 'Unable to remove part'})
    }
  }

  const handleAddCharge = async () => {
    if (!chargeLabel || !chargeAmount) {
      toast.push({status: 'warning', title: 'Description and amount required'})
      return
    }
    setSaving(true)
    try {
      await client
        .patch(docId)
        .setIfMissing({additionalCharges: []})
        .append('additionalCharges', [
          {
            _key: uniqueKey(),
            description: chargeLabel,
            amount: Number(chargeAmount) || 0,
          },
        ])
        .commit({autoGenerateArrayKeys: true})
      await loadDetail()
      setChargeLabel('')
      setChargeAmount('')
    } catch (error) {
      console.error('add charge failed', error)
      toast.push({status: 'error', title: 'Unable to add charge'})
    } finally {
      setSaving(false)
    }
  }

  const handleRemoveCharge = async (key: string) => {
    try {
      await client
        .patch(docId)
        .unset([`additionalCharges[_key == "${key}"]`])
        .commit({autoGenerateArrayKeys: true})
      await loadDetail()
    } catch (error) {
      console.error('remove charge failed', error)
      toast.push({status: 'error', title: 'Unable to remove charge'})
    }
  }

  const handleUploadPhotos = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.currentTarget.files
    if (!files || !files.length) return
    setSaving(true)
    try {
      for (const file of Array.from(files)) {
        const asset = await client.assets.upload('image', file)
        await client
          .patch(docId)
          .setIfMissing({photos: []})
          .append('photos', [
            {
              _key: uniqueKey(),
              _type: 'image',
              asset: asReference(asset._id),
            },
          ])
          .commit({autoGenerateArrayKeys: true})
      }
      await loadDetail()
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (error) {
      console.error('upload photos failed', error)
      toast.push({status: 'error', title: 'Unable to upload photos'})
    } finally {
      setSaving(false)
    }
  }

  const handleSaveLabor = async () => {
    setSaving(true)
    try {
      await client
        .patch(docId)
        .set({
          laborHours: laborHoursInput ? Number(laborHoursInput) : null,
          laborRate: laborRateInput ? Number(laborRateInput) : null,
        })
        .commit({autoGenerateArrayKeys: true})
      await loadDetail()
    } catch (error) {
      console.error('save labor failed', error)
      toast.push({status: 'error', title: 'Unable to update labor'})
    } finally {
      setSaving(false)
    }
  }

  const handleSaveNotes = async () => {
    setSaving(true)
    try {
      await client.patch(docId).set({technicianNotes: notesValue || null}).commit({autoGenerateArrayKeys: true})
      toast.push({status: 'success', title: 'Technician notes updated'})
    } catch (error) {
      console.error('save notes failed', error)
      toast.push({status: 'error', title: 'Unable to save notes'})
    } finally {
      setSaving(false)
    }
  }

  const handleTimerStart = async () => {
    try {
      await client
        .patch(docId)
        .set({startedAt: new Date().toISOString(), status: 'in_progress'})
        .commit({autoGenerateArrayKeys: true})
      await loadDetail()
    } catch (error) {
      console.error('start timer failed', error)
      toast.push({status: 'error', title: 'Unable to start timer'})
    }
  }

  const handleTimerStop = async () => {
    if (!detail?.startedAt) return
    try {
      const hours = calculateHoursFromRange(detail.startedAt, new Date().toISOString())
      await client
        .patch(docId)
        .set({laborHours: hours})
        .commit({autoGenerateArrayKeys: true})
      await loadDetail()
    } catch (error) {
      console.error('stop timer failed', error)
      toast.push({status: 'error', title: 'Unable to stop timer'})
    }
  }

  const handleComplete = async () => {
    if (!detail?.customer?._id) {
      toast.push({status: 'warning', title: 'Customer information required before invoicing'})
      return
    }
    setCompleting(true)
    try {
      const invoiceNumber = await generateReferenceCode(client, {
        prefix: 'INV-',
        typeName: 'invoice',
        fieldName: 'invoiceNumber',
      })
      const lineItems: any[] = []
      const laborQty = Number(laborHoursInput || detail.laborHours || 0)
      const laborRate = Number(laborRateInput || detail.laborRate || DEFAULT_LABOR_RATE)
      if (laborQty > 0) {
        lineItems.push({
          _key: uniqueKey(),
          _type: 'invoiceLineItem',
          kind: 'custom',
          description: detail?.service?.title ? `${detail.service.title} Labor` : 'Labor',
          quantity: laborQty,
          unitPrice: laborRate,
        })
      } else if (detail?.service?.basePrice) {
        lineItems.push({
          _key: uniqueKey(),
          _type: 'invoiceLineItem',
          kind: 'custom',
          description: detail.service.title || 'Service',
          quantity: 1,
          unitPrice: detail.service.basePrice,
        })
      }

      detail?.partsUsed?.forEach((part) => {
        if (!part.part?._id) return
        const qty = Math.max(1, Number(part.quantity) || 1)
        const linePrice = Number(part.price) || 0
        const unit = qty ? Number((linePrice / qty).toFixed(2)) : linePrice
        lineItems.push({
          _key: part._key || uniqueKey(),
          _type: 'invoiceLineItem',
          kind: 'product',
          product: asReference(part.part._id),
          description: part.part.title,
          sku: part.part.sku,
          quantity: qty,
          unitPrice: unit,
        })
      })

      detail?.additionalCharges?.forEach((charge) => {
        if (!charge.description) return
        lineItems.push({
          _key: charge._key || uniqueKey(),
          _type: 'invoiceLineItem',
          kind: 'custom',
          description: charge.description,
          quantity: 1,
          unitPrice: Number(charge.amount) || 0,
        })
      })

      if (lineItems.length === 0) {
        throw new Error('Add labor, parts, or charges before generating an invoice')
      }

      const invoicePayload: Record<string, any> = {
        _type: 'invoice',
        invoiceNumber,
        title: `Work Order ${detail.workOrderNumber || ''}`.trim(),
        status: 'pending',
        invoiceDate: new Date().toISOString().slice(0, 10),
        customerRef: asReference(detail.customer?._id),
        billTo: buildBillToPayload(detail.customer),
        lineItems,
        internalNotes: detail.technicianNotes,
        workOrderRef: asReference(detail._id),
        appointmentRef: asReference(detail.appointment?._id),
      }

      const invoiceDoc = await client.create(invoicePayload, {autoGenerateArrayKeys: true})
      const completeOps: Record<string, any> = {
        status: 'completed',
        completedAt: detail.completedAt || new Date().toISOString(),
        laborHours: laborQty || null,
        laborRate: laborRate || null,
        invoice: asReference(invoiceDoc._id),
      }

      await client.patch(docId).set(completeOps).commit({autoGenerateArrayKeys: true})
      const partsToConsume =
        detail.partsUsed
          ?.filter((part) => part.part?._id && Number(part.quantity) > 0)
          ?.map((part) => ({
            productRef: {_ref: part.part!._id},
            quantity: Number(part.quantity) || 1,
            name: part.part?.title,
          })) || []
      if (partsToConsume.length) {
        try {
          await consumeInventoryForItems({
            client,
            items: partsToConsume,
            type: 'used',
            referenceDocId: detail._id,
            referenceLabel: detail.workOrderNumber,
            createdBy: 'work-order',
          })
        } catch (inventoryError) {
          console.warn('work order inventory deduction failed', inventoryError)
          toast.push({
            status: 'warning',
            title: 'Unable to deduct parts from inventory',
            description: (inventoryError as Error)?.message || 'Unknown error',
          })
        }
      }
      if (detail.appointment?._id) {
        await client
          .patch(detail.appointment._id)
          .set({status: 'completed'})
          .commit({autoGenerateArrayKeys: true})
      }
      await ensureVehicleRelationships({
        client,
        customerId: detail.customer?._id,
        vehicleId: detail.vehicle?._id,
        workOrderId: detail._id,
        customerVehicleIds: detail.customer?.vehicles,
        vehicleHistoryIds: detail.vehicle?.serviceHistoryIds,
      })
      toast.push({status: 'success', title: 'Invoice created'})
      router.navigateIntent('edit', {id: invoiceDoc._id, type: 'invoice'})
      closeDialog()
    } catch (error: any) {
      console.error('complete work order failed', error)
      toast.push({status: 'error', title: 'Unable to complete work order', description: error?.message || 'Unknown error'})
    } finally {
      setCompleting(false)
    }
  }

  let dialogContent
  if (loading || !detail) {
    dialogContent = (
      <Flex align="center" justify="center" padding={5}>
        <Spinner muted />
      </Flex>
    )
  } else {
    dialogContent = (
      <Stack space={4}>
        <Card padding={3} radius={3} border>
          <Stack space={2}>
            <Text weight="medium">{detail.workOrderNumber}</Text>
            <Text size={1} muted>
              {formatCustomerName(detail.customer)} • {detail.service?.title || 'Service'}
            </Text>
            {detail.appointment && (
              <Text size={1} muted>
                Appointment: {detail.appointment.appointmentNumber}
              </Text>
            )}
          </Stack>
        </Card>

        <Card padding={3} radius={3} border>
          <Stack space={3}>
            <Heading as="h4" size={1}>
              Labor
            </Heading>
            <Flex gap={3} wrap="wrap">
              <Button
                text="Start Timer"
                disabled={Boolean(detail.startedAt)}
                onClick={handleTimerStart}
              />
              <Button text="Stop Timer" disabled={!detail.startedAt} onClick={handleTimerStop} />
            </Flex>
            <Grid columns={[1, 2]} gap={3}>
              <Stack space={1}>
                <Text size={1} muted>
                  Labor Hours
                </Text>
                <TextInput value={laborHoursInput} onChange={(event) => setLaborHoursInput(event.currentTarget.value)} />
              </Stack>
              <Stack space={1}>
                <Text size={1} muted>
                  Hourly Rate
                </Text>
                <TextInput value={laborRateInput} onChange={(event) => setLaborRateInput(event.currentTarget.value)} />
              </Stack>
            </Grid>
            <Flex justify="flex-end">
              <Button text="Save Labor" onClick={handleSaveLabor} loading={saving} />
            </Flex>
          </Stack>
        </Card>

        <Card padding={3} radius={3} border>
          <Stack space={3}>
            <Heading as="h4" size={1}>
              Parts Used
            </Heading>
            <Stack space={2}>
              {detail.partsUsed?.length ? (
                detail.partsUsed.map((part) => (
                  <Flex key={part._key} align="center" justify="space-between">
                    <Stack space={1}>
                      <Text weight="medium">
                        {part.part?.title || 'Part'} ({part.quantity || 1}×)
                      </Text>
                      <Text size={1} muted>
                        ${Number(part.price || 0).toFixed(2)}
                      </Text>
                    </Stack>
                    <Button text="Remove" tone="critical" mode="bleed" onClick={() => handleRemovePart(part._key)} />
                  </Flex>
                ))
              ) : (
                <Text size={1} muted>
                  No parts recorded yet.
                </Text>
              )}
            </Stack>
            <Stack space={2}>
              <TextInput
                placeholder="Search by name or SKU"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.currentTarget.value)}
              />
              <Flex gap={2}>
                <Button text="Search" mode="ghost" loading={searching} onClick={handleSearchProducts} />
                <Select
                  value={selectedProduct}
                  onChange={(event) => {
                    const next = event.currentTarget.value
                    setSelectedProduct(next)
                    const match = productResults.find((item) => item._id === next)
                    if (match?.price) setPartPrice(String(match.price))
                  }}
                >
                  <option value="">Select product</option>
                  {productResults.map((product) => (
                    <option key={product._id} value={product._id}>
                      {product.title} {product.sku ? `(${product.sku})` : ''}
                    </option>
                  ))}
                </Select>
              </Flex>
              <Grid columns={[1, 2]} gap={3}>
                <TextInput
                  type="number"
                  min="1"
                  value={partQuantity}
                  onChange={(event) => setPartQuantity(event.currentTarget.value)}
                  placeholder="Qty"
                />
                <TextInput
                  type="number"
                  value={partPrice}
                  onChange={(event) => setPartPrice(event.currentTarget.value)}
                  placeholder="Unit price"
                />
              </Grid>
              <Flex justify="flex-end">
                <Button text="Add Part" onClick={handleAddPart} loading={saving} />
              </Flex>
            </Stack>
          </Stack>
        </Card>

        <Card padding={3} radius={3} border>
          <Stack space={3}>
            <Heading as="h4" size={1}>
              Additional Charges
            </Heading>
            <Stack space={2}>
              {detail.additionalCharges?.length ? (
                detail.additionalCharges.map((charge) => (
                  <Flex key={charge._key} align="center" justify="space-between">
                    <Text>
                      {charge.description} — ${Number(charge.amount || 0).toFixed(2)}
                    </Text>
                    <Button text="Remove" tone="critical" mode="bleed" onClick={() => handleRemoveCharge(charge._key)} />
                  </Flex>
                ))
              ) : (
                <Text size={1} muted>
                  No additional charges.
                </Text>
              )}
            </Stack>
            <Grid columns={[1, 2]} gap={3}>
              <TextInput
                placeholder="Description"
                value={chargeLabel}
                onChange={(event) => setChargeLabel(event.currentTarget.value)}
              />
              <TextInput
                type="number"
                placeholder="Amount"
                value={chargeAmount}
                onChange={(event) => setChargeAmount(event.currentTarget.value)}
              />
            </Grid>
            <Flex justify="flex-end">
              <Button text="Add Charge" onClick={handleAddCharge} loading={saving} />
            </Flex>
          </Stack>
        </Card>

        <Card padding={3} radius={3} border>
          <Stack space={3}>
            <Heading as="h4" size={1}>
              Technician Notes
            </Heading>
            <TextArea rows={4} value={notesValue} onChange={(event) => setNotesValue(event.currentTarget.value)} />
            <Flex justify="flex-end">
              <Button text="Save Notes" onClick={handleSaveNotes} loading={saving} />
            </Flex>
          </Stack>
        </Card>

        <Card padding={3} radius={3} border>
          <Stack space={3}>
            <Heading as="h4" size={1}>
              Photos
            </Heading>
            <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleUploadPhotos} />
            <Text size={1} muted>
              Upload bay, before/after, and diagnostic photos for the record.
            </Text>
          </Stack>
        </Card>

        <Card padding={3} radius={3} border>
          <Stack space={3}>
            <Heading as="h4" size={1}>
              Finalize & Invoice
            </Heading>
            {detail.invoice?._ref ? (
              <Button
                text="Open Invoice"
                tone="primary"
                onClick={() => router.navigateIntent('edit', {id: detail.invoice?._ref, type: 'invoice'})}
              />
            ) : (
              <Button
                text="Mark Complete & Generate Invoice"
                tone="positive"
                loading={completing}
                onClick={handleComplete}
              />
            )}
          </Stack>
        </Card>
      </Stack>
    )
  }

  return {
    label: 'Manage Work Order',
    tone: 'primary',
    onHandle: () => setOpen(true),
    dialog: isOpen
      ? {
          type: 'dialog',
          header: `Manage ${doc.workOrderNumber || 'Work Order'}`,
          onClose: closeDialog,
          content: <Box padding={4}>{dialogContent}</Box>,
        }
      : undefined,
  }
}
