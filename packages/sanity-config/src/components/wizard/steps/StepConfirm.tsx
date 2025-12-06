import React from 'react'
import {Stack, Card, Text, Flex, Box} from '@sanity/ui'

interface StepConfirmProps {
  state: any
}

export const StepConfirm: React.FC<StepConfirmProps> = ({state}) => {
  return (
    <Stack space={4}>
      <Text size={2} weight="semibold">
        Confirm Label Purchase
      </Text>

      <Card padding={4} radius={2} tone="transparent" border>
        <Stack space={3}>
          <Box>
            <Text size={1} muted>
              Recipient
            </Text>
            <Text>
              {state.address.street1}
              {state.address.street2 && `, ${state.address.street2}`}
            </Text>
            <Text>
              {state.address.city}, {state.address.state} {state.address.postalCode}
            </Text>
          </Box>

          <Box>
            <Text size={1} muted>
              Parcel
            </Text>
            <Text>
              {state.parcel.weight} lbs
              {state.parcel.length &&
                ` - ${state.parcel.length}x${state.parcel.width}x${state.parcel.height}"`}
            </Text>
          </Box>

          {state.selectedRate && (
            <Box>
              <Text size={1} muted>
                Selected Service
              </Text>
              <Flex justify="space-between">
                <Text>
                  {state.selectedRate.carrier} - {state.selectedRate.service}
                </Text>
                <Text weight="bold">${state.selectedRate.rate}</Text>
              </Flex>
            </Box>
          )}
        </Stack>
      </Card>

      <Card tone="caution" padding={3}>
        <Text size={1}>
          Warning: Clicking &quot;Finish&quot; will purchase this label and charge your EasyPost account.
        </Text>
      </Card>
    </Stack>
  )
}
