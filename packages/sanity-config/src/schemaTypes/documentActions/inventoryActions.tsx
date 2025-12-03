import {useMemo, useState} from 'react'
import {
  Box,
  Button,
  Card,
  Flex,
  Grid,
  Select,
  Stack,
  Text,
  TextArea,
  TextInput,
  useToast,
} from '@sanity/ui'
import {useClient, useCurrentUser} from 'sanity'
import type {DocumentActionComponent} from 'sanity'
import type {DocumentStub} from '../../types/sanity'
import {
  applyInventoryChanges,
  fetchInventoryById,
  recordInventoryTransaction,
  reserveInventoryForItems,
  recordManufacturedInventory,
} from '../../../../../shared/inventory'
import {generateReferenceCode} from '../../../../../shared/referenceCodes'
import {INVENTORY_DOCUMENT_TYPE} from '../../../../../shared/docTypes'

const API_VERSION = '2024-10-01'
const resolveCurrentUserLabel = (user: ReturnType<typeof useCurrentUser>) =>
  user?.name || user?.email || user?.id || 'system'

type InventoryDoc = {
  _id: string
  _type: typeof INVENTORY_DOCUMENT_TYPE
  product?: {_ref?: string; title?: string}
  reorderQuantity?: number
  quantityOnHand?: number
  quantityAvailable?: number
  unitCost?: number
  source?: string
  lowStockAlert?: boolean
  quantityInProduction?: number
}

type ManufacturingOrderDoc = {
  _id: string
  _type: 'manufacturingOrder'
  moNumber?: string
  product?: {_ref?: string; title?: string}
  quantityOrdered?: number
  quantityCompleted?: number
  quantityRemaining?: number
  status?: string
}

const useInventoryDoc = (props: any): InventoryDoc | null => {
  const doc = (props.draft || props.published) as InventoryDoc | null
  if (!doc || doc._type !== INVENTORY_DOCUMENT_TYPE) return null
  return doc
}

const useManufacturingOrderDoc = (props: any): ManufacturingOrderDoc | null => {
  const doc = (props.draft || props.published) as ManufacturingOrderDoc | null
  if (!doc || doc._type !== 'manufacturingOrder') return null
  return doc
}

