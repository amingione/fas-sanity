// NOTE: Removed @sanity/color-input to avoid peer-dependency conflict with Sanity v4 and fix Netlify build.
import { defineConfig } from 'sanity';
// Desk Tool import is different across Sanity versions; support both named and default
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import * as _desk from 'sanity/desk';
const deskTool = // runtime resolve: prefer named export, then default, then module itself
  (// eslint-disable-next-line @typescript-eslint/no-explicit-any
  (_desk as any).deskTool) || (// eslint-disable-next-line @typescript-eslint/no-explicit-any
  (_desk as any).default) || (_desk as unknown as (opts?: unknown) => unknown);
import { visionTool } from '@sanity/vision';
import { codeInput } from '@sanity/code-input';
import { media } from 'sanity-plugin-media';
import { schemaTypes } from './schemaTypes';
import booking from './schemaTypes/documents/booking';
import { deskStructure } from './desk/deskStructure';
import resolveDocumentActions from './resolveDocumentActions';
import ShippingCalendar from './components/studio/ShippingCalendar';
import AdminTools from './components/studio/AdminTools';

const isDev = process.env.NODE_ENV === 'development';

export default defineConfig({
  name: 'default',
  title: 'FAS Motorsports',

  projectId: process.env.SANITY_STUDIO_PROJECT_ID || 'r4og35qd',
  dataset: process.env.SANITY_STUDIO_DATASET || 'production',

  plugins: [
    deskTool({
      structure: deskStructure,
    }),
    media(),
    codeInput(),
    ...(isDev ? [visionTool()] : []),
  ],

  tools: [
    {
      name: 'shipping-calendar',
      title: 'Shipping Calendar',
      component: ShippingCalendar,
    },
    {
      name: 'admin-tools',
      title: 'Admin Tools',
      component: AdminTools,
    },
  ],

  document: {
    actions: resolveDocumentActions,
  },

  schema: {
    types: schemaTypes,
  },
  vite: {
    resolve: {
      // Ensure only a single instance of these packages end up in the bundle.
      // With pnpm, multiple peer variants can otherwise create duplicate contexts.
      dedupe: ['sanity', '@sanity/ui', 'react', 'react-dom', 'styled-components'],
      alias: {
        // Work around occasional CJS/ESM interop glitches with react-refractor in dev.
        // Use a relative replacement to avoid importing Node's `path` in the browser.
        'react-refractor': './shims/react-refractor-shim.tsx',
        // Explicitly map refractor language subpaths to v3 files to satisfy Sanity imports
        'refractor/bash': './node_modules/refractor/lang/bash.js',
        'refractor/javascript': './node_modules/refractor/lang/javascript.js',
        'refractor/json': './node_modules/refractor/lang/json.js',
        'refractor/jsx': './node_modules/refractor/lang/jsx.js',
        'refractor/typescript': './node_modules/refractor/lang/typescript.js',
      },
    },
    // Remove custom Vite transforms that monkey‑patch @sanity/ui to avoid input regressions
    optimizeDeps: undefined,
    plugins: [],
    build: {
      rollupOptions: {
        external: ['sanity/refractor'],
      },
    },
  },
});
