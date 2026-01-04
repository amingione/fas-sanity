import {createClient} from '@sanity/client'
import {
  resolveSanityDataset,
  resolveSanityProjectId,
  resolveSanityToken,
} from './sanityEnv'

const projectId = resolveSanityProjectId()
const dataset = resolveSanityDataset()
const token = resolveSanityToken()

if (!projectId || !dataset || !token) {
  throw new Error(
    'Missing Sanity configuration. Set SANITY_STUDIO_PROJECT_ID, SANITY_STUDIO_DATASET, and SANITY_API_TOKEN in the environment.',
  )
}

export const sanityClient = createClient({
  projectId,
  dataset,
  token,
  apiVersion: process.env.SANITY_STUDIO_API_VERSION || '2024-10-01',
  useCdn: false,
})
