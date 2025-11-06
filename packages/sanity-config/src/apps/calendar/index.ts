import {CalendarIcon} from '@sanity/icons'
import {definePlugin} from 'sanity'
import type {ComponentType} from 'react'

import CalendarApp from './CalendarApp'

export const calendarApp = definePlugin({
  name: 'fas-calendar-app',
  tools: [
    {
      name: 'calendar-app',
      title: 'Appointments',
      icon: CalendarIcon,
      component: CalendarApp as unknown as ComponentType<{tool: any}>,
    },
  ],
})

export default calendarApp
