// components/studio/VendorAdminDashboard.tsx
import {useCallback, useEffect, useState} from 'react'
import {useClient} from 'sanity'

interface Vendor {
  _id: string
  companyName?: string
  vendorNumber?: string
  status?: string
  primaryContact?: {
    name?: string
    email?: string
  }
  onboardedAt?: string
  _createdAt: string
}

export default function VendorAdminDashboard() {
  const client = useClient({apiVersion: '2024-10-01'})
  const [vendors, setVendors] = useState<Vendor[]>([])

  const fetchVendors = useCallback(() => {
    client
      .fetch(
        `*[_type == "vendor"]{
          _id,
          companyName,
          vendorNumber,
          status,
          primaryContact,
          onboardedAt,
          _createdAt
        } | order(_createdAt desc)`,
      )
      .then(setVendors)
      .catch((err) => console.error('Failed to load vendors', err))
  }, [client])

  useEffect(() => {
    fetchVendors()
  }, [fetchVendors])

  return (
    <div style={{padding: '2rem'}}>
      <h1>Vendor Applications</h1>
      <table>
        <thead>
          <tr>
            <th>Business Name</th>
            <th>Vendor #</th>
            <th>Contact</th>
            <th>Email</th>
            <th>Status</th>
            <th>Onboarded</th>
          </tr>
        </thead>
        <tbody>
          {vendors.map((vendor) => (
            <tr key={vendor._id}>
              <td>{vendor.companyName || 'N/A'}</td>
              <td>{vendor.vendorNumber || '—'}</td>
              <td>{vendor.primaryContact?.name || 'N/A'}</td>
              <td>{vendor.primaryContact?.email || 'N/A'}</td>
              <td>{vendor.status || 'N/A'}</td>
              <td>
                {vendor.onboardedAt
                  ? new Date(vendor.onboardedAt).toLocaleDateString()
                  : new Date(vendor._createdAt).toLocaleDateString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
