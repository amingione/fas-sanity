import {defineCliConfig} from 'sanity/cli'

const normalizeHostname = (value?: string | null): string | undefined => {
  const trimmed = value?.trim()
  return trimmed && trimmed !== '::' ? trimmed : undefined
}

const parsePort = (value?: string | null): number | undefined => {
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

const resolvedHostname =
  normalizeHostname(process.env.SANITY_STUDIO_HOSTNAME) ||
  normalizeHostname(process.env.SANITY_HOST) ||
  normalizeHostname(process.env.HOST) ||
  '0.0.0.0'

const resolvedPort =
  parsePort(process.env.SANITY_STUDIO_PORT) ||
  parsePort(process.env.PORT) ||
  3333

export default defineCliConfig({
  api: {
    projectId: process.env.SANITY_STUDIO_PROJECT_ID || process.env.SANITY_PROJECT_ID || 'r4og35qd',
    dataset: process.env.SANITY_STUDIO_DATASET || process.env.SANITY_DATASET || 'production',
  },
  server: {
    hostname: resolvedHostname,
    port: resolvedPort,
  },
  graphql: [
    {
      tag: 'default',
      playground: true,
      generation: 'gen3',
      nonNullDocumentFields: false,
    },
  ],
  vite: (config) => config,
  /**
   * Enable auto-updates for studios.
   * Learn more at https://www.sanity.io/docs/cli#auto-updates
   */
  deployment: {
    /**
     * Disable auto-updates to keep `sanity build` from checking https://sanity-cdn.com
     * for the latest studio bundle.
     *
     * The Netlify build runs in an environment without outbound network access, so the
     * version check fails and aborts the build. Explicitly disabling the auto-update
     * fetch allows the studio to build deterministically with the versions resolved by
     * the package manager.
     */
    autoUpdates: false,
    appId: 'ug66wlb5niwho8bll770z9br',
  },
})
