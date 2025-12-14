import {createClient} from '@sanity/client'
import {sendEmail} from '../../packages/sanity-config/src/utils/emailService'

type AutomationTrigger =
  | 'order_placed'
  | 'order_shipped'
  | 'order_delivered'
  | 'appointment_reminder'
  | 'cart_abandoned_1hr'
  | 'cart_abandoned_24hr'
  | 'no_order_90days'
  | 'review_request'
  | 'service_reminder'

type AutomationDocument = {
  _id: string
  name?: string
  trigger: AutomationTrigger
  delay?: number
  conditions?: Array<{
    field?: string
    operator?: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'contains'
    value?: string
  }>
  template?: {
    _id: string
    name?: string
    subject?: string
    htmlBody?: string
    textBody?: string
    fromName?: string
    fromEmail?: string
    replyTo?: string
  }
}

type OrderDocument = {
  _id: string
  orderNumber?: string
  totalAmount?: number
  amountSubtotal?: number
  amountTax?: number
  customerEmail?: string
  customerName?: string
  createdAt?: string
  _createdAt?: string
  customerRef?: {
    _id: string
    firstName?: string
    lastName?: string
    email?: string
  }
}

type AppointmentDocument = {
  _id: string
  appointmentNumber?: string
  scheduledDate?: string
  status?: string
  serviceTitle?: string
  customer?: {
    _id: string
    firstName?: string
    lastName?: string
    email?: string
  }
}

type AbandonedCheckoutDocument = {
  _id: string
  stripeSessionId?: string
  customerEmail?: string
  customerName?: string
  totalAmount?: number
  createdAt?: string
}

type CustomerDocument = {
  _id: string
  firstName?: string
  lastName?: string
  email?: string
  lastOrderDate?: string
}

const sanity = createClient({
  projectId: process.env.SANITY_STUDIO_PROJECT_ID!,
  dataset: process.env.SANITY_STUDIO_DATASET!,
  apiVersion: '2024-10-01',
  token: process.env.SANITY_API_TOKEN,
  useCdn: false,
})

const PUBLIC_SITE_URL = process.env.PUBLIC_SITE_URL || 'https://fasmotorsports.com'

const AUTOMATION_QUERY = `*[_type == "emailAutomation" && active == true && trigger == $trigger]{
  _id,
  trigger,
  delay,
  conditions,
  "template": template->{
    _id,
    name,
    subject,
    htmlBody,
    textBody,
    fromName,
    fromEmail,
    replyTo
  }
}`

const ORDER_FETCH_QUERY = `*[_type == "order" && _id == $id][0]{
  _id,
  orderNumber,
  totalAmount,
  amountSubtotal,
  amountTax,
  customerEmail,
  customerName,
  createdAt,
  _createdAt,
  customerRef->{_id, firstName, lastName, email}
}`

const ORDER_RECHECK_QUERY = `*[_type == "order" && status == "paid" && dateTime(coalesce(createdAt, _createdAt)) >= dateTime($start)]{
  _id,
  orderNumber,
  totalAmount,
  amountSubtotal,
  amountTax,
  customerEmail,
  customerName,
  createdAt,
  _createdAt,
  customerRef->{_id, firstName, lastName, email}
}[0...200]`

const APPOINTMENT_QUERY = `*[_type == "appointment" && status in ["scheduled","confirmed"] && scheduledDate >= $start && scheduledDate <= $end]{
  _id,
  appointmentNumber,
  scheduledDate,
  status,
  "serviceTitle": service->title,
  customer->{_id, firstName, lastName, email}
}`

const ABANDONED_CHECKOUT_QUERY = `*[
  _type == "abandonedCheckout" &&
  status == "expired" &&
  recoveryEmailSent != true &&
  !defined(recoveredOrderId._ref) &&
  dateTime(coalesce(sessionExpiredAt, sessionCreatedAt, _createdAt)) >= $start &&
  dateTime(coalesce(sessionExpiredAt, sessionCreatedAt, _createdAt)) <= $end
]{
  _id,
  stripeSessionId,
  customerEmail,
  customerName,
  "totalAmount": amountTotal,
  "createdAt": coalesce(sessionExpiredAt, sessionCreatedAt, _createdAt)
}`

const INACTIVE_CUSTOMER_QUERY = `*[_type == "customer" && defined(lastOrderDate) && lastOrderDate < $cutoff && defined(email)]{
  _id,
  firstName,
  lastName,
  email,
  lastOrderDate
}`

export async function runOrderPlacedAutomations(
  orderId: string,
  options: {respectDelay?: boolean} = {},
): Promise<void> {
  const order = await sanity.fetch<OrderDocument | null>(ORDER_FETCH_QUERY, {id: orderId})
  if (!order) return
  await triggerAutomationsForContext('order_placed', order, options)
}

