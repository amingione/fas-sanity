import {CalendarIcon} from '@sanity/icons'
import {definePlugin} from 'sanity'

import CalendarApp from './CalendarApp'

export const calendarApp = definePlugin({
  name: 'fas-office-calendar',
  tools: [
    {
      name: 'office-calendar',
      title: 'Calendar',
      icon: CalendarIcon,
      component: CalendarApp,
    },
  ],
})

export default calendarApp
