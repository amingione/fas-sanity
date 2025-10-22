import {defineCliConfig} from 'sanity/cli'

export default defineCliConfig({
  api: {
    projectId: 'r4og35qd',
    dataset: 'production'
  },
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
    appId: 'drquzbmyskyqp32jncsii7os',
  },
})
