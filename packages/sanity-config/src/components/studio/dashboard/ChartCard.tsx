import React from 'react'
import {Card, Flex, Spinner, Stack, Text} from '@sanity/ui'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

const DEFAULT_COLORS = ['#2563eb', '#7c3aed', '#f97316', '#0ea5e9', '#059669', '#f43f5e']

type ChartCardProps = {
  title: string
  type: 'bar' | 'line' | 'pie'
  data: Array<Record<string, any>>
  categoryKey?: string
  valueKey?: string
  dataKeys?: string[]
  colors?: string[]
  height?: number
  formatValue?: (value: number) => string
  actions?: React.ReactNode
  isLoading?: boolean
  error?: string | null
  emptyState?: string
}

export function ChartCard({
  title,
  type,
  data,
  categoryKey = 'label',
  valueKey = 'value',
  dataKeys,
  colors = DEFAULT_COLORS,
  height = 280,
  formatValue,
  actions,
  isLoading,
  error,
  emptyState = 'No data available',
}: ChartCardProps) {
  const resolvedKeys = dataKeys?.length ? dataKeys : [valueKey]
  const valueFormatter = (value: number) => (formatValue ? formatValue(value) : value)

  const renderChart = () => {
    if (data.length === 0) {
      return (
        <Flex align="center" justify="center" style={{height: height - 40}}>
          <Text muted>{emptyState}</Text>
        </Flex>
      )
    }

    switch (type) {
      case 'pie':
        return (
          <ResponsiveContainer width="100%" height={height}>
            <PieChart>
              <Tooltip formatter={valueFormatter as any} />
              <Legend />
              <Pie data={data} dataKey={valueKey} nameKey={categoryKey} label>
                {data.map((entry, index) => (
                  <Cell key={entry[categoryKey] ?? index} fill={colors[index % colors.length]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        )
      case 'line':
        return (
          <ResponsiveContainer width="100%" height={height}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={categoryKey} />
              <YAxis />
              <Tooltip formatter={valueFormatter as any} />
              {resolvedKeys.length > 1 && <Legend />}
              {resolvedKeys.map((key, index) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={colors[index % colors.length]}
                  strokeWidth={3}
                  dot={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )
      default:
        return (
          <ResponsiveContainer width="100%" height={height}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={categoryKey} />
              <YAxis />
              <Tooltip formatter={valueFormatter as any} />
              {resolvedKeys.length > 1 && <Legend />}
              {resolvedKeys.map((key, index) => (
                <Bar key={key} dataKey={key} fill={colors[index % colors.length]} radius={4} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )
    }
  }

  return (
    <Card padding={4} radius={3} shadow={1}>
      <Stack space={4}>
        <Flex align="center" justify="space-between">
          <Text weight="semibold">{title}</Text>
          {actions}
        </Flex>
        {error ? (
          <Text tone="critical">{error}</Text>
        ) : isLoading ? (
          <Flex align="center" justify="center" style={{height}}>
            <Spinner muted />
          </Flex>
        ) : (
          renderChart()
        )}
      </Stack>
    </Card>
  )
}

export default ChartCard
