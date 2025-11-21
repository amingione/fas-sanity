import {useCallback, useEffect, useMemo, useState} from 'react'
import type {DocumentActionComponent} from 'sanity'
import {useRouter} from 'sanity/router'
import {useClient} from 'sanity'
import {
  Box,
  Button,
  Card,
  Flex,
  Select,
  Spinner,
  Stack,
  Text,
  TextArea,
  TextInput,
  useToast,
} from '@sanity/ui'
import {resolveNetlifyBase} from '../../utils/netlifyBase'

type CustomerDocument = {
  _id: string
  firstName?: string | null
  lastName?: string | null
  email?: string | null
}

type AttachmentDraft = {
  id: string
  name: string
  type: string
  content: string
}

const API_VERSION = '2024-10-01'

const EMAIL_TEMPLATES: Record<
  string,
  {label: string; subject: (name?: string | null) => string; body: (name?: string | null) => string}
> = {
  welcome: {
    label: 'Welcome',
    subject: (name) => `Welcome to FAS Motorsports${name ? `, ${name}` : ''}!`,
    body: (name) =>
      `Hi ${name || 'there'},\n\nThanks for trusting F.A.S. Motorsports with your build. Let us know how we can help next.\n\nBest,\nTeam FAS`,
  },
  promotion: {
    label: 'Promotion',
    subject: () => 'Exclusive upgrade savings for your next visit',
    body: () =>
      `We hand-picked a few upgrades that pair well with your build.\n\nReply to this email and we’ll get you a quote within one business day.`,
  },
  service_reminder: {
    label: 'Service reminder',
    subject: () => 'Heads up—service is due soon',
    body: (name) =>
      `Hi ${name || 'there'},\n\nWe recommend booking your next service to keep everything running perfectly. Tap reply and we’ll save you a spot.`,
  },
  custom: {
    label: 'Custom message',
    subject: () => '',
    body: () => '',
  },
}

const uniqueId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)

const CUSTOMER_HISTORY_QUERY = `{
  "orders": *[_type == "order" && customerRef._ref == $customerId] | order(dateTime(coalesce(orderDate, createdAt, _createdAt)) desc)[0...10]{
    _id,
    orderNumber,
    status,
    totalAmount,
    amountSubtotal,
    amountTax,
    amountShipping,
    _createdAt
  },
  "appointments": *[_type == "appointment" && customer._ref == $customerId] | order(scheduledDate desc)[0...5]{
    _id,
    appointmentNumber,
    scheduledDate,
    status,
    service->{title}
  },
  "workOrders": *[_type == "workOrder" && customer._ref == $customerId] | order(coalesce(completedAt, startedAt, _createdAt) desc)[0...5]{
    _id,
    workOrderNumber,
    status,
    service->{title},
    completedAt
  },
  "invoices": *[_type == "invoice" && customerRef._ref == $customerId] | order(_createdAt desc)[0...5]{
    _id,
    invoiceNumber,
    total,
    status,
    _createdAt
  }
}`

const buildOrderTotal = (order: Record<string, any>) => {
  if (typeof order.totalAmount === 'number') return order.totalAmount
  const subtotal = typeof order.amountSubtotal === 'number' ? order.amountSubtotal : 0
  const tax = typeof order.amountTax === 'number' ? order.amountTax : 0
  const shipping = typeof order.amountShipping === 'number' ? order.amountShipping : 0
  return subtotal + tax + shipping
}

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

const formatCurrency = (value?: number | null) =>
  typeof value === 'number' && Number.isFinite(value) ? currencyFormatter.format(value) : '$0'

const readFileAsBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result.split(',').pop() || '')
      } else {
        resolve('')
      }
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })

