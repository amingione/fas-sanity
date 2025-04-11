import { Handler } from '@netlify/functions'
import { createClient } from '@sanity/client'

const sanity = createClient({
  projectId: process.env.SANITY_STUDIO_PROJECT_ID!,
  dataset: process.env.SANITY_STUDIO_DATASET!,
  apiVersion: '2024-04-10',
  token: process.env.PUBLIC_SANITY_WRITE_TOKEN,
  useCdn: false
})

const handler: Handler = async (event) => {
  try {
    const data = JSON.parse(event.body || '{}')
    const { tracking_number, status_code, external_order_id } = data

    // Example: status_code could be "DE" for Delivered
    if (status_code === 'DE' && external_order_id) {
      await sanity.patch(external_order_id).set({ status: 'Delivered' }).commit()
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Webhook processed.' })
    }
  } catch (error: any) {
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Webhook error', error: error.message })
    }
  }
}

export { handler }
