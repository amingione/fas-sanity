import React, { useEffect, useState } from 'react'
import { FormField } from 'sanity'
import { useId } from 'react'
import { Stack, Card } from '@sanity/ui'
import { PatchEvent, set, unset } from 'sanity'

type FetchRatesResponse = {
  title: string;
  value: string;
}[];

type ShipEngineServiceInputProps = {
  fetchRates: () => Promise<FetchRatesResponse>;
};

const ShipEngineServiceInput: React.FC<ShipEngineServiceInputProps> = ({ fetchRates }) => {
  const inputId = useId()
  const [options, setOptions] = useState<{ title: string; value: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [value, setValue] = useState<string>('')

  useEffect(() => {
    fetchRates()
      .then((services) => {
        if (!Array.isArray(services)) throw new Error('Invalid format')
        setOptions(services)
      })
      .catch((err) => {
        console.error('Error loading shipping services:', err)
        setOptions([])
      })
      .finally(() => setLoading(false))
  }, [fetchRates])

  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const val = event.target.value
    setValue(val)
  }

  return (
    <FormField
      description="Select a shipping service"
      title="Shipping Service"
      inputId={inputId}
    >
      <Stack space={2}>
        <Card padding={2} radius={2} shadow={1} tone="default">
          <select id={inputId} value={value || ''} onChange={handleChange} disabled={loading}>
            <option value="">Select a service...</option>
            {loading ? (
              <option disabled>Loading...</option>
            ) : (
              options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.title}
                </option>
              ))
            )}
          </select>
        </Card>
      </Stack>
    </FormField>
  )
}

export default ShipEngineServiceInput