import React from 'react'

interface VendorStatusBadgeProps {
  document: {
    displayed: {
      status?: string
      approved?: boolean
    }
  }
}

const badgeStyle = {
  padding: '4px 8px',
  borderRadius: '6px',
  fontWeight: 600,
  fontSize: '0.8rem',
  display: 'inline-block',
  marginRight: '0.5rem',
}

const VendorStatusBadge: React.FC<VendorStatusBadgeProps> = ({document}) => {
  const {status = 'Unknown', approved = false} = document?.displayed || {}

  const statusColor =
    status === 'Approved' ? '#16a34a' : status === 'Rejected' ? '#dc2626' : '#f59e0b'
  const approvalColor = approved ? '#16a34a' : '#9ca3af'

  return (
    <div style={{display: 'flex', gap: '0.5rem', alignItems: 'center'}}>
      <span style={{...badgeStyle, backgroundColor: statusColor, color: 'white'}}>
        Status: {status}
      </span>
      <span style={{...badgeStyle, backgroundColor: approvalColor, color: 'white'}}>
        {approved ? '✅ Approved' : '🕓 Not Approved'}
      </span>
    </div>
  )
}

export default VendorStatusBadge
