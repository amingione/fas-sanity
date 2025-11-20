import React from 'react'
import {Box} from '@sanity/ui'
import HomeDashboard from './HomeDashboard'

const HomePane = React.forwardRef<HTMLDivElement, Record<string, never>>((_props, ref) => {
  return (
    <Box ref={ref} style={{minHeight: '100%'}}>
      <HomeDashboard />
    </Box>
  )
})

HomePane.displayName = 'HomePane'

export default HomePane