export async function runOrderPlacedSweep(lookbackHours = 4): Promise<void> {
  const start = new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString()
  const orders = await sanity.fetch<OrderDocument[]>(ORDER_RECHECK_QUERY, {start})
  for (const order of orders) {
    await triggerAutomationsForContext('order_placed', order, {respectDelay: false})
  }
}

export async function runAppointmentReminderAutomations(): Promise<void> {
  const now = new Date()
  const target = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  const start = new Date(target.getTime() - 30 * 60 * 1000).toISOString()
  const end = new Date(target.getTime() + 30 * 60 * 1000).toISOString()
  const appointments = await sanity.fetch<AppointmentDocument[]>(APPOINTMENT_QUERY, {start, end})
  for (const appointment of appointments) {
    await triggerAutomationsForContext('appointment_reminder', appointment)
  }
}

export async function runCartAbandonmentAutomations(hoursAgo: number): Promise<void> {
  const end = new Date(Date.now() - hoursAgo * 60 * 60 * 1000 + 15 * 60 * 1000)
  const start = new Date(Date.now() - hoursAgo * 60 * 60 * 1000 - 15 * 60 * 1000)
  const carts = await sanity.fetch<AbandonedCheckoutDocument[]>(ABANDONED_CHECKOUT_QUERY, {
    start: start.toISOString(),
    end: end.toISOString(),
  })
  const trigger: AutomationTrigger =
    hoursAgo >= 24 ? 'cart_abandoned_24hr' : 'cart_abandoned_1hr'
  for (const cart of carts) {
    await triggerAutomationsForContext(trigger, cart)
  }
}

export async function runNoOrderNinetyDayAutomations(): Promise<void> {
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
  const customers = await sanity.fetch<CustomerDocument[]>(INACTIVE_CUSTOMER_QUERY, {cutoff})
  for (const customer of customers) {
    await triggerAutomationsForContext('no_order_90days', customer)
  }
}

const triggerAutomationsForContext = async (
  trigger: AutomationTrigger,
  context: any,
  options: {respectDelay?: boolean} = {},
): Promise<void> => {
  const automations = await fetchAutomations(trigger)
  if (!automations.length) return
  for (const automation of automations) {
    if (!automation.template?._id) continue
    if (!passesConditions(automation.conditions || [], context)) continue
    if (options?.respectDelay !== false && !delaySatisfied(automation.delay, context)) {
      continue
    }
    await sendAutomationMessage(automation, context)
  }
}

const fetchAutomations = async (trigger: AutomationTrigger): Promise<AutomationDocument[]> =>
  sanity.fetch(AUTOMATION_QUERY, {trigger})

const passesConditions = (conditions: AutomationDocument['conditions'], context: any): boolean => {
  if (!conditions || conditions.length === 0) return true
  return conditions.every((condition) => {
    const fieldValue = getContextValue(context, condition.field || '')
    const comparisonValue = condition.value || ''
    switch (condition.operator) {
      case 'not_equals':
        return String(fieldValue || '').toLowerCase() !== comparisonValue.toLowerCase()
      case 'greater_than':
        return Number(fieldValue) > Number(comparisonValue)
      case 'less_than':
        return Number(fieldValue) < Number(comparisonValue)
      case 'contains':
        return String(fieldValue || '').toLowerCase().includes(comparisonValue.toLowerCase())
      case 'equals':
      default:
        return String(fieldValue || '').toLowerCase() === comparisonValue.toLowerCase()
    }
  })
}

const getContextValue = (context: any, path: string): any => {
  if (!path) return undefined
  return path.split('.').reduce((acc, key) => (acc ? acc[key] : undefined), context)
}

const delaySatisfied = (delayMinutes: number | undefined, context: any): boolean => {
  if (!delayMinutes || delayMinutes <= 0) return true
  const created =
    new Date(context?.createdAt || context?._createdAt || context?.scheduledDate || Date.now())
  const cutoff = created.getTime() + delayMinutes * 60 * 1000
  return Date.now() >= cutoff
}

