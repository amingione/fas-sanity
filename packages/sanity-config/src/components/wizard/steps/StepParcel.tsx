import React from 'react'
import {Stack, TextInput, Text, Grid} from '@sanity/ui'

interface StepParcelProps {
  state: any
  setState: (updater: (prev: any) => any) => void
}

export const StepParcel: React.FC<StepParcelProps> = ({state, setState}) => {
  const updateParcel = (field: string, value: number) => {
    setState((prev) => ({
      ...prev,
      parcel: {
        ...prev.parcel,
        [field]: value,
      },
    }))
  }

  return (
    <Stack space={4}>
      <Text size={2} weight="semibold">
        Parcel Dimensions
      </Text>

      <TextInput
        type="number"
        placeholder="Weight (lbs)"
        value={state.parcel.weight}
        onChange={(e) => updateParcel('weight', parseFloat(e.currentTarget.value) || 0)}
        step="0.1"
        min="0.1"
      />

      <Grid columns={3} gap={3}>
        <TextInput
          type="number"
          placeholder="Length (in)"
          value={state.parcel.length}
          onChange={(e) => updateParcel('length', parseFloat(e.currentTarget.value) || 0)}
          step="0.1"
          min="0.1"
        />

        <TextInput
          type="number"
          placeholder="Width (in)"
          value={state.parcel.width}
          onChange={(e) => updateParcel('width', parseFloat(e.currentTarget.value) || 0)}
          step="0.1"
          min="0.1"
        />

        <TextInput
          type="number"
          placeholder="Height (in)"
          value={state.parcel.height}
          onChange={(e) => updateParcel('height', parseFloat(e.currentTarget.value) || 0)}
          step="0.1"
          min="0.1"
        />
      </Grid>
    </Stack>
  )
}
