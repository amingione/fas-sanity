import { DocumentActionComponent } from 'sanity'
import { createClient } from '@sanity/client'

const projectId = 'r4og35qd'

const sanityClient = createClient({
  projectId,
  dataset: process.env.SANITY_STUDIO_DATASET || 'production',
  apiVersion: '2024-04-10',
  token: process.env.PUBLIC_SANITY_WRITE_TOKEN || '',
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

export const createShippingLabel: DocumentActionComponent = (props) => {
  const { id, published, onComplete } = props

  if (!published || published._type !== 'invoice') return null
  const invoice = published as Invoice

  return {
    label: 'Create Shipping Label',
    onHandle: async () => {
      try {
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
          await sanityClient.patch(id).set({
            trackingNumber: result.trackingNumber,
            shippingLabelUrl: result.labelUrl
          }).commit()

          console.log('Label Created!', `Tracking: ${result.trackingNumber}`)
        } else {
          console.error('Error creating label', result.error)
        }
      } catch (error) {
        console.error('Request failed', String(error))
      }

      onComplete() // 🧼 finish action
    }
  }
}