import {CalendarIcon} from '@sanity/icons'
import {definePlugin} from 'sanity'

import CalendarApp from './CalendarApp'

export const calendarApp = definePlugin({
  name: 'fas-calendar-app',
  tools: [
    {
      name: 'calendar-app',
      title: 'Calendar',
      icon: CalendarIcon,
      component: CalendarApp,
    },
  ],
})

export default calendarApp
