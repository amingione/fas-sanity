import {useState} from 'react'
import {Box, Button, Flex, Select, Stack, Text, TextArea, TextInput, useToast} from '@sanity/ui'
import type {SanityClient} from '@sanity/client'
import type {DocumentActionComponent} from 'sanity'
import {useClient, useCurrentUser} from 'sanity'
import {generateReferenceCode} from '../../../../../shared/referenceCodes'
import {getNetlifyFnBase} from './netlifyFnBase'

const API_VERSION = '2024-10-01'

const PRICING_TIERS = [
  {label: 'Standard (10% off)', value: 'standard'},
  {label: 'Preferred (12% off)', value: 'preferred'},
  {label: 'Platinum (15% off)', value: 'platinum'},
  {label: 'Custom', value: 'custom'},
]

const PAYMENT_TERMS = [
  {label: 'Due on Receipt', value: 'due_on_receipt'},
  {label: 'Net 15', value: 'net_15'},
  {label: 'Net 30', value: 'net_30'},
  {label: 'Net 60', value: 'net_60'},
  {label: 'Net 90', value: 'net_90'},
]

type VendorApplicationDoc = {
  _id: string
  _type: 'vendorApplication'
  companyName?: string
  contactName?: string
  contactTitle?: string
  email?: string
  phone?: string
  alternatePhone?: string
  businessType?: string
  taxId?: string
  yearsInBusiness?: number
  website?: string
  businessAddress?: Record<string, any>
  shippingAddressSame?: boolean
  shippingAddress?: Record<string, any>
  taxExempt?: boolean
  taxExemptCertificate?: any
  status?: string
  internalNotes?: string
  applicationNumber?: string
}

type CustomerDoc = {
  _id: string
  email?: string | null
  roles?: string[] | null
  customerType?: string | null
  name?: string | null
}

const useVendorApplication = (props: any): VendorApplicationDoc | null => {
  const doc = (props?.draft || props?.published) as VendorApplicationDoc | null
  if (!doc || doc._type !== 'vendorApplication') return null
  return doc
}

const sendVendorEmail = async (
  to: string | undefined,
  body: {template: 'welcome' | 'rejection'; data: Record<string, any>},
) => {
  if (!to) return
  try {
    const base = getNetlifyFnBase()
    await fetch(`${base}/.netlify/functions/sendVendorEmail`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({to, template: body.template, data: body.data}),
    })
  } catch (error) {
    console.warn('sendVendorEmail failed', error)
  }
}

const normalizeEmail = (value?: string) => value?.trim().toLowerCase() || ''

const ensureVendorRoles = (customer: CustomerDoc) => {
  const roles = Array.isArray(customer.roles) ? customer.roles.slice() : []
  const hasCustomerRole = roles.includes('customer')
  const hasVendorRole = roles.includes('vendor')
  if (!hasVendorRole) roles.push('vendor')

  let customerType = customer.customerType || null
  if (!customerType || customerType === 'retail' || customerType === 'in-store') {
    customerType = hasCustomerRole ? 'both' : 'vendor'
  }
  if (customerType === 'vendor' && hasCustomerRole) customerType = 'both'

  const patch: Record<string, any> = {}
  if (!hasVendorRole) patch.roles = roles
  if (customerType && customerType !== customer.customerType) patch.customerType = customerType
  return patch
}

const ensureCustomerForVendor = async (client: SanityClient, doc: VendorApplicationDoc) => {
  const email = normalizeEmail(doc.email)
  if (!email) throw new Error('Vendor email is missing')

  const existing = await client.fetch<CustomerDoc | null>(
    '*[_type == "customer" && lower(email) == $email][0]{_id, email, roles, customerType, name}',
    {email},
  )

  if (existing?._id) {
    const patch = ensureVendorRoles(existing)
    if (Object.keys(patch).length) {
      await client.patch(existing._id).set(patch).commit()
    }
    return {customerId: existing._id, email: existing.email || email}
  }

  const name = doc.contactName || doc.companyName || email
  const created = await client.create({
    _type: 'customer',
    email,
    name,
    roles: ['customer', 'vendor'],
    customerType: 'vendor',
  })

  return {customerId: created._id, email}
}

