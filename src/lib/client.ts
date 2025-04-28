import { createClient } from '@sanity/client';

export const client = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET!,
  useCdn: false, // false if you want fresh data
  apiVersion: '2023-01-01', // pick your own date
  token: process.env.SANITY_API_TOKEN, // Needed for write access
});