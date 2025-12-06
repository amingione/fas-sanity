import React, {useEffect, useState} from 'react'
import {TextInput, Button, Stack, Flex, Card} from '@sanity/ui'
import {useRouter} from 'sanity/router'
import {SearchIcon, AddIcon} from '@sanity/icons'
import {useClient} from 'sanity'

interface PickupsPanelProps {
  [key: string]: any
}

type PickupListItem = {
  _id: string
  _type: 'pickup'
  title?: string
  carrier?: string
  status?: string
  confirmation?: string
}

const PickupsPanel = React.forwardRef<HTMLDivElement, PickupsPanelProps>((_props, ref) => {
  const router = useRouter()
  const client = useClient({apiVersion: '2024-10-01'})
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<PickupListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const handleSchedulePickup = () => {
    router.navigateIntent('create', {
      type: 'schedulePickup',
    })
  }

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const results = await client.fetch<PickupListItem[]>(
          query
            ? `*[_type == "pickup" && (
              carrier match $q ||
              status match $q ||
              confirmation match $q
            )] | order(_updatedAt desc)[0...50]`
            : `*[_type == "pickup"] | order(_updatedAt desc)[0...50]`,
          {q: `${query}*`},
        )
        if (!cancelled) setItems(results)
      } catch (err) {
        if (!cancelled) setError(err as Error)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [client, query])

  return (
    <Stack ref={ref} space={4} padding={4}>
      <Flex gap={3} align="center">
        <Card flex={1}>
          <TextInput
            icon={SearchIcon}
            placeholder="Search pickups by carrier, status, confirmation..."
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
          />
        </Card>

        <Button
          tone="primary"
          text="Schedule Pickup"
          icon={AddIcon}
          onClick={handleSchedulePickup}
        />
      </Flex>

      <Card>
        {isLoading && <div>Loading pickups...</div>}
        {error && <div>Error loading pickups: {error.message}</div>}
        {!isLoading && !error && items.length === 0 && <div>No pickups found</div>}
        {items.length > 0 && (
          <Stack space={2}>
            {items.map((item) => {
              const label =
                item.title || item.confirmation || item.carrier || item.status || item._id
              return (
                <Card
                  key={item._id}
                  padding={3}
                  radius={2}
                  shadow={1}
                  as="button"
                  onClick={() => {
                    router.navigateIntent('edit', {
                      id: item._id,
                      type: 'pickup',
                    })
                  }}
                >
                  <div>{label}</div>
                </Card>
              )
            })}
          </Stack>
        )}
      </Card>
    </Stack>
  )
})

PickupsPanel.displayName = 'PickupsPanel'

export default PickupsPanel