export const approveVendorApplicationAction: DocumentActionComponent = (props) => {
  const doc = useVendorApplication(props)
  const toast = useToast()
  const client = useClient({apiVersion: API_VERSION})
  const currentUser = useCurrentUser()
  const [isOpen, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [pricingTier, setPricingTier] = useState<'standard' | 'preferred' | 'platinum' | 'custom'>(
    'standard',
  )
  const [paymentTerms, setPaymentTerms] = useState<
    'due_on_receipt' | 'net_15' | 'net_30' | 'net_60' | 'net_90'
  >('net_30')
  const [creditLimit, setCreditLimit] = useState('10000')
  const [customDiscount, setCustomDiscount] = useState('20')
  const [minimumOrderAmount, setMinimumOrderAmount] = useState('500')
  const [accountManager, setAccountManager] = useState('')

  if (!doc || doc.status === 'approved') return null

  const baseId = props.id.replace(/^drafts\./, '')
  const reviewer = currentUser?.name || 'Wholesale Team'

  const handleApprove = async () => {
    if (!doc.companyName || !doc.contactName || !doc.email || !doc.phone) {
      toast.push({
        status: 'warning',
        title: 'Missing required fields',
        description: 'Company name, contact, email, and phone are required.',
      })
      return
    }

    setBusy(true)
    try {
      const customer = await ensureCustomerForVendor(client, doc)
      const vendorNumber = await generateReferenceCode(client, {
        prefix: 'VEN-',
        typeName: 'vendor',
        fieldName: 'vendorNumber',
      })
      const tierData: Record<string, any> = {
        pricingTier,
      }
      if (pricingTier === 'custom') {
        tierData.customDiscountPercentage = Number(customDiscount) || 0
      }
      const now = new Date().toISOString()
      const shippingAddress =
        doc.shippingAddressSame === false ? doc.shippingAddress : doc.businessAddress

      const vendorDoc = {
        _type: 'vendor' as const,
        vendorNumber,
        companyName: doc.companyName,
        displayName: doc.companyName,
        status: 'active',
        website: doc.website,
        businessType: doc.businessType,
        yearsInBusiness: doc.yearsInBusiness,
        primaryContact: {
          name: doc.contactName,
          title: doc.contactTitle,
          email: customer.email,
          phone: doc.phone,
          mobile: doc.alternatePhone,
        },
        businessAddress: doc.businessAddress || undefined,
        shippingAddress: shippingAddress || undefined,
        paymentTerms,
        creditLimit: Number(creditLimit) || 0,
        currentBalance: 0,
        taxExempt: doc.taxExempt ?? false,
        taxExemptCertificate: doc.taxExemptCertificate,
        taxId: doc.taxId,
        minimumOrderAmount: Number(minimumOrderAmount) || 500,
        allowBackorders: true,
        autoApproveOrders: false,
        portalAccess: {enabled: false, email: customer.email},
        portalUsers: [],
        accountManager: accountManager || reviewer,
        onboardedAt: now,
        totalOrders: 0,
        totalRevenue: 0,
        internalNotes: doc.internalNotes || undefined,
        customerRef: {
          _type: 'reference',
          _ref: customer.customerId,
        },
        applicationRef: {
          _type: 'reference',
          _ref: baseId,
        },
        ...tierData,
      }

      const createdVendor = await client.create(vendorDoc, {autoGenerateArrayKeys: true})
      const vendorId = createdVendor._id
      const patchOps = {
        status: 'approved',
        reviewedAt: now,
        reviewedBy: reviewer,
        vendorRef: {_type: 'reference', _ref: vendorId},
      }
      const tx = client.transaction()
      if (props.published) tx.patch(baseId, (patch) => patch.set(patchOps))
      if (props.draft) tx.patch(`drafts.${baseId}`, (patch) => patch.set(patchOps))
      await tx.commit({autoGenerateArrayKeys: true})

      await sendVendorEmail(doc.email, {
        template: 'welcome',
        data: {
          companyName: doc.companyName,
          contactName: doc.contactName,
          pricingTier,
          paymentTerms,
          creditLimit: Number(creditLimit) || undefined,
          portalAccessEnabled: false,
          accountManager: accountManager || reviewer,
        },
      })

      toast.push({status: 'success', title: 'Vendor created and application approved'})
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      toast.push({status: 'error', title: 'Approval failed', description: message})
    } finally {
      setBusy(false)
      setOpen(false)
      props.onComplete()
    }
  }

  const dialogContent = (
    <Stack space={4}>
      <Text weight="semibold">Assign pricing & credit terms</Text>
      <Stack space={3}>
        <label>
          <Text size={1} muted>
            Pricing tier
          </Text>
          <Select
            value={pricingTier}
            onChange={(event) => setPricingTier(event.currentTarget.value as any)}
          >
            {PRICING_TIERS.map((tier) => (
              <option key={tier.value} value={tier.value}>
                {tier.label}
              </option>
            ))}
          </Select>
        </label>
        {pricingTier === 'custom' && (
          <label>
            <Text size={1} muted>
              Custom discount %
            </Text>
            <TextInput
              value={customDiscount}
              onChange={(event) => setCustomDiscount(event.currentTarget.value)}
            />
          </label>
        )}
        <label>
          <Text size={1} muted>
            Payment terms
          </Text>
          <Select
            value={paymentTerms}
            onChange={(event) => setPaymentTerms(event.currentTarget.value as any)}
          >
            {PAYMENT_TERMS.map((term) => (
              <option key={term.value} value={term.value}>
                {term.label}
              </option>
            ))}
          </Select>
        </label>
        <label>
          <Text size={1} muted>
            Credit limit (USD)
          </Text>
          <TextInput
            value={creditLimit}
            onChange={(event) => setCreditLimit(event.currentTarget.value)}
          />
        </label>
        <label>
          <Text size={1} muted>
            Minimum order amount (USD)
          </Text>
          <TextInput
            value={minimumOrderAmount}
            onChange={(event) => setMinimumOrderAmount(event.currentTarget.value)}
          />
        </label>
        <label>
          <Text size={1} muted>
            Account manager
          </Text>
          <TextInput
            value={accountManager}
            onChange={(event) => setAccountManager(event.currentTarget.value)}
            placeholder="e.g. Jordan (Wholesale Team)"
          />
        </label>
      </Stack>
      <Flex justify="flex-end" gap={3}>
        <Button text="Cancel" mode="ghost" disabled={busy} onClick={() => setOpen(false)} />
        <Button
          text="Approve"
          tone="positive"
          disabled={busy}
          loading={busy}
          onClick={handleApprove}
        />
      </Flex>
    </Stack>
  )

  return {
    label: 'Approve & Create Vendor',
    tone: 'positive',
    disabled: !doc,
    onHandle: () => setOpen(true),
    dialog: isOpen
      ? {
          type: 'dialog',
          onClose: () => {
            setOpen(false)
            props.onComplete()
          },
          header: `Approve ${doc.companyName || 'application'}`,
          content: <Box padding={4}>{dialogContent}</Box>,
        }
      : undefined,
  }
}

export const rejectVendorApplicationAction: DocumentActionComponent = (props) => {
  const doc = useVendorApplication(props)
  const toast = useToast()
  const client = useClient({apiVersion: API_VERSION})
  const currentUser = useCurrentUser()
  const [isOpen, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [reason, setReason] = useState('')

  if (!doc) return null
  const baseId = props.id.replace(/^drafts\./, '')
  const reviewer = currentUser?.name || 'Wholesale Team'

  const handleReject = async () => {
    setBusy(true)
    const now = new Date().toISOString()
    const notes = reason
      ? [doc.internalNotes, `Rejected on ${now}: ${reason}`].filter(Boolean).join('\n')
      : doc.internalNotes

    try {
      const patchOps = {
        status: 'rejected',
        reviewedAt: now,
        reviewedBy: reviewer,
        internalNotes: notes,
      }
      const tx = client.transaction()
      if (props.published) tx.patch(baseId, (patch) => patch.set(patchOps))
      if (props.draft) tx.patch(`drafts.${baseId}`, (patch) => patch.set(patchOps))
      await tx.commit({autoGenerateArrayKeys: true})

      await sendVendorEmail(doc.email, {
        template: 'rejection',
        data: {
          companyName: doc.companyName || 'your team',
          contactName: doc.contactName,
          applicationNumber: doc.applicationNumber,
          reason,
        },
      })

      toast.push({status: 'info', title: 'Application rejected'})
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      toast.push({status: 'error', title: 'Rejection failed', description: message})
    } finally {
      setBusy(false)
      setOpen(false)
      props.onComplete()
    }
  }

  return {
    label: 'Reject Application',
    tone: 'critical',
    disabled: doc.status === 'rejected',
    onHandle: () => setOpen(true),
    dialog: isOpen
      ? {
          type: 'dialog',
          onClose: () => {
            setOpen(false)
            props.onComplete()
          },
          header: `Reject ${doc.companyName || 'application'}`,
          content: (
            <Box padding={4}>
              <Stack space={4}>
                <Text weight="semibold">Provide a reason (optional)</Text>
                <TextArea
                  value={reason}
                  onChange={(event) => setReason(event.currentTarget.value)}
                  rows={4}
                />
                <Flex justify="flex-end" gap={3}>
                  <Button
                    text="Cancel"
                    mode="ghost"
                    disabled={busy}
                    onClick={() => setOpen(false)}
                  />
                  <Button
                    text="Reject"
                    tone="critical"
                    disabled={busy}
                    loading={busy}
                    onClick={handleReject}
                  />
                </Flex>
              </Stack>
            </Box>
          ),
        }
      : undefined,
  }
}

export const holdVendorApplicationAction: DocumentActionComponent = (props) => {
  const doc = useVendorApplication(props)
  const toast = useToast()
  const client = useClient({apiVersion: API_VERSION})
  const currentUser = useCurrentUser()
  const [isOpen, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [reason, setReason] = useState('')

  if (!doc) return null
  const baseId = props.id.replace(/^drafts\./, '')
  const reviewer = currentUser?.name || 'Wholesale Team'

  const handleHold = async () => {
    setBusy(true)
    const now = new Date().toISOString()
    const notes = reason
      ? [doc.internalNotes, `On hold ${now}: ${reason}`].filter(Boolean).join('\n')
      : doc.internalNotes
    try {
      const patchOps = {
        status: 'on_hold',
        reviewedAt: now,
        reviewedBy: reviewer,
        internalNotes: notes,
      }
      const tx = client.transaction()
      if (props.published) tx.patch(baseId, (patch) => patch.set(patchOps))
      if (props.draft) tx.patch(`drafts.${baseId}`, (patch) => patch.set(patchOps))
      await tx.commit({autoGenerateArrayKeys: true})
      toast.push({status: 'warning', title: 'Application moved to on-hold'})
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      toast.push({status: 'error', title: 'Unable to update status', description: message})
    } finally {
      setBusy(false)
      setOpen(false)
      props.onComplete()
    }
  }

  return {
    label: 'Put On Hold',
    tone: 'caution',
    disabled: doc.status === 'on_hold',
    onHandle: () => setOpen(true),
    dialog: isOpen
      ? {
          type: 'dialog',
          onClose: () => {
            setOpen(false)
            props.onComplete()
          },
          header: `On hold: ${doc.companyName || 'application'}`,
          content: (
            <Box padding={4}>
              <Stack space={4}>
                <Text size={1} muted>
                  Optionally provide context for why this application is on hold.
                </Text>
                <TextArea
                  rows={4}
                  value={reason}
                  onChange={(event) => setReason(event.currentTarget.value)}
                />
                <Flex justify="flex-end" gap={3}>
                  <Button
                    text="Cancel"
                    mode="ghost"
                    disabled={busy}
                    onClick={() => setOpen(false)}
                  />
                  <Button text="Place On Hold" tone="caution" loading={busy} onClick={handleHold} />
                </Flex>
              </Stack>
            </Box>
          ),
        }
      : undefined,
  }
}
