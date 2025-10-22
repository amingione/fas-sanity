// components/studio/VendorAdminDashboard.tsx
import { useCallback, useEffect, useState } from 'react'
import { useClient } from 'sanity'

interface Vendor {
  _id: string
  name?: string
  companyName?: string
  contactPerson?: string
  email?: string
  status?: string
  approved?: boolean
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
          name,
          companyName,
          contactPerson,
          email,
          status,
          approved,
          _createdAt
        } | order(_createdAt desc)`
      )
      .then(setVendors)
      .catch((err) => console.error('Failed to load vendors', err))
  }, [client])

  useEffect(() => {
    fetchVendors()
  }, [fetchVendors])

  const handleApproval = async (id: string, approved: boolean) => {
    try {
      await client
        .patch(id)
        .set({ approved, status: approved ? 'Approved' : 'Rejected' })
        .commit()
      fetchVendors()
    } catch (err) {
      console.error('Approval failed:', err)
    }
  }

  return (
    <div style={{ padding: '2rem' }}>
      <h1>Vendor Applications</h1>
      <table>
        <thead>
          <tr>
            <th>Business Name</th>
            <th>Contact</th>
            <th>Email</th>
            <th>Status</th>
            <th>Approved</th>
            <th>Submitted</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {vendors.map((vendor) => (
            <tr key={vendor._id}>
              <td>{vendor.companyName || vendor.name || 'N/A'}</td>
              <td>{vendor.contactPerson || 'N/A'}</td>
              <td>{vendor.email || 'N/A'}</td>
              <td>{vendor.status || 'N/A'}</td>
              <td>{vendor.approved ? 'Yes' : 'No'}</td>
              <td>{new Date(vendor._createdAt).toLocaleDateString()}</td>
              <td>
                <button onClick={() => handleApproval(vendor._id, true)}>Approve</button>
                <button onClick={() => handleApproval(vendor._id, false)}>Reject</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