export const sendCustomerEmailAction: DocumentActionComponent = (props) => {
  const doc = (props.draft || props.published) as CustomerDocument | null
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [templateKey, setTemplateKey] = useState<string>('welcome')
  const [subject, setSubject] = useState<string>(() => EMAIL_TEMPLATES.welcome.subject(doc?.firstName))
  const [body, setBody] = useState<string>(() => EMAIL_TEMPLATES.welcome.body(doc?.firstName))
  const [attachments, setAttachments] = useState<AttachmentDraft[]>([])
  const [sending, setSending] = useState(false)

  if (props.type !== 'customer' || !doc) {
    return {
      label: 'Send Email',
      disabled: true,
      title: 'Customer is not available yet.',
    }
  }

  if (!doc.email) {
    return {
      label: 'Send Email',
      disabled: true,
      title: 'Save an email address to send messages.',
    }
  }

  const handleTemplateChange = (value: string) => {
    setTemplateKey(value)
    const template = EMAIL_TEMPLATES[value]
    if (template) {
      setSubject(template.subject(doc.firstName))
      setBody(template.body(doc.firstName))
    }
  }

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.currentTarget.files
    if (!files?.length) return
    const next: AttachmentDraft[] = []
    for (const file of Array.from(files)) {
      const content = await readFileAsBase64(file)
      if (!content) continue
      next.push({
        id: uniqueId(),
        name: file.name,
        type: file.type || 'application/octet-stream',
        content,
      })
    }
    setAttachments((prev) => [...prev, ...next])
    event.target.value = ''
  }

  const handleRemoveAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((attachment) => attachment.id !== id))
  }

  const handleSend = async () => {
    if (!doc.email) return
    setSending(true)
    try {
      const base = resolveNetlifyBase()
      const response = await fetch(`${base}/.netlify/functions/sendCustomerEmail`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          to: doc.email,
          customerId: doc._id.replace(/^drafts\./, ''),
          subject: subject.trim(),
          message: body.trim(),
          template: templateKey,
          attachments: attachments.map((attachment) => ({
            filename: attachment.name,
            contentType: attachment.type,
            content: attachment.content,
          })),
        }),
      })
      if (!response.ok) {
        const message = await response.text()
        throw new Error(message || 'Email request failed')
      }
      toast.push({status: 'success', title: 'Email sent'})
      setOpen(false)
      setAttachments([])
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to send email'
      toast.push({status: 'error', title: 'Email failed', description: message})
    } finally {
      setSending(false)
      props.onComplete()
    }
  }

  return {
    label: 'Send Email',
    tone: 'primary',
    onHandle: () => setOpen(true),
    dialog: open
      ? {
          type: 'dialog' as const,
          onClose: () => {
            setOpen(false)
            setSending(false)
          },
          header: 'Send customer email',
          content: (
            <Box padding={4}>
              <Stack space={3}>
                <Select value={templateKey} onChange={(event) => handleTemplateChange(event.currentTarget.value)}>
                  {Object.entries(EMAIL_TEMPLATES).map(([value, template]) => (
                    <option key={value} value={value}>
                      {template.label}
                    </option>
                  ))}
                </Select>
                <TextInput
                  value={subject}
                  onChange={(event) => setSubject(event.currentTarget.value)}
                  placeholder="Subject"
                />
                <TextArea
                  value={body}
                  rows={6}
                  onChange={(event) => setBody(event.currentTarget.value)}
                  placeholder="Message body"
                />
                <Stack space={2}>
                  <input type="file" multiple onChange={handleFileChange} />
                  {attachments.length > 0 && (
                    <Stack space={1}>
                      {attachments.map((attachment) => (
                        <Flex key={attachment.id} align="center" justify="space-between">
                          <Text size={1}>{attachment.name}</Text>
                          <Button
                            text="Remove"
                            mode="bleed"
                            tone="critical"
                            onClick={() => handleRemoveAttachment(attachment.id)}
                          />
                        </Flex>
                      ))}
                    </Stack>
                  )}
                </Stack>
              </Stack>
            </Box>
          ),
          footer: (
            <Box padding={4}>
              <Flex justify="flex-end" gap={3}>
                <Button text="Cancel" mode="ghost" onClick={() => setOpen(false)} />
                <Button
                  text="Send"
                  tone="primary"
                  onClick={handleSend}
                  disabled={sending || !subject.trim() || !body.trim()}
                  loading={sending}
                />
              </Flex>
            </Box>
          ),
        }
      : undefined,
  }
}

const createIntentAction =
  (label: string, intent: 'create', schemaType: string, initialValueBuilder?: (doc: CustomerDocument) => Record<string, any>): DocumentActionComponent =>
  (props) => {
    if (props.type !== 'customer') return null
    const doc = (props.draft || props.published) as CustomerDocument | null
    const router = useRouter()
    if (!doc) return null
    return {
      label,
      onHandle: () => {
        router?.navigateIntent?.(intent, {
          type: schemaType,
          initialValue: initialValueBuilder ? initialValueBuilder(doc) : undefined,
        })
        props.onComplete()
      },
    }
  }

export const bookAppointmentAction = createIntentAction('Book Appointment', 'create', 'appointment', (doc) => ({
  customer: {_type: 'reference', _ref: doc._id.replace(/^drafts\./, '')},
}))

export const createOrderFromCustomerAction = createIntentAction('Create Order', 'create', 'order', (doc) => ({
  customerRef: {_type: 'reference', _ref: doc._id.replace(/^drafts\./, '')},
  customerEmail: doc.email,
}))

export const addVehicleAction = createIntentAction('Add Vehicle', 'create', 'vehicle', (doc) => ({
  customer: {_type: 'reference', _ref: doc._id.replace(/^drafts\./, '')},
}))

