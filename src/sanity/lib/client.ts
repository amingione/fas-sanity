import {createClient} from '@sanity/client'

const projectId = process.env.SANITY_STUDIO_PROJECT_ID
const dataset = process.env.SANITY_STUDIO_DATASET

if (!projectId || !dataset) {
  throw new Error('Missing Sanity project configuration. Set SANITY_STUDIO_PROJECT_ID and SANITY_STUDIO_DATASET.')
}

export const sanityClient = createClient({
  projectId,
  dataset,
  apiVersion: process.env.SANITY_STUDIO_API_VERSION || '2024-04-10',
  token: process.env.SANITY_API_TOKEN,
  useCdn: false,
})
