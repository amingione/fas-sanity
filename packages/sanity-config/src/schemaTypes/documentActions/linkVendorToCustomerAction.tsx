import {useState} from 'react'
import {LinkIcon} from '@sanity/icons'
import {useToast} from '@sanity/ui'
import {useClient} from 'sanity'
import type {DocumentActionComponent} from 'sanity'
import {computeCustomerName, splitFullName} from '../../../../../shared/customerName'

const API_VERSION = '2024-10-01'

type VendorDoc = {
  _id: string
  companyName?: string
  primaryContact?: {name?: string; email?: string}
  customerRef?: {_ref?: string} | null
}

type CustomerDoc = {
  _id: string
  email?: string
  firstName?: string
  lastName?: string
  name?: string
  roles?: string[]
  customerType?: string
}

const ensureVendorRoles = (customer: CustomerDoc) => {
  const roles = Array.isArray(customer.roles) ? [...customer.roles] : []
  const hasCustomerRole = roles.includes('customer')
  const hasVendorRole = roles.includes('vendor')
  if (!hasVendorRole) roles.push('vendor')

  let customerType = customer.customerType || null
  if (!customerType || customerType === 'retail' || customerType === 'in-store') {
    customerType = hasCustomerRole ? 'both' : 'vendor'
  }
  if (customerType === 'vendor' && hasCustomerRole) customerType = 'both'

  return {roles: hasVendorRole ? undefined : roles, customerType}
}

export const linkVendorToCustomerAction: DocumentActionComponent = (props) => {
  const toast = useToast()
  const client = useClient({apiVersion: API_VERSION})
  const [busy, setBusy] = useState(false)

  if (props.type !== 'vendor') return null

  const doc = (props.draft || props.published) as VendorDoc | null
  if (!doc) {
    return {
      label: 'Link Vendor to Customer',
      icon: LinkIcon,
      disabled: true,
      title: 'Vendor document is not ready yet',
    }
  }

  const baseId = props.id.replace(/^drafts\./, '')

  const handleLink = async () => {
    const vendorEmail = doc.primaryContact?.email?.trim()
    if (!vendorEmail) {
      toast.push({
        status: 'warning',
        title: 'Missing vendor email',
        description: 'Add a primary contact email before linking.',
      })
      props.onComplete()
      return
    }

    setBusy(true)
    try {
      let customer = await client.fetch<CustomerDoc | null>(
        `*[_type == "customer" && email == $email][0]{
          _id,
          email,
          firstName,
          lastName,
          name,
          roles,
          customerType
        }`,
        {email: vendorEmail},
      )

      if (!customer) {
        const nameParts = splitFullName(doc.primaryContact?.name)
        const computedName = computeCustomerName({
          firstName: nameParts.firstName,
          lastName: nameParts.lastName,
          email: vendorEmail,
          fallbackName: doc.primaryContact?.name,
        })

        customer = await client.create<CustomerDoc>({
          _type: 'customer',
          email: vendorEmail,
          firstName: nameParts.firstName || undefined,
          lastName: nameParts.lastName || undefined,
          name: computedName || vendorEmail,
          roles: ['vendor'],
          customerType: 'vendor',
        })
      } else {
        const patch: Record<string, unknown> = {}
        const vendorRolePatch = ensureVendorRoles(customer)
        if (vendorRolePatch.roles) patch.roles = vendorRolePatch.roles
        if (vendorRolePatch.customerType && vendorRolePatch.customerType !== customer.customerType) {
          patch.customerType = vendorRolePatch.customerType
        }

        if (Object.keys(patch).length > 0) {
          await client.patch(customer._id).set(patch).commit({autoGenerateArrayKeys: true})
        }
      }

      await client
        .patch(baseId)
        .set({
          customerRef: {_type: 'reference', _ref: customer._id},
          'portalAccess.email': customer.email || vendorEmail,
        })
        .commit({autoGenerateArrayKeys: true})

      toast.push({
        status: 'success',
        title: 'Vendor linked to customer',
        description: customer.email || vendorEmail,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Link failed'
      toast.push({status: 'error', title: 'Link failed', description: message})
    } finally {
      setBusy(false)
      props.onComplete()
    }
  }

  return {
    label: 'Link Vendor to Customer',
    icon: LinkIcon,
    disabled: busy,
    onHandle: handleLink,
  }
}