export const viewFullHistoryAction: DocumentActionComponent = (props) => {
  if (props.type !== 'customer') return null
  const doc = (props.draft || props.published) as CustomerDocument | null
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState<Record<string, any> | null>(null)
  const client = useClient({apiVersion: API_VERSION})

  const fetchHistory = useCallback(
    async (customerId: string) => {
      setLoading(true)
      try {
        const result = await client.fetch(CUSTOMER_HISTORY_QUERY, {customerId})
        setHistory(result)
      } catch (err) {
        console.warn('Failed to load customer history', err)
      } finally {
        setLoading(false)
      }
    },
    [client],
  )

  const handleOpen = () => {
    if (!doc?._id) return
    const baseId = doc._id.replace(/^drafts\./, '')
    setOpen(true)
    fetchHistory(baseId)
  }

  if (!doc) return null

  return {
    label: 'View Full History',
    onHandle: handleOpen,
    dialog: open
      ? {
          type: 'dialog' as const,
          onClose: () => setOpen(false),
          header: 'Customer history',
          content: (
            <Box padding={4}>
              {loading && (
                <Flex gap={3} align="center">
                  <Spinner muted />
                  <Text muted>Loading history…</Text>
                </Flex>
              )}
              {!loading && history && (
                <Stack space={4}>
                  <Stack space={2}>
                    <Text weight="semibold">Orders</Text>
                    {history.orders?.length ? (
                      history.orders.map((order: any) => (
                        <Card key={order._id} padding={3} radius={2} border>
                          <Flex justify="space-between" align={['flex-start', 'center']} wrap="wrap" gap={3}>
                            <Stack space={1}>
                              <Text weight="semibold">{order.orderNumber || order._id}</Text>
                              <Text size={1} muted>{new Date(order._createdAt).toLocaleDateString()}</Text>
                            </Stack>
                            <Stack space={1} style={{textAlign: 'right'}}>
                              <Text weight="semibold">{formatCurrency(buildOrderTotal(order))}</Text>
                              <Badge mode="outline">{order.status || 'draft'}</Badge>
                            </Stack>
                          </Flex>
                        </Card>
                      ))
                    ) : (
                      <Text size={1} muted>
                        No orders recorded.
                      </Text>
                    )}
                  </Stack>

                  <Stack space={2}>
                    <Text weight="semibold">Appointments</Text>
                    {history.appointments?.length ? (
                      history.appointments.map((appt: any) => (
                        <Card key={appt._id} padding={3} radius={2} border>
                          <Flex justify="space-between">
                            <Stack space={1}>
                              <Text weight="semibold">{appt.appointmentNumber || 'Appointment'}</Text>
                              <Text size={1} muted>{appt.service?.title || 'Service'}</Text>
                            </Stack>
                            <Stack space={1} style={{textAlign: 'right'}}>
                              <Text>{appt.scheduledDate ? new Date(appt.scheduledDate).toLocaleDateString() : 'TBD'}</Text>
                              <Badge mode="outline">{appt.status || 'scheduled'}</Badge>
                            </Stack>
                          </Flex>
                        </Card>
                      ))
                    ) : (
                      <Text size={1} muted>
                        No appointments yet.
                      </Text>
                    )}
                  </Stack>

                  <Stack space={2}>
                    <Text weight="semibold">Work Orders</Text>
                    {history.workOrders?.length ? (
                      history.workOrders.map((order: any) => (
                        <Card key={order._id} padding={3} radius={2} border>
                          <Flex justify="space-between">
                            <Stack space={1}>
                              <Text weight="semibold">{order.workOrderNumber || 'Work Order'}</Text>
                              <Text size={1} muted>{order.service?.title || 'Service'}</Text>
                            </Stack>
                            <Stack space={1} style={{textAlign: 'right'}}>
                              <Text>{order.completedAt ? new Date(order.completedAt).toLocaleDateString() : 'In progress'}</Text>
                              <Badge mode="outline">{order.status || 'not_started'}</Badge>
                            </Stack>
                          </Flex>
                        </Card>
                      ))
                    ) : (
                      <Text size={1} muted>
                        No work orders yet.
                      </Text>
                    )}
                  </Stack>

                  <Stack space={2}>
                    <Text weight="semibold">Invoices</Text>
                    {history.invoices?.length ? (
                      history.invoices.map((invoice: any) => (
                        <Card key={invoice._id} padding={3} radius={2} border>
                          <Flex justify="space-between">
                            <Stack space={1}>
                              <Text weight="semibold">{invoice.invoiceNumber || invoice._id}</Text>
                              <Text size={1} muted>{new Date(invoice._createdAt).toLocaleDateString()}</Text>
                            </Stack>
                            <Stack space={1} style={{textAlign: 'right'}}>
                              <Text weight="semibold">{formatCurrency(invoice.total)}</Text>
                              <Badge mode="outline">{invoice.status || 'draft'}</Badge>
                            </Stack>
                          </Flex>
                        </Card>
                      ))
                    ) : (
                      <Text size={1} muted>
                        No invoices for this customer.
                      </Text>
                    )}
                  </Stack>
                </Stack>
              )}
            </Box>
          ),
          footer: (
            <Box padding={4}>
              <Flex justify="flex-end">
                <Button text="Close" onClick={() => setOpen(false)} />
              </Flex>
            </Box>
          ),
        }
      : undefined,
  }
}
