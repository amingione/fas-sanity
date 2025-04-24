import { defineType } from 'sanity'
import React from 'react'
import ShipEngineServiceInput from '../../components/ShipEngineServiceInput'
import { fetchRates } from '../../netlify/functions/getShipEngineRates'

interface ShipEngineFieldProps {
  value: string
  onChange: (event: any) => void
  type: any
  markers: any
  presence: any
  compareValue: any
}

function CustomShipEngineServiceField(props: ShipEngineFieldProps) {
  const handleFetchRates = async () => {
    try {
      const data = await fetchRates();
      return data;
    } catch (error) {
      console.error('Error fetching rates:', error);
      throw error;
    }
  };

  return React.createElement(ShipEngineServiceInput, {
    ...props,
    fetchRates: handleFetchRates,
  });
}

export default defineType({
  name: 'shippingOption',
  title: 'Shipping Option',
  type: 'document',
  fields: [
    {
      name: 'name',
      title: 'Option Name',
      type: 'string',
    },
    {
      name: 'carrier',
      title: 'Carrier',
      type: 'string',
    },
    {
      name: 'cost',
      title: 'Cost',
      type: 'number',
    },
    {
      name: 'estimatedDelivery',
      title: 'Estimated Delivery Time',
      type: 'string',
    },
    {
      name: 'regionsAvailable',
      title: 'Available Regions',
      type: 'array',
      of: [{ type: 'string' }],
    },
    {
      name: 'shipEngineService',
      title: 'ShipEngine Service',
      type: 'string',
      components: {
        field: CustomShipEngineServiceField,
      },
      description: 'Select a shipping service level. Pulled dynamically from ShipEngine.',
    },
  ],
})