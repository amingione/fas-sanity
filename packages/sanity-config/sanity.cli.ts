import {defineCliConfig} from 'sanity/cli'

export default defineCliConfig({
  api: {
    projectId: process.env.SANITY_STUDIO_PROJECT_ID || process.env.SANITY_PROJECT_ID || 'r4og35qd',
    dataset: process.env.SANITY_STUDIO_DATASET || process.env.SANITY_DATASET || 'production',
  },
  server: {
    hostname: 'localhost',
    port: 3333,
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