export const adjustInventoryAction: DocumentActionComponent = (props) => {
  const doc = useInventoryDoc(props)
  const currentUser = useCurrentUser()
  const client = useClient({apiVersion: API_VERSION})
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [adjustmentType, setAdjustmentType] = useState<'received' | 'damaged' | 'adjustment'>(
    'received',
  )
  const [quantityInput, setQuantityInput] = useState('0')
  const [unitCostInput, setUnitCostInput] = useState('')
  const [notes, setNotes] = useState('')

  if (!doc || !doc.product?._ref) return null

  const handleSubmit = async () => {
    const quantity = Number(quantityInput)
    if (!Number.isFinite(quantity) || quantity === 0) {
      toast.push({status: 'warning', title: 'Enter a non-zero quantity'})
      return
    }
    const baseId = props.id.replace(/^drafts\./, '')
    setSubmitting(true)
    try {
      const snapshot = await fetchInventoryById(client, baseId)
      if (!snapshot) throw new Error('Inventory record not found')
      const unitCostOverride =
        adjustmentType === 'received' && unitCostInput.trim()
          ? Number(unitCostInput.replace(/[^0-9.]/g, ''))
          : undefined
      const updated = await applyInventoryChanges({
        client,
        snapshot,
        onHandDelta: quantity,
        unitCostOverride,
        setLastRestocked: adjustmentType === 'received',
      })
      await recordInventoryTransaction({
        client,
        productId: snapshot.productId || doc.product!._ref!,
        type: adjustmentType === 'received' ? 'received' : 'adjustment',
        quantity,
        unitCost: unitCostOverride ?? snapshot.unitCost,
        quantityBefore: snapshot.quantityOnHand,
        quantityAfter: updated.quantityOnHand,
        notes: notes || undefined,
        createdBy: resolveCurrentUserLabel(currentUser),
      })
      toast.push({status: 'success', title: 'Inventory updated'})
      setOpen(false)
      setQuantityInput('0')
      setUnitCostInput('')
      setNotes('')
      props.onComplete()
    } catch (error: any) {
      console.error('adjust inventory failed', error)
      toast.push({
        status: 'error',
        title: 'Unable to adjust inventory',
        description: error?.message || 'Unknown error',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return {
    label: 'Adjust Stock',
    onHandle: () => setOpen(true),
    dialog: open && {
      type: 'dialog',
      onClose: () => setOpen(false),
      header: doc.product?.title ? `Adjust ${doc.product.title}` : 'Adjust Inventory',
      content: (
        <Stack space={4} padding={4}>
          <Grid columns={[1, 2]} gap={3}>
            <Stack space={2}>
              <Text size={1} muted>
                Adjustment Type
              </Text>
              <Select
                value={adjustmentType}
                onChange={(event) => setAdjustmentType(event.currentTarget.value as any)}
              >
                <option value="received">Received</option>
                <option value="adjustment">Adjustment</option>
                <option value="damaged">Damaged/Lost</option>
              </Select>
            </Stack>
            <Stack space={2}>
              <Text size={1} muted>
                Quantity
              </Text>
              <TextInput
                type="number"
                value={quantityInput}
                onChange={(event) => setQuantityInput(event.currentTarget.value)}
              />
            </Stack>
          </Grid>
          {adjustmentType === 'received' && (
            <Stack space={2}>
              <Text size={1} muted>
                Unit Cost
              </Text>
              <TextInput
                type="number"
                value={unitCostInput}
                onChange={(event) => setUnitCostInput(event.currentTarget.value)}
              />
            </Stack>
          )}
          <Stack space={2}>
            <Text size={1} muted>
              Reason / Notes
            </Text>
            <TextArea
              value={notes}
              rows={3}
              onChange={(event) => setNotes(event.currentTarget.value)}
            />
          </Stack>
          <Flex justify="flex-end" gap={3}>
            <Button text="Cancel" mode="bleed" onClick={() => setOpen(false)} disabled={submitting} />
            <Button text="Save" tone="primary" loading={submitting} onClick={handleSubmit} />
          </Flex>
        </Stack>
      ),
    },
  }
}

export const reserveInventoryAction: DocumentActionComponent = (props) => {
  const doc = useInventoryDoc(props)
  const client = useClient({apiVersion: API_VERSION})
  const toast = useToast()
  const currentUser = useCurrentUser()
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [quantityInput, setQuantityInput] = useState('1')
  const [referenceType, setReferenceType] = useState<'order' | 'workOrder'>('order')
  const [referenceValue, setReferenceValue] = useState('')
  const [notes, setNotes] = useState('')

  if (!doc || !doc.product?._ref) return null

  const resolveReferenceDocId = async (): Promise<{id: string; label?: string} | null> => {
    const trimmed = referenceValue.trim()
    if (!trimmed) return null
    let query = ''
    if (referenceType === 'order') {
      query = `*[_type == "order" && (_id == $value || orderNumber == $value)][0]{_id, orderNumber}`
    } else {
      query =
        '*[_type == "workOrder" && (_id == $value || workOrderNumber == $value)][0]{_id, workOrderNumber}'
    }
    const result = await client.fetch<{_id?: string; orderNumber?: string; workOrderNumber?: string} | null>(
      query,
      {value: trimmed},
    )
    if (!result?._id) return null
    return {
      id: result._id,
      label: result.orderNumber || result.workOrderNumber || trimmed,
    }
  }

  const handleReserve = async () => {
    const quantity = Number(quantityInput)
    if (!Number.isFinite(quantity) || quantity <= 0) {
      toast.push({status: 'warning', title: 'Quantity must be positive'})
      return
    }
    setSubmitting(true)
    try {
      const referenceDetails = await resolveReferenceDocId()
      const reservation = await reserveInventoryForItems({
        client,
        items: [
          {
            productRef: {_ref: doc.product!._ref!},
            quantity,
            name: notes
              ? `${doc.product?.title || 'Product'} • ${notes}`
              : doc.product?.title || undefined,
          },
        ],
        referenceDocId: referenceDetails?.id,
        referenceLabel: referenceDetails?.label,
        createdBy: resolveCurrentUserLabel(currentUser),
      })
      if (reservation.reserved.length) {
        toast.push({
          status: 'success',
          title: 'Stock reserved',
          description: referenceDetails?.label
            ? `Reserved for ${referenceDetails.label}`
            : 'Reserved inventory',
        })
      }
      if (reservation.insufficient.length) {
        toast.push({
          status: 'warning',
          title: 'Insufficient inventory',
          description: `${reservation.insufficient[0].required} needed • ${reservation.insufficient[0].available} available`,
        })
      }
      if (reservation.missing.length) {
        toast.push({
          status: 'warning',
          title: 'Inventory missing',
          description: reservation.missing[0].reason,
        })
      }
      setOpen(false)
      props.onComplete()
    } catch (error: any) {
      console.error('reserve inventory failed', error)
      toast.push({
        status: 'error',
        title: 'Unable to reserve inventory',
        description: error?.message || 'Unknown error',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return {
    label: 'Reserve Stock',
    onHandle: () => setOpen(true),
    dialog: open && {
      type: 'dialog',
      onClose: () => setOpen(false),
      header: 'Reserve Inventory',
      content: (
        <Stack space={4} padding={4}>
          <Grid columns={[1, 2]} gap={3}>
            <Stack space={2}>
              <Text size={1} muted>
                Quantity
              </Text>
              <TextInput
                type="number"
                value={quantityInput}
                onChange={(event) => setQuantityInput(event.currentTarget.value)}
              />
            </Stack>
            <Stack space={2}>
              <Text size={1} muted>
                Reference Type
              </Text>
              <Select
                value={referenceType}
                onChange={(event) => setReferenceType(event.currentTarget.value as any)}
              >
                <option value="order">Order</option>
                <option value="workOrder">Work Order</option>
              </Select>
            </Stack>
          </Grid>
          <Stack space={2}>
            <Text size={1} muted>
              Order / Work Order Number or ID
            </Text>
            <TextInput
              value={referenceValue}
              onChange={(event) => setReferenceValue(event.currentTarget.value)}
              placeholder="FAS-123456"
            />
          </Stack>
          <Stack space={2}>
            <Text size={1} muted>
              Notes
            </Text>
            <TextArea value={notes} onChange={(event) => setNotes(event.currentTarget.value)} rows={3} />
          </Stack>
          <Flex justify="flex-end" gap={3}>
            <Button text="Cancel" mode="bleed" onClick={() => setOpen(false)} disabled={submitting} />
            <Button text="Reserve" tone="primary" loading={submitting} onClick={handleReserve} />
          </Flex>
        </Stack>
      ),
    },
  }
}

export const createManufacturingOrderAction: DocumentActionComponent = (props) => {
  const doc = useInventoryDoc(props)
  const client = useClient({apiVersion: API_VERSION})
  const toast = useToast()
  const currentUser = useCurrentUser()
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [quantityInput, setQuantityInput] = useState(() =>
    String(doc?.reorderQuantity || doc?.quantityInProduction || 1),
  )
  const [priority, setPriority] = useState<'urgent' | 'high' | 'normal' | 'low'>('normal')
  const [scheduledStart, setScheduledStart] = useState('')
  const [assignedTo, setAssignedTo] = useState('')

  const shouldShow =
    doc &&
    doc.source === 'manufactured' &&
    Boolean(doc.lowStockAlert) &&
    doc.product?._ref &&
    props.id

  const defaultReason = useMemo(() => {
    if (!doc) return undefined
    if (doc.lowStockAlert) return 'Low stock auto-replenish'
    return undefined
  }, [doc])

  if (!shouldShow) return null

  const handleCreate = async () => {
    const quantity = Number(quantityInput)
    if (!Number.isFinite(quantity) || quantity <= 0) {
      toast.push({status: 'warning', title: 'Quantity must be positive'})
      return
    }

    setSubmitting(true)
    try {
      const moNumber = await generateReferenceCode(client, {
        prefix: 'MO-',
        typeName: 'manufacturingOrder',
        fieldName: 'moNumber',
      })
      const payload: DocumentStub<Record<string, any>> = {
        _type: 'manufacturingOrder',
        moNumber,
        product: {_type: 'reference', _ref: doc!.product!._ref!},
        quantityOrdered: quantity,
        quantityCompleted: 0,
        quantityRemaining: quantity,
        priority,
        status: 'queued',
        scheduledStart: scheduledStart ? new Date(scheduledStart).toISOString() : undefined,
        assignedTo: assignedTo || undefined,
        createdBy: resolveCurrentUserLabel(currentUser),
        reason: defaultReason,
      }
      const created = await client.create(payload, {autoGenerateArrayKeys: true})
      await applyInventoryChanges({
        client,
        inventoryId: props.id.replace(/^drafts\./, ''),
        productionDelta: quantity,
      })
      toast.push({
        status: 'success',
        title: 'Manufacturing order created',
        description: created.moNumber,
      })
      setOpen(false)
      props.onComplete()
    } catch (error: any) {
      console.error('create manufacturing order failed', error)
      toast.push({
        status: 'error',
        title: 'Unable to create manufacturing order',
        description: error?.message || 'Unknown error',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return {
    label: 'Create Production Order',
    onHandle: () => setOpen(true),
    disabled: !shouldShow,
    dialog: open && {
      type: 'dialog',
      onClose: () => setOpen(false),
      header: 'Create Manufacturing Order',
      content: (
        <Stack space={4} padding={4}>
          <Grid columns={[1, 2]} gap={3}>
            <Stack space={2}>
              <Text size={1} muted>
                Quantity
              </Text>
              <TextInput
                type="number"
                value={quantityInput}
                onChange={(event) => setQuantityInput(event.currentTarget.value)}
              />
            </Stack>
            <Stack space={2}>
              <Text size={1} muted>
                Priority
              </Text>
              <Select
                value={priority}
                onChange={(event) => setPriority(event.currentTarget.value as any)}
              >
                <option value="urgent">Urgent</option>
                <option value="high">High</option>
                <option value="normal">Normal</option>
                <option value="low">Low</option>
              </Select>
            </Stack>
          </Grid>
          <Grid columns={[1, 2]} gap={3}>
            <Stack space={2}>
              <Text size={1} muted>
                Scheduled Start
              </Text>
              <TextInput
                type="datetime-local"
                value={scheduledStart}
                onChange={(event) => setScheduledStart(event.currentTarget.value)}
              />
            </Stack>
            <Stack space={2}>
              <Text size={1} muted>
                Assigned To
              </Text>
              <TextInput
                value={assignedTo}
                onChange={(event) => setAssignedTo(event.currentTarget.value)}
                placeholder="Team or technician"
              />
            </Stack>
          </Grid>
          <Flex justify="flex-end" gap={3}>
            <Button text="Cancel" mode="bleed" onClick={() => setOpen(false)} disabled={submitting} />
            <Button text="Create" tone="primary" loading={submitting} onClick={handleCreate} />
          </Flex>
        </Stack>
      ),
    },
  }
}

export const completeManufacturingOrderAction: DocumentActionComponent = (props) => {
  const doc = useManufacturingOrderDoc(props)
  const client = useClient({apiVersion: API_VERSION})
  const toast = useToast()
  const currentUser = useCurrentUser()
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [quantityInput, setQuantityInput] = useState('1')
  const [hoursInput, setHoursInput] = useState('')
  const [qualityNotes, setQualityNotes] = useState('')

  if (!doc || doc.status !== 'in_production' || !doc.product?._ref) return null

  const remaining =
    Math.max(0, Number(doc.quantityOrdered || 0) - Number(doc.quantityCompleted || 0)) || 0

  const handleComplete = async () => {
    const quantity = Number(quantityInput)
    if (!Number.isFinite(quantity) || quantity <= 0) {
      toast.push({status: 'warning', title: 'Quantity must be positive'})
      return
    }
    if (remaining && quantity > remaining) {
      toast.push({
        status: 'warning',
        title: 'Cannot complete more than ordered',
        description: `Remaining: ${remaining}`,
      })
      return
    }
    setSubmitting(true)
    try {
      await recordManufacturedInventory({
        client,
        productId: doc.product!._ref!,
        quantity,
        referenceDocId: doc._id,
        referenceLabel: doc.moNumber,
        createdBy: resolveCurrentUserLabel(currentUser),
      })
      const newCompleted = Number(doc.quantityCompleted || 0) + quantity
      await client
        .patch(doc._id.replace(/^drafts\./, ''))
        .set({
          quantityCompleted: newCompleted,
          quantityRemaining: Math.max(0, Number(doc.quantityOrdered || 0) - newCompleted),
          status: 'completed',
          actualCompletion: new Date().toISOString(),
          actualHours: hoursInput ? Number(hoursInput) : undefined,
          qualityNotes: qualityNotes || undefined,
        })
        .commit({autoGenerateArrayKeys: true})
      toast.push({status: 'success', title: 'Manufacturing order completed'})
      setOpen(false)
      props.onComplete()
    } catch (error: any) {
      console.error('complete manufacturing order failed', error)
      toast.push({
        status: 'error',
        title: 'Unable to complete production',
        description: error?.message || 'Unknown error',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return {
    label: 'Complete Production',
    onHandle: () => setOpen(true),
    disabled: !doc || doc.status !== 'in_production',
    dialog: open && {
      type: 'dialog',
      onClose: () => setOpen(false),
      header: 'Complete Production',
      content: (
        <Stack space={4} padding={4}>
          <Stack space={1}>
            <Text size={1} muted>
              Remaining Quantity
            </Text>
            <Text weight="semibold">{remaining || 'Unknown'}</Text>
          </Stack>
          <Stack space={2}>
            <Text size={1} muted>
              Quantity Completed
            </Text>
            <TextInput
              type="number"
              value={quantityInput}
              onChange={(event) => setQuantityInput(event.currentTarget.value)}
            />
          </Stack>
          <Grid columns={[1, 2]} gap={3}>
            <Stack space={2}>
              <Text size={1} muted>
                Actual Hours
              </Text>
              <TextInput
                type="number"
                value={hoursInput}
                onChange={(event) => setHoursInput(event.currentTarget.value)}
                placeholder="0"
              />
            </Stack>
            <Stack space={2}>
              <Text size={1} muted>
                Quality Notes
              </Text>
              <TextArea
                rows={3}
                value={qualityNotes}
                onChange={(event) => setQualityNotes(event.currentTarget.value)}
              />
            </Stack>
          </Grid>
          <Flex justify="flex-end" gap={3}>
            <Button text="Cancel" mode="bleed" onClick={() => setOpen(false)} disabled={submitting} />
            <Button text="Complete" tone="positive" loading={submitting} onClick={handleComplete} />
          </Flex>
        </Stack>
      ),
    },
  }
}
