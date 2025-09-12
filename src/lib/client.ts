import { createClient } from '@sanity/client';

function getEnv(name: string): string | undefined {
  const v = process.env[name];
  return (typeof v === 'string' && v.trim().length > 0) ? v : undefined;
}

// Resolve project/dataset from multiple possible env names used across apps
const projectId =
  getEnv('NEXT_PUBLIC_SANITY_PROJECT_ID') ||
  getEnv('VITE_SANITY_STUDIO_PROJECT_ID') ||
  getEnv('SANITY_STUDIO_PROJECT_ID') ||
  getEnv('SANITY_PROJECT_ID') ||
  'r4og35qd';

const dataset =
  getEnv('NEXT_PUBLIC_SANITY_DATASET') ||
  getEnv('VITE_SANITY_STUDIO_DATASET') ||
  getEnv('SANITY_STUDIO_DATASET') ||
  getEnv('SANITY_DATASET') ||
  'production';

export const client = createClient({
  projectId,
  dataset,
  useCdn: false, // prefer fresh data for server usage
  apiVersion: '2024-10-01',
  token: process.env.SANITY_API_TOKEN, // Needed for write access
});
