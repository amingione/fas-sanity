import {useEffect, useMemo, useState} from 'react'
import {useClient} from 'sanity'
import {useRouter} from 'sanity/router'
import {
  Badge,
  Box,
  Button,
  Card,
  Flex,
  Heading,
  Spinner,
  Stack,
  Text,
} from '@sanity/ui'
import {format, isValid, parseISO} from 'date-fns'
import type {CalendarCollectionConfig} from '../index'

type CollectionKey = string

type RawCalendarDocument = {
  _id: string
  _type: string
  date?: string | Date | null
  title?: string | null
  subtitle?: string | null
  status?: string | null
}

type CalendarEvent = RawCalendarDocument & {
  collection: CalendarCollectionConfig
  parsedDate: Date
  hasTime: boolean
}

const dateKey = (collection: CalendarCollectionConfig): CollectionKey =>
  [collection.type, collection.dateField, collection.titleField, collection.subtitleField, collection.statusField]
    .filter(Boolean)
    .join('|')

const buildProjection = (collection: CalendarCollectionConfig) => {
  const projection: string[] = ['_id', '_type', `${collection.dateField} as date`]
  if (collection.titleField) {
    projection.push(`${collection.titleField} as title`)
  } else {
    const fallback = JSON.stringify(collection.title)
    projection.push(`coalesce(title, name, ${fallback}) as title`)
  }
  if (collection.subtitleField) {
    projection.push(`${collection.subtitleField} as subtitle`)
  }
  if (collection.statusField) {
    projection.push(`${collection.statusField} as status`)
  }
  return projection.join(',\n  ')
}

const buildQuery = (collection: CalendarCollectionConfig) => `
  *[_type == "${collection.type}" && defined(${collection.dateField})] {
    ${buildProjection(collection)}
  } | order(date asc)
`

const parseDate = (value: string | Date | null | undefined): {date: Date | null; hasTime: boolean} => {
  if (!value) return {date: null, hasTime: false}
  if (value instanceof Date) {
    return isValid(value) ? {date: value, hasTime: true} : {date: null, hasTime: false}
  }
  if (typeof value === 'string') {
    const hasTime = value.includes('T')
    let parsed = parseISO(value)
    if (!isValid(parsed)) {
      const fallback = new Date(value)
      parsed = isValid(fallback) ? fallback : new Date('')
    }
    return isValid(parsed) ? {date: parsed, hasTime} : {date: null, hasTime: false}
  }
  return {date: null, hasTime: false}
}

const formatDateHeading = (value: Date) => format(value, 'EEEE, MMMM d, yyyy')

const formatTime = (value: Date, hasTime: boolean) => (hasTime ? format(value, 'p') : 'All day')

