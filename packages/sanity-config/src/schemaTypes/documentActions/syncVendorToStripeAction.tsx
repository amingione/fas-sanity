import {useState} from 'react'
import {SyncIcon} from '@sanity/icons'
import {useToast} from '@sanity/ui'
import type {DocumentActionComponent} from 'sanity'
import {getNetlifyFnBase} from './netlifyFnBase'

type VendorDoc = {
  _id: string
  status?: string
  companyName?: string
  primaryContact?: {email?: string}
}

type SyncResponse = {
  ok?: boolean
  error?: string
  stripeDashboardUrl?: string
  stripeCustomerId?: string
}

export const syncVendorToStripeAction: DocumentActionComponent = (props) => {
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  if (props.type !== 'vendor') return null

  const doc = (props.draft || props.published) as VendorDoc | null
  const baseId = props.id.replace(/^drafts\./, '')

  if (!doc) {
    return {
      label: 'Sync to Stripe',
      icon: SyncIcon,
      disabled: true,
      title: 'Vendor document is not ready yet',
    }
  }

  const companyName = doc.companyName?.trim()
  const primaryEmail = doc.primaryContact?.email?.trim()

  const validateVendor = () => {
    if (doc.status !== 'active') return 'Vendor must be active before syncing.'
    if (!companyName) return 'Vendor needs a company name before syncing.'
    if (!primaryEmail) return 'Vendor needs a primary contact email before syncing.'
    return ''
  }

  const handleSync = async () => {
    const validationError = validateVendor()
    if (validationError) {
      toast.push({status: 'warning', title: 'Sync blocked', description: validationError})
      props.onComplete()
      return
    }

    setBusy(true)
    try {
      const base = getNetlifyFnBase().replace(/\/$/, '')
      const res = await fetch(`${base}/.netlify/functions/syncVendorToStripe`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({vendorId: baseId}),
      })
      const data = (await res.json().catch(() => ({}))) as SyncResponse

      if (!res.ok || data?.error) {
        throw new Error(data?.error || 'Sync failed')
      }

      toast.push({
        status: 'success',
        title: 'Vendor synced to Stripe',
        description: data.stripeDashboardUrl
          ? `Stripe: ${data.stripeDashboardUrl}`
          : data.stripeCustomerId
            ? `Stripe customer: ${data.stripeCustomerId}`
            : 'Sync complete',
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sync failed'
      toast.push({status: 'error', title: 'Sync failed', description: message})
    } finally {
      setBusy(false)
      props.onComplete()
    }
  }

  return {
    label: 'Sync to Stripe',
    icon: SyncIcon,
    disabled: busy,
    onHandle: handleSync,
  }
}
