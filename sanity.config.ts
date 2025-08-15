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
import { media } from 'sanity-plugin-media';
import { schemaTypes } from './schemaTypes';
import booking from './schemaTypes/documents/booking';
import { deskStructure } from './desk/deskStructure';
import resolveDocumentActions from './resolveDocumentActions';
import ShippingCalendar from './components/studio/ShippingCalendar';

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
    ...(isDev ? [visionTool()] : []),
  ],

  tools: [
    {
      name: 'shipping-calendar',
      title: 'Shipping Calendar',
      component: ShippingCalendar,
    },
  ],

  document: {
    actions: resolveDocumentActions,
  },

  schema: {
    types: schemaTypes,
  },
});