import {useMemo, useState} from 'react'
import {Box, Button, Flex, Select, Stack, Text, useToast} from '@sanity/ui'
import {CheckmarkCircleIcon, CopyIcon, SyncIcon} from '@sanity/icons'
import type {DocumentActionComponent} from 'sanity'
import {useClient} from 'sanity'
import {generateReferenceCode} from '../../../../../shared/referenceCodes'

const API_VERSION = '2024-10-01'
const RECURRING_OPTIONS = ['Weekly', 'Monthly', 'Quarterly', 'Annually']

const normalizeId = (id: string) => id.replace(/^drafts\./, '')

const getTargetIds = (props: Parameters<DocumentActionComponent>[0]): string[] => {
  const baseId = normalizeId(props.id)
  const targets = new Set<string>()
  if (props.published) targets.add(baseId)
  if (props.draft) targets.add(`drafts.${baseId}`)
  if (!targets.size) targets.add(props.id)
  return Array.from(targets)
}

const commitExpenseUpdate = async (
  client: ReturnType<typeof useClient>,
  props: Parameters<DocumentActionComponent>[0],
  updates: Record<string, unknown>,
) => {
  const tx = client.transaction()
  for (const targetId of getTargetIds(props)) {
    tx.patch(targetId, (patch) => patch.set(updates))
  }
  await tx.commit({autoGenerateArrayKeys: true})
}

export const markExpensePaidAction: DocumentActionComponent = (props) => {
  const toast = useToast()
  const client = useClient({apiVersion: API_VERSION})
  const [busy, setBusy] = useState(false)

  if (props.type !== 'expense') return null
  const doc = (props.draft || props.published) as Record<string, any> | undefined
  if (!doc) return null
  if (doc.status === 'paid') return null

  return {
    label: 'Mark as Paid',
    icon: CheckmarkCircleIcon,
    tone: 'positive',
    disabled: busy,
    onHandle: async () => {
      setBusy(true)
      try {
        const today = new Date().toISOString().slice(0, 10)
        await commitExpenseUpdate(client, props, {status: 'paid', paidDate: today})
        toast.push({
          status: 'success',
          title: 'Expense marked paid',
          description: `${doc.expenseNumber || 'Expense'} updated successfully.`,
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        toast.push({status: 'error', title: 'Update failed', description: message})
      } finally {
        setBusy(false)
        props.onComplete()
      }
    },
  }
}

export const duplicateExpenseAction: DocumentActionComponent = (props) => {
  const toast = useToast()
  const client = useClient({apiVersion: API_VERSION})
  const [busy, setBusy] = useState(false)

  if (props.type !== 'expense') return null
  const doc = (props.draft || props.published) as Record<string, any> | undefined
  if (!doc) return null

  return {
    label: 'Duplicate',
    icon: CopyIcon,
    disabled: busy,
    onHandle: async () => {
      setBusy(true)
      try {
        const reference = await generateReferenceCode(client, {
          prefix: 'EXP-',
          typeName: 'expense',
          fieldName: 'expenseNumber',
        })
        const {_id, _rev, _createdAt, _updatedAt, _type, ...rest} = doc
        const payload = {
          ...rest,
          status: 'pending',
          paidDate: null,
          expenseNumber: reference,
          _type: 'expense',
        }
        const created = await client.create(payload)
        toast.push({
          status: 'success',
          title: 'Expense duplicated',
          description: `${doc.expenseNumber || doc.vendorName || 'Expense'} copied as ${reference}.`,
        })
        if (typeof window !== 'undefined') {
          const studioBase = window.location.origin
          window.open(`${studioBase}/desk/expense;${created._id}`, '_blank')
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        toast.push({status: 'error', title: 'Duplicate failed', description: message})
      } finally {
        setBusy(false)
        props.onComplete()
      }
    },
  }
}

export const makeExpenseRecurringAction: DocumentActionComponent = (props) => {
  const toast = useToast()
  const client = useClient({apiVersion: API_VERSION})
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  if (props.type !== 'expense') return null
  const doc = (props.draft || props.published) as Record<string, any> | undefined
  if (!doc) return null

  const [frequency, setFrequency] = useState<string>(() => doc.recurringFrequency || 'Monthly')
  const dialogContent = useMemo(
    () => (
      <Stack space={3}>
        <Text size={2}>
          Choose how often this expense repeats. We will mark the document as recurring and store
          the selected cadence.
        </Text>
        <Select value={frequency} onChange={(event) => setFrequency(event.currentTarget.value)}>
          {RECURRING_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
      </Stack>
    ),
    [frequency],
  )

  const handleConfirm = async () => {
    setBusy(true)
    try {
      await commitExpenseUpdate(client, props, {
        recurring: true,
        recurringFrequency: frequency,
      })
      toast.push({
        status: 'success',
        title: 'Recurring expense updated',
        description: `${doc.expenseNumber || 'Expense'} repeats ${frequency.toLowerCase()}.`,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      toast.push({status: 'error', title: 'Update failed', description: message})
    } finally {
      setBusy(false)
      setOpen(false)
      props.onComplete()
    }
  }

  return {
    label: doc.recurring ? 'Update Recurring' : 'Make Recurring',
    icon: SyncIcon,
    disabled: busy,
    onHandle: () => setOpen(true),
    dialog: open
      ? {
          type: 'dialog' as const,
          onClose: () => {
            setBusy(false)
            setOpen(false)
          },
          header: doc.recurring ? 'Update Recurring Expense' : 'Make Expense Recurring',
          content: <Box padding={4}>{dialogContent}</Box>,
          footer: (
            <Box padding={4}>
              <Flex justify="flex-end" gap={3}>
                <Button
                  text="Cancel"
                  mode="ghost"
                  onClick={() => {
                    setBusy(false)
                    setOpen(false)
                  }}
                />
                <Button
                  tone="primary"
                  text={doc.recurring ? 'Update' : 'Make Recurring'}
                  onClick={handleConfirm}
                  loading={busy}
                />
              </Flex>
            </Box>
          ),
        }
      : undefined,
  }
}
