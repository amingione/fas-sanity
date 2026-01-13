import {PatchEvent, defineType, set} from 'sanity'
import React from 'react'
import EasyPostServiceInput from '../../components/EasyPostServiceInput'
import {Button, Card, Stack, Text} from '@sanity/ui'

interface EasyPostFieldProps {
  value: string
  onChange: (event: PatchEvent) => void
  type: any
  markers: any
  presence: any
  compareValue: any
  document: any
}

function CustomEasyPostServiceField(props: EasyPostFieldProps) {
  const [rates, setRates] = React.useState<{title: string; value: string; amount: number}[]>([])
  const [showOptions, setShowOptions] = React.useState(false)

  const {customerAddress, packageDetails, shippingType} = props.document || {}

  const isComplete =
    shippingType &&
    customerAddress?.address_line1 &&
    customerAddress?.city_locality &&
    customerAddress?.state_province &&
    customerAddress?.postal_code &&
    customerAddress?.country_code &&
    packageDetails?.weight?.value &&
    packageDetails?.dimensions?.length

  const fetchAllRates = React.useCallback(async () => {
    if (!isComplete) return

    const payload = {
      ship_to: customerAddress,
      package_details: packageDetails,
    }

    try {
      const res = await fetch('/.netlify/functions/getEasyPostRates', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload),
      })

      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`)
      const data = await res.json()
      const incomingRates = Array.isArray(data?.rates) ? data.rates : []
      const normalized = incomingRates.map((rate: any) => ({
        title: `${rate.carrier} – ${rate.service}`,
        value: rate.rateId || rate.serviceCode,
        amount: rate.amount,
      }))
      setRates(normalized)
    } catch (err) {
      console.error('Error fetching rates:', err)
      setRates([])
    }
  }, [customerAddress, isComplete, packageDetails])

  React.useEffect(() => {
    if (showOptions) fetchAllRates()
  }, [fetchAllRates, showOptions])

  return React.createElement(
    Stack,
    {space: 3},
    [
      React.createElement(Button, {
        key: 'review-button',
        text: 'Review Rate Options',
        tone: 'primary',
        onClick: () => setShowOptions(true),
      }),
      showOptions &&
        React.createElement(
          Card,
          {key: 'rate-options', padding: 3, radius: 2, tone: 'default'},
          React.createElement(
            Stack,
            {space: 2},
            rates.length
              ? rates.map((rate) =>
                  React.createElement(Button, {
                    key: rate.value,
                    text: `${rate.title} – $${rate.amount}`,
                    mode: 'ghost',
                    onClick: () => {
                      props.onChange(
                        PatchEvent.from([
                          set(rate.value, ['easyPostService']),
                          set(rate.amount, ['shippingCost']),
                        ]),
                      )
                      setShowOptions(false)
                    },
                  }),
                )
              : React.createElement(
                  Text,
                  {size: 1, muted: true},
                  'No rates available.',
                ),
          ),
        ),
      React.createElement(EasyPostServiceInput, {
        key: 'easypost-service-input',
        ...props,
        fetchRates: () => Promise.resolve(rates.map(({title, value}) => ({title, value}))),
      }),
    ].filter(Boolean),
  )
}

const shippingOption = defineType({
  name: 'shippingOption',
  title: 'Shipping Option',
  type: 'document',
  fields: [
    {
      name: 'shippingType',
      title: 'Shipping Type',
      type: 'string',
      options: {
        list: [
          {title: 'UPS Next Day Air', value: 'ups_next_day_air'},
          {title: 'UPS 2nd Day Air', value: 'ups_2nd_day_air'},
          {title: 'UPS Ground', value: 'ups_ground'},
          {title: 'FedEx Express Saver', value: 'fedex_express_saver'},
        ],
      },
    },
    {name: 'customerAddress', title: 'Customer Address', type: 'shippingOptionCustomerAddress'},
    {name: 'packageDetails', title: 'Package Details', type: 'packageDetails'},
    {
      name: 'easyPostService',
      title: 'EasyPost Service',
      type: 'string',
      components: {
        field: CustomEasyPostServiceField,
      },
      description: 'Select a shipping service level. Pulled dynamically from EasyPost.',
    },
    {
      name: 'shippingCost',
      title: 'Shipping Cost (Auto)',
      type: 'number',
      readOnly: true,
      description: 'Auto-filled based on selected shipping rate',
    },
  ],
})

export default shippingOption
