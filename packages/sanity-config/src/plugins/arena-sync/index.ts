import {definePlugin} from 'sanity'
import {ArenaSyncTool} from './ArenaSyncTool'

export const arenaSyncPlugin = definePlugin(() => ({
  name: 'arena-sync-tool',
  title: 'Are.na Sync',
  tools: [
    {
      name: 'arena-sync',
      title: 'Are.na Sync',
      component: ArenaSyncTool,
    },
  ],
}))