const uniqueCollections = (collections: CalendarCollectionConfig[]): CalendarCollectionConfig[] => {
  const seen = new Set<string>()
  return collections.filter((collection) => {
    const key = dateKey(collection)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export type ContentCalendarToolProps = {
  collections: CalendarCollectionConfig[]
}

const ContentCalendarTool = ({collections}: ContentCalendarToolProps) => {
  const client = useClient({apiVersion: '2024-10-01'})
  const router = useRouter()
  const normalizedCollections = useMemo(() => uniqueCollections(collections), [collections])

  const [eventsByCollection, setEventsByCollection] = useState<Record<CollectionKey, CalendarEvent[]>>({})
  const [pending, setPending] = useState<Set<CollectionKey>>(new Set())
  const [errors, setErrors] = useState<Record<CollectionKey, string>>({})

  useEffect(() => {
    let disposed = false
    const subscriptions: Array<() => void> = []

    const fetchCollection = async (collection: CalendarCollectionConfig) => {
      const key = dateKey(collection)
      setPending((prev) => {
        const next = new Set(prev)
        next.add(key)
        return next
      })
      try {
        const query = buildQuery(collection)
        const docs: RawCalendarDocument[] = await client.fetch(query)
        if (disposed) return
        const mapped = docs
          .map((doc) => {
            const {date, hasTime} = parseDate(doc.date ?? null)
            if (!date) return null
            return {
              ...doc,
              collection,
              parsedDate: date,
              hasTime,
            } satisfies CalendarEvent
          })
          .filter(Boolean) as CalendarEvent[]
        setEventsByCollection((prev) => ({
          ...prev,
          [key]: mapped,
        }))
        setErrors((prev) => {
          if (!prev[key]) return prev
          const {[key]: _removed, ...rest} = prev
          return rest
        })
      } catch (err) {
        console.error('Failed to load calendar collection', collection.type, err)
        setErrors((prev) => ({
          ...prev,
          [key]: err instanceof Error ? err.message : 'Unknown error',
        }))
      } finally {
        if (!disposed) {
          setPending((prev) => {
            const next = new Set(prev)
            next.delete(key)
            return next
          })
        }
      }
    }

    normalizedCollections.forEach((collection) => {
      const query = buildQuery(collection)
      fetchCollection(collection)
      const subscription = client
        .listen(query, {}, {visibility: 'query', tag: 'content-calendar'})
        .subscribe({
          next: () => fetchCollection(collection),
          error: (err) => {
            console.error('Calendar listener error', err)
            const key = dateKey(collection)
            setErrors((prev) => ({
              ...prev,
              [key]: err instanceof Error ? err.message : 'Unknown error',
            }))
          },
        })
      subscriptions.push(() => subscription.unsubscribe())
    })

    return () => {
      disposed = true
      subscriptions.forEach((unsubscribe) => unsubscribe())
    }
  }, [client, normalizedCollections])

  const allEvents = useMemo(() => {
    const merged: CalendarEvent[] = []
    for (const [key, items] of Object.entries(eventsByCollection)) {
      const collection = normalizedCollections.find((col) => dateKey(col) === key)
      if (!collection) continue
      merged.push(
        ...items
          .map((item) => ({...item, collection}))
          .filter((item) => item.parsedDate && isValid(item.parsedDate)),
      )
    }
    return merged.sort((a, b) => a.parsedDate.getTime() - b.parsedDate.getTime())
  }, [eventsByCollection, normalizedCollections])

  const grouped = useMemo(() => {
    const groups = new Map<string, {date: Date; hasTime: boolean; events: CalendarEvent[]}>()
    allEvents.forEach((event) => {
      const key = format(event.parsedDate, 'yyyy-MM-dd')
      if (!groups.has(key)) {
        groups.set(key, {date: event.parsedDate, hasTime: event.hasTime, events: []})
      }
      const group = groups.get(key)!
      group.events.push(event)
      group.hasTime = group.hasTime || event.hasTime
    })
    return Array.from(groups.values()).sort((a, b) => a.date.getTime() - b.date.getTime())
  }, [allEvents])

  const isLoading = pending.size > 0 && allEvents.length === 0
  const hasCollections = normalizedCollections.length > 0
  const uniqueErrors = Object.values(errors)

  return (
    <Box padding={4} style={{height: '100%', overflowY: 'auto'}}>
      <Stack space={4}>
        <Box>
          <Heading as="h1" size={2}>
            Content calendar
          </Heading>
          <Text muted size={1}>
            Track scheduled orders, invoices, and freight activities across your workspace.
          </Text>
        </Box>

        {!hasCollections && (
          <Card padding={4} tone="caution">
            <Stack space={3}>
              <Heading size={1}>No calendar collections configured</Heading>
              <Text size={1}>
                Add at least one collection to <code>config/content-calendar.json</code> to display
                scheduled documents.
              </Text>
            </Stack>
          </Card>
        )}

        {isLoading && (
          <Flex align="center" gap={3}>
            <Spinner />
            <Text size={1}>Loading calendar…</Text>
          </Flex>
        )}

        {uniqueErrors.length > 0 && (
          <Card padding={4} tone="critical">
            <Stack space={3}>
              <Heading size={1}>Calendar errors</Heading>
              {uniqueErrors.map((message, index) => (
                <Text key={index} size={1}>
                  {message}
                </Text>
              ))}
            </Stack>
          </Card>
        )}

        {!isLoading && allEvents.length === 0 && hasCollections && uniqueErrors.length === 0 && (
          <Card padding={4} tone="transparent" border>
            <Text size={1}>Nothing scheduled yet. Documents will appear here once they include dates.</Text>
          </Card>
        )}

        {grouped.map((group) => (
          <Card key={group.date.toISOString()} padding={4} radius={3} shadow={1}>
            <Stack space={3}>
              <Heading size={1}>{formatDateHeading(group.date)}</Heading>
              <Stack space={3}>
                {group.events.map((event) => (
                  <Card key={event._id} padding={3} radius={2} border>
                    <Stack space={3}>
                      <Flex align="center" justify="space-between">
                        <Text weight="semibold">{event.title || 'Untitled document'}</Text>
                        <Badge tone="primary" mode="outline">
                          {event.collection.title}
                        </Badge>
                      </Flex>
                      {event.subtitle && (
                        <Text size={1} muted>
                          {event.subtitle}
                        </Text>
                      )}
                      <Flex align="center" gap={3}>
                        <Badge tone="default" mode="outline">
                          {formatTime(event.parsedDate, event.hasTime)}
                        </Badge>
                        {event.status && (
                          <Badge tone="positive" mode="outline">
                            {event.status}
                          </Badge>
                        )}
                      </Flex>
                      <Flex>
                        <Button
                          text="Open document"
                          mode="ghost"
                          tone="primary"
                          onClick={() => router.navigateIntent('edit', {id: event._id, type: event._type})}
                        />
                      </Flex>
                    </Stack>
                  </Card>
                ))}
              </Stack>
            </Stack>
          </Card>
        ))}
      </Stack>
    </Box>
  )
}

export default ContentCalendarTool
