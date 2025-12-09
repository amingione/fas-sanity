import {definePlugin} from 'sanity'
import {DatabaseIcon} from '@sanity/icons'
import {AutoMapperSuiteTool} from '../autoMapper/ui/AutoMapperSuiteTool'

export const autoMapperPlugin = definePlugin({
  name: 'auto-mapper',
  tools: [
    {
      name: 'auto-mapper',
      title: 'Auto Mapper Suite',
      icon: DatabaseIcon,
      component: AutoMapperSuiteTool,
    },
  ],
})
