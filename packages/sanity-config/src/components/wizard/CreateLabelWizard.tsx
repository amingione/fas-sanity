import React from 'react'
import {Wizard} from './Wizard'
import {StepAddresses} from './steps/StepAddresses'
import {StepParcel} from './steps/StepParcel'
import {StepRates} from './steps/StepRates'
import {StepConfirm} from './steps/StepConfirm'

interface Order {
  _id: string
  _type: string
  customerName?: string
  customerEmail?: string
  customerPhone?: string
  shippingAddress?: {
    street1?: string
    street2?: string
    city?: string
    state?: string
    postalCode?: string
    country?: string
  }
  weightLbs?: number
  lengthIn?: number
  widthIn?: number
  heightIn?: number
}

interface CreateLabelWizardProps {
  order: Order
  orderId: string
  onComplete: () => void
}

function resolveNetlifyBase(): string {
  if (typeof window === 'undefined') return ''
  return window.location.origin
}

export const CreateLabelWizard: React.FC<CreateLabelWizardProps> = ({
  order,
  orderId,
  onComplete,
}) => {
  const initialState = {
    orderId,
    customer: {
      name: order.customerName || '',
      email: order.customerEmail || '',
      phone: order.customerPhone || '',
    },
    address: {
      street1: order.shippingAddress?.street1 || '',
      street2: order.shippingAddress?.street2 || '',
      city: order.shippingAddress?.city || '',
      state: order.shippingAddress?.state || '',
      postalCode: order.shippingAddress?.postalCode || '',
      country: order.shippingAddress?.country || 'US',
    },
    parcel: {
      weight: order.weightLbs || 1,
      length: order.lengthIn || 10,
      width: order.widthIn || 10,
      height: order.heightIn || 10,
    },
    selectedRate: null,
    rates: [],
  }

  return (
    <Wizard
      title="Create EasyPost Label"
      initialState={initialState}
      steps={[
        {
          id: 'addresses',
          title: 'Addresses',
          component: StepAddresses,
          validate: (state) => {
            if (!state.address.street1) return 'Street address is required'
            if (!state.address.city) return 'City is required'
            if (!state.address.state) return 'State is required'
            if (!state.address.postalCode) return 'Postal code is required'
            return null
          },
        },
        {
          id: 'parcel',
          title: 'Parcel',
          component: StepParcel,
          validate: (state) => {
            if (!state.parcel.weight || state.parcel.weight <= 0)
              return 'Weight must be greater than 0'
            return null
          },
        },
        {
          id: 'rates',
          title: 'Rates',
          component: StepRates,
          validate: (state) => {
            if (!state.selectedRate) return 'Please select a shipping rate'
            return null
          },
        },
        {
          id: 'confirm',
          title: 'Confirm & Buy Label',
          component: StepConfirm,
        },
      ]}
      onFinish={async (finalState) => {
        const base = resolveNetlifyBase()

        const res = await fetch(`${base}/.netlify/functions/easypostCreateLabel`, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({...finalState, source: 'sanity-manual'}),
        })

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}))
          throw new Error(errorData.message || 'Failed to create label')
        }

        const result = await res.json()

        if (result?.labelUrl) {
          window.open(result.labelUrl, '_blank')
        }

        onComplete()
      }}
    />
  )
}
