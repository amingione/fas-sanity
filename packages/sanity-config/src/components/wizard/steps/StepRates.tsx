import React, {useEffect, useState} from 'react'
import {Stack, Card, Text, Flex, Spinner, Box} from '@sanity/ui'

interface Rate {
  id: string
  carrier: string
  service: string
  rate: string
  delivery_days: number | null
}

interface StepRatesProps {
  state: any
  setState: (updater: (prev: any) => any) => void
}

function resolveNetlifyBase(): string {
  if (typeof window === 'undefined') return ''
  return window.location.origin
}

export const StepRates: React.FC<StepRatesProps> = ({state, setState}) => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchRates = async () => {
      setLoading(true)
      setError(null)

      try {
        const base = resolveNetlifyBase()
        const res = await fetch(`${base}/.netlify/functions/easypostGetRates`, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            address: state.address,
            parcel: state.parcel,
          }),
        })

        if (!res.ok) {
          throw new Error('Failed to fetch rates')
        }

        const data = await res.json()
        setState((prev) => ({...prev, rates: data.rates || []}))
      } catch (err: any) {
        setError(err.message || 'Failed to load rates')
      } finally {
        setLoading(false)
      }
    }

    fetchRates()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const selectRate = (rate: Rate) => {
    setState((prev) => ({...prev, selectedRate: rate}))
  }

  if (loading) {
    return (
      <Flex align="center" justify="center" padding={6}>
        <Spinner />
      </Flex>
    )
  }

  if (error) {
    return (
      <Card tone="critical" padding={4}>
        <Text>{error}</Text>
      </Card>
    )
  }

  return (
    <Stack space={4}>
      <Text size={2} weight="semibold">
        Select Shipping Rate
      </Text>

      {state.rates.length === 0 && (
        <Card tone="caution" padding={4}>
          <Text>No rates available</Text>
        </Card>
      )}

      {state.rates.map((rate: Rate) => (
        <Card
          key={rate.id}
          padding={4}
          radius={2}
          shadow={1}
          tone={state.selectedRate?.id === rate.id ? 'primary' : 'default'}
          as="button"
          onClick={() => selectRate(rate)}
        >
          <Flex justify="space-between" align="center">
            <Box>
              <Text weight="semibold">
                {rate.carrier} - {rate.service}
              </Text>
              <Text size={1} muted>
                {rate.delivery_days ? `${rate.delivery_days} days` : 'Delivery time varies'}
              </Text>
            </Box>
            <Text size={3} weight="bold">
              ${rate.rate}
            </Text>
          </Flex>
        </Card>
      ))}
    </Stack>
  )
}
