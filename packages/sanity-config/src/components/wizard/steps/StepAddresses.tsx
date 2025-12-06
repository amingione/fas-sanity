import React from 'react'
import {Stack, TextInput, Text} from '@sanity/ui'

interface StepAddressesProps {
  state: any
  setState: (updater: (prev: any) => any) => void
}

export const StepAddresses: React.FC<StepAddressesProps> = ({state, setState}) => {
  const updateAddress = (field: string, value: string) => {
    setState((prev) => ({
      ...prev,
      address: {
        ...prev.address,
        [field]: value,
      },
    }))
  }

  return (
    <Stack space={4}>
      <Text size={2} weight="semibold">
        Recipient Address
      </Text>

      <TextInput
        placeholder="Street Address"
        value={state.address.street1}
        onChange={(e) => updateAddress('street1', e.currentTarget.value)}
      />

      <TextInput
        placeholder="Apt/Suite (optional)"
        value={state.address.street2}
        onChange={(e) => updateAddress('street2', e.currentTarget.value)}
      />

      <TextInput
        placeholder="City"
        value={state.address.city}
        onChange={(e) => updateAddress('city', e.currentTarget.value)}
      />

      <TextInput
        placeholder="State (e.g., CA)"
        value={state.address.state}
        onChange={(e) => updateAddress('state', e.currentTarget.value)}
        maxLength={2}
      />

      <TextInput
        placeholder="Postal Code"
        value={state.address.postalCode}
        onChange={(e) => updateAddress('postalCode', e.currentTarget.value)}
      />

      <TextInput
        placeholder="Country (e.g., US)"
        value={state.address.country}
        onChange={(e) => updateAddress('country', e.currentTarget.value)}
        maxLength={2}
      />
    </Stack>
  )
}
