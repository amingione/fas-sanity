import React from 'react'
import {Badge} from '@sanity/ui'
import {CheckmarkCircleIcon} from '@sanity/icons'

export interface RecoveredCartBadgeProps {
  status?: string | null
}

export const RecoveredCartBadge: React.FC<RecoveredCartBadgeProps> = ({status}) => {
  if (status !== 'recovered') {
    return null
  }

  return (
    <Badge tone="positive" mode="outline">
      <CheckmarkCircleIcon style={{marginRight: 4}} />
      Recovered
    </Badge>
  )
}

export default RecoveredCartBadge
