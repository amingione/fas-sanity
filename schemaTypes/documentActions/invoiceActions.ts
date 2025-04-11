import { DocumentActionComponent } from 'sanity'
import { createClient } from '@sanity/client'

const sanityClient = createClient({
  projectId: process.env.SANITY_STUDIO_PROJECT_ID!,
  dataset: process.env.SANITY_STUDIO_DATASET!,
  apiVersion: '2024-04-10',
  token: process.env.PUBLIC_SANITY_WRITE_TOKEN,
  useCdn: false
})

interface Invoice {
  _type: 'invoice';
  quote?: {
    customer?: {
      _ref: string;
    };
  };
  fulfillmentStatus?: string;
}

export const createShippingLabel: DocumentActionComponent = ({ id, published }: { id: string; published: any }) => {
  if (!published || published._type !== 'invoice') return null
  const invoice = published as Invoice

  return {
    label: 'Create Shipping Label',
    onHandle: async () => {
      const res = await fetch('/.netlify/functions/createShippingLabel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          customerId: invoice.quote?.customer?._ref || '',
          labelDescription: invoice.fulfillmentStatus || 'standard'
        })
      })

      const result = await res.json()

      if (res.ok) {
        await sanityClient
          .patch(id)
          .set({
            trackingNumber: result.trackingNumber,
            shippingLabelUrl: result.labelUrl
          })
          .commit()

        window.alert(`Label created!\nTracking: ${result.trackingNumber}`)
      } else {
        window.alert('Error creating label: ' + result.error)
      }
    }
  }
}