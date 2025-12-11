import {createClient} from '@sanity/client'
import {
  resolveSanityDataset,
  resolveSanityProjectId,
  resolveSanityToken,
} from './sanityEnv'

const projectId = resolveSanityProjectId()
const dataset = resolveSanityDataset()
const token =
  process.env.SANITY_API_TOKEN ||
  process.env.SANITY_WRITE_TOKEN ||
  resolveSanityToken()

if (!projectId) {
  throw new Error(
    'Missing Sanity project ID. Set SANITY_STUDIO_PROJECT_ID or SANITY_PROJECT_ID in the environment.',
  )
}

export const sanityClient = createClient({
  projectId,
  dataset,
  token,
  apiVersion: process.env.SANITY_API_VERSION || '2024-10-01',
  useCdn: false,
})
