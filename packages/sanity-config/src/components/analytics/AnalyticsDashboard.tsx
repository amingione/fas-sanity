import React, {useEffect, useMemo, useState} from 'react'
import {useClient} from 'sanity'
import {
  Card,
  Flex,
  Stack,
  Text,
  Heading,
  Button,
  Select,
  Inline,
  Spinner,
  Box,
} from '@sanity/ui'
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts'

type Shipment = {
  _id: string
  createdAt: string
  rate?: number
  carrier?: string
  service?: string
  transitDays?: number
}

type GroupBy = 'date' | 'week' | 'month' | 'year'
type TimePeriod = '4w' | '8w' | '12w' | '26w' | '52w'

const API_VERSION = '2023-01-01'

function startDateForPeriod(period: TimePeriod): Date {
  const weeks =
    period === '4w'
      ? 4
      : period === '8w'
        ? 8
        : period === '12w'
          ? 12
          : period === '26w'
            ? 26
            : 52

  const d = new Date()
  d.setDate(d.getDate() - weeks * 7)
  return d
}

function formatKey(d: Date, groupBy: GroupBy): string {
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  const day = d.getDate()

  if (groupBy === 'date')
    return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`

  if (groupBy === 'month') return `${y}-${String(m).padStart(2, '0')}`

  if (groupBy === 'year') return `${y}`

  const temp = new Date(d)
  temp.setHours(0, 0, 0, 0)
  temp.setDate(temp.getDate() + 3 - ((temp.getDay() + 6) % 7))
  const week1 = new Date(temp.getFullYear(), 0, 4)
  const week =
    1 +
    Math.round(
      ((temp.getTime() - week1.getTime()) / 86400000 -
        3 +
        ((week1.getDay() + 6) % 7)) /
        7,
    )
  return `${temp.getFullYear()}-W${String(week).padStart(2, '0')}`
}

const AnalyticsDashboard = React.forwardRef<HTMLDivElement>((_props, ref) => {
  const client = useClient({apiVersion: API_VERSION})
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [timePeriod, setTimePeriod] = useState<TimePeriod>('8w')
  const [groupBy, setGroupBy] = useState<GroupBy>('week')
  const [carrier, setCarrier] = useState<string>('any')
  const [service, setService] = useState<string>('any')

  useEffect(() => {
    setLoading(true)
    setError(null)

    client
      .fetch<Shipment[]>(
        `*[_type == "shipment" && defined(createdAt)]{
          _id,
          createdAt,
          rate,
          carrier,
          service,
          transitDays
        } | order(createdAt desc)`,
      )
      .then((res) => setShipments(res))
      .catch((err) => {
        console.error('Failed to fetch shipments:', err)
        setError('Failed to load shipment data')
      })
      .finally(() => setLoading(false))
  }, [client])

  const {metricCards, chartData} = useMemo(() => {
    const start = startDateForPeriod(timePeriod)

    const filtered = shipments.filter((s) => {
      const d = new Date(s.createdAt)
      if (d < start) return false

      if (carrier !== 'any' && s.carrier !== carrier) return false
      if (service !== 'any' && s.service !== service) return false

      return true
    })

    const totalSpend = filtered.reduce((sum, s) => sum + (s.rate ?? 0), 0)
    const labels = filtered.length
    const cpp = labels > 0 ? totalSpend / labels : 0

    const transitVals = filtered
      .map((s) => s.transitDays)
      .filter((n): n is number => typeof n === 'number')

    const avgTransit =
      transitVals.length > 0
        ? transitVals.reduce((a, b) => a + b, 0) / transitVals.length
        : 0

    const buckets: Record<string, {totalSpend: number; labels: number}> = {}

    for (const s of filtered) {
      const key = formatKey(new Date(s.createdAt), groupBy)
      if (!buckets[key]) buckets[key] = {totalSpend: 0, labels: 0}

      buckets[key].totalSpend += s.rate ?? 0
      buckets[key].labels++
    }

    const chart = Object.entries(buckets)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, data]) => ({
        period,
        totalSpend: Number(data.totalSpend.toFixed(2)),
        cpp: data.labels > 0 ? Number((data.totalSpend / data.labels).toFixed(2)) : 0,
      }))

    return {
      metricCards: {
        totalSpend,
        labels,
        cpp,
        avgTransit,
      },
      chartData: chart,
    }
  }, [shipments, timePeriod, groupBy, carrier, service])

  const carriers = Array.from(new Set(shipments.map((s) => s.carrier).filter(Boolean)))
  const services = Array.from(new Set(shipments.map((s) => s.service).filter(Boolean)))

  if (loading) {
    return (
      <Flex align="center" justify="center" padding={6}>
        <Spinner />
      </Flex>
    )
  }

  if (error) {
    return (
      <Box padding={4}>
        <Card tone="critical" padding={4}>
          <Text>{error}</Text>
        </Card>
      </Box>
    )
  }

  return (
    <Stack ref={ref} space={4} padding={4}>
      <Heading size={3}>Shipping Analytics</Heading>

      <Flex gap={3} wrap="wrap" align="center">
        <Select
          value={timePeriod}
          onChange={(e) => setTimePeriod(e.currentTarget.value as TimePeriod)}
        >
          <option value="4w">Last 4 weeks</option>
          <option value="8w">Last 8 weeks</option>
          <option value="12w">Last 12 weeks</option>
          <option value="26w">Last 6 months</option>
          <option value="52w">Last 12 months</option>
        </Select>

        <Select value={carrier} onChange={(e) => setCarrier(e.currentTarget.value)}>
          <option value="any">Any Carrier</option>
          {carriers.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>

        <Select value={service} onChange={(e) => setService(e.currentTarget.value)}>
          <option value="any">Any Service</option>
          {services.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>

        <Text muted size={1}>
          Updated just now
        </Text>
      </Flex>

      <Inline space={2}>
        <Text weight="semibold" size={1}>
          Group By:
        </Text>
        {(['date', 'week', 'month', 'year'] as GroupBy[]).map((g) => (
          <Button
            key={g}
            mode={groupBy === g ? 'default' : 'ghost'}
            text={g.charAt(0).toUpperCase() + g.slice(1)}
            onClick={() => setGroupBy(g)}
            fontSize={1}
          />
        ))}
      </Inline>

      <Flex gap={3} wrap="wrap">
        <Card padding={4} radius={2} shadow={1} flex={1} style={{minWidth: 200}}>
          <Stack space={2}>
            <Text muted size={1}>
              Total Rated Spend
            </Text>
            <Heading size={2}>${metricCards.totalSpend.toFixed(2)}</Heading>
          </Stack>
        </Card>

        <Card padding={4} radius={2} shadow={1} flex={1} style={{minWidth: 200}}>
          <Stack space={2}>
            <Text muted size={1}>Labels Purchased</Text>
            <Heading size={2}>{metricCards.labels}</Heading>
          </Stack>
        </Card>

        <Card padding={4} radius={2} shadow={1} flex={1} style={{minWidth: 200}}>
          <Stack space={2}>
            <Text muted size={1}>Cost per Package</Text>
            <Heading size={2}>${metricCards.cpp.toFixed(2)}</Heading>
          </Stack>
        </Card>

        <Card padding={4} radius={2} shadow={1} flex={1} style={{minWidth: 200}}>
          <Stack space={2}>
            <Text muted size={1}>Average Transit Days</Text>
            <Heading size={2}>{metricCards.avgTransit.toFixed(1)}</Heading>
          </Stack>
        </Card>
      </Flex>

      <Card padding={4} radius={2} shadow={1} style={{height: 400}}>
        <Stack space={3}>
          <Heading size={1}>Total Spend and Cost per Package</Heading>

          <Box style={{height: 340}}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period" />
                <YAxis yAxisId="left" />
                <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => `$${v}`} />
                <Tooltip />
                <Legend />
                <Bar dataKey="totalSpend" yAxisId="left" fill="#001F45" name="Total Spend" />
                <Line
                  type="monotone"
                  dataKey="cpp"
                  yAxisId="right"
                  stroke="#47C2A3"
                  strokeWidth={2}
                  name="Cost per Package"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </Box>
        </Stack>
      </Card>
    </Stack>
  )
})

AnalyticsDashboard.displayName = 'AnalyticsDashboard'

export default AnalyticsDashboard