const sendAutomationMessage = async (
  automation: AutomationDocument,
  context: OrderDocument | AppointmentDocument | AbandonedCheckoutDocument | CustomerDocument,
): Promise<void> => {
  const template = automation.template
  if (!template) return
  const recipient = resolveRecipient(context)
  if (!recipient) return
  const contextKey = buildContextKey(automation._id, context)
  const alreadySent = await sanity.fetch<number>(
    `count(*[_type == "emailLog" && contextKey == $key])`,
    {key: contextKey},
  )
  if (alreadySent > 0) return
  const variables = buildVariables(context)
  const subject = renderTemplate(template.subject || template.name || automation.name || 'Notification', variables)
  const htmlBody = renderTemplate(template.htmlBody || '', variables) || undefined
  const textBody = renderTemplate(template.textBody || '', variables) || undefined
  const logId = await createEmailLog({
    to: recipient,
    subject,
    automationId: automation._id,
    templateId: template._id,
    contextKey,
    context,
  })
  try {
    const result = await sendEmail({
      to: recipient,
      subject,
      html: htmlBody,
      text: textBody,
      from: formatFromAddress(template),
      replyTo: template.replyTo || template.fromEmail,
      variables,
      emailLogId: logId || undefined,
    })
    await sanity
      .patch(logId)
      .set({
        status: 'sent',
        sentAt: new Date().toISOString(),
        emailServiceId: result.id,
      })
      .commit({autoGenerateArrayKeys: true})
  } catch (err: any) {
    await sanity
      .patch(logId)
      .set({
        status: 'failed',
        error: err?.message || 'Automation send failed',
      })
      .commit({autoGenerateArrayKeys: true})
  }
}

const resolveRecipient = (
  context: OrderDocument | AppointmentDocument | AbandonedCheckoutDocument | CustomerDocument,
): string | null => {
  if ('customerEmail' in context && context.customerEmail) return context.customerEmail
  if ('customer' in context && context.customer?.email) return context.customer.email
  if ('customerRef' in context && context.customerRef?.email) return context.customerRef.email
  if ('email' in context && context.email) return context.email
  return null
}

const buildVariables = (
  context: OrderDocument | AppointmentDocument | AbandonedCheckoutDocument | CustomerDocument,
): Record<string, string> => {
  if ('orderNumber' in context) {
    const total =
      typeof context.totalAmount === 'number'
        ? context.totalAmount
        : (context.amountSubtotal || 0) + (context.amountTax || 0)
    return {
      orderNumber: context.orderNumber || '',
      customerName: context.customerName || context.customerRef?.firstName || '',
      orderTotal: total ? `$${total.toFixed(2)}` : '',
    }
  }
  if ('appointmentNumber' in context) {
    return {
      appointmentNumber: context.appointmentNumber || '',
      appointmentDate: context.scheduledDate
        ? new Date(context.scheduledDate).toLocaleString()
        : '',
      customerName:
        [context.customer?.firstName, context.customer?.lastName].filter(Boolean).join(' ') || '',
      serviceTitle: context.serviceTitle || '',
    }
  }
  if ('stripeSessionId' in context) {
    const url = `${PUBLIC_SITE_URL}/checkout/recover?sessionId=${context.stripeSessionId || ''}`
    return {
      customerName: context.customerName || '',
      cartTotal: context.totalAmount ? `$${context.totalAmount.toFixed(2)}` : '',
      recoveryUrl: url,
    }
  }
  return {
    customerName: [context.firstName, context.lastName].filter(Boolean).join(' ') || '',
    lastOrderDate: context.lastOrderDate
      ? new Date(context.lastOrderDate).toLocaleDateString()
      : '',
  }
}

const buildContextKey = (
  automationId: string,
  context: OrderDocument | AppointmentDocument | AbandonedCheckoutDocument | CustomerDocument,
) => {
  const contextId =
    context._id || ('stripeSessionId' in context ? context.stripeSessionId : context.email || '')
  return `${automationId}:${contextId}`
}

const formatFromAddress = (template: AutomationDocument['template']): string => {
  const name = template?.fromName || 'FAS Motorsports'
  const email = template?.fromEmail || 'info@fasmotorsports.com'
  return `${name} <${email}>`
}

const createEmailLog = async ({
  to,
  subject,
  automationId,
  templateId,
  contextKey,
  context,
}: {
  to: string
  subject: string
  automationId: string
  templateId: string
  contextKey: string
  context: OrderDocument | AppointmentDocument | AbandonedCheckoutDocument | CustomerDocument
}): Promise<string> => {
  const doc: Record<string, any> = {
    _type: 'emailLog',
    to,
    subject,
    status: 'queued',
    automation: {_type: 'reference', _ref: automationId},
    template: {_type: 'reference', _ref: templateId},
    contextKey,
  }
  if ('_id' in context && context._id) {
    if ('orderNumber' in context) doc.order = {_type: 'reference', _ref: context._id}
    if ('appointmentNumber' in context) doc.appointment = {_type: 'reference', _ref: context._id}
  }
  const created = await sanity.create(doc, {autoGenerateArrayKeys: true})
  return created._id
}

const renderTemplate = (body: string, variables: Record<string, string>): string => {
  if (!body) return ''
  return body.replace(/{{\s*([\w.]+)\s*}}/g, (_, key) => variables[key] || '')
}
