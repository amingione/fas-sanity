import React from 'react'
import {useFormValue, set, PatchEvent} from 'sanity'
import {Stack, Card, Text, Select} from '@sanity/ui'

const statusOptions = ['Draft', 'Sent', 'Approved', 'Invoiced', 'Cancelled']

export default function QuoteStatusWithTimeline(props: any) {
  const currentTimeline = useFormValue(['timeline']) || []
  const currentStatus = props.value

  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newStatus = event.target.value

    const timestamp = new Date().toISOString()
    const newEntry = {
      _type: 'object',
      action: `Status changed to ${newStatus}`,
      timestamp,
    }

    const updatedTimeline = [...(currentTimeline as any[]), newEntry]

    props.onChange(PatchEvent.from([set(newStatus), set(updatedTimeline, ['timeline'])]))
  }

  return (
    <Stack space={3}>
      <Card padding={3} shadow={1} radius={2}>
        <Text size={1}>Quote Status</Text>
        <Select value={currentStatus} onChange={handleChange}>
          {statusOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
      </Card>
    </Stack>
  )
}
