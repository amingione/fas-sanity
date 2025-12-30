import {createClient} from '@sanity/client'

export const getClient = (options: {apiVersion: string}) =>
  createClient({
    projectId: process.env.SANITY_STUDIO_PROJECT_ID || '',
    dataset: process.env.SANITY_STUDIO_DATASET || 'production',
    apiVersion: options.apiVersion,
    useCdn: false,
    token: process.env.SANITY_API_TOKEN,
  })
