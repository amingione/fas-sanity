import {CalendarIcon} from '@sanity/icons'
import {definePlugin} from 'sanity'
import type {Tool} from 'sanity'
import ContentCalendarTool from './tool/ContentCalendarTool'

export type CalendarCollectionConfig = {
  /** Human-readable label for the collection */
  title: string
  /** Sanity document type */
  type: string
  /** Field path that contains the scheduled date or datetime */
  dateField: string
  /** Optional field path used for the primary line of text */
  titleField?: string
  /** Optional field path used for a supporting line of text */
  subtitleField?: string
  /** Optional field path used to render a status badge */
  statusField?: string
}

export type ContentCalendarConfig = {
  collections: CalendarCollectionConfig[]
}

type PluginOptions = {
  config?: ContentCalendarConfig
  toolName?: string
  toolTitle?: string
}

export const contentCalendar = definePlugin<PluginOptions | void>((options) => {
  const config: ContentCalendarConfig = options?.config || {collections: []}
  const toolName = options?.toolName || 'content-calendar'
  const toolTitle = options?.toolTitle || 'Content calendar'

  return {
    name: 'content-calendar',
    tools: (prevTools: Tool[]) => {
      const calendarTool: Tool = {
        name: toolName,
        title: toolTitle,
        icon: CalendarIcon,
        component: () => <ContentCalendarTool collections={config.collections || []} />,
      }

      const hasTool = prevTools.some((tool) => tool.name === calendarTool.name)
      return hasTool ? prevTools : [...prevTools, calendarTool]
    },
  }
})

export type {ContentCalendarToolProps} from './tool/ContentCalendarTool'
