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
  ],

  document: {
    actions: resolveDocumentActions,
  },

  schema: {
    types: schemaTypes,
  },
  vite: {
    resolve: {
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
    optimizeDeps: {
      // Avoid pre-bundling these so our alias/patches take effect reliably in dev
      exclude: ['react-refractor', '@sanity/ui', 'refractor'],
    },
    plugins: [
      // Last-resort guard to prevent LazyRefractor from mounting highlighted code
      // even if a stale prebundle slips through.
      {
        name: 'disable-refractor-for-sanity',
        enforce: 'pre',
        transform(code: string, id: string) {
          // Debug: surface when our guard engages
          const log = (what: string) => {
            // eslint-disable-next-line no-console
            console.log(`[refractor-guard]`, what, '\n ->', id)
          }
          // Fix Vite cached prebundles that still reference `react-refractor.Refractor`
          // instead of the default export, and also hard-disable highlighting there.
          if (id.includes('/.sanity/vite/deps/refractor-')) {
            log('patching Vite dep cache (refractor-*: default export + disable)')
            const patched = code
              // Use the default export instead of a non-existent named export
              .replace(/import_react_refractor\.Refractor/g, 'import_react_refractor.default')
              // Force `registered = false` by replacing the hasLanguage ternary
              .replace(/t0\s*=\s*language\s*\?\s*\(0,\s*import_react_refractor\.hasLanguage\)\(language\)\s*:\s*false/g, 't0 = false')
            return { code: patched, map: null }
          }
          // Replace LazyRefractor lazy import with a tiny inline component that logs + renders plain code
          if (id.includes('/@sanity/ui/dist/_chunks-es/_visual-editing.mjs')) {
            log('patching _visual-editing (esm): inline LazyRefractor stub')
            const patched = code.replace(
              /const LazyRefractor\s*=\s*lazy\(\(\)\s*=>\s*import\(["']\.\/refractor\.mjs["']\)\)/,
              'const LazyRefractor = (p)=>jsx("code",{children:String(p?.value ?? "")})'
            )
            return { code: patched, map: null }
          }
          if (id.includes('/@sanity/ui/dist/_chunks-cjs/_visual-editing.js')) {
            log('patching _visual-editing (cjs): inline LazyRefractor stub')
            const patched = code.replace(
              /const LazyRefractor\s*=\s*react\.lazy\(\(\)\s*=>\s*Promise\.resolve\(\)\.then\(function\(\)\{return require\("\.\/refractor\.js"\)\}\)\)/,
              'const LazyRefractor = function(p){ return jsxRuntime.jsx("code",{children:String((p==null?void 0:p.value) || "")}) }'
            )
            return { code: patched, map: null }
          }
          // Patch @sanity/ui refractor wrapper to always consider languages unregistered
          if (id.includes('/@sanity/ui/dist/_chunks-es/refractor.mjs') || id.includes('/@sanity/ui/dist/_chunks-cjs/refractor.js')) {
            log('patching @sanity/ui refractor wrappers (registered=false)')
            const patched = code
              .replace(/Refractor\.__esModule\s*\?\s*Refractor\.default\.hasLanguage\(language\)\s*:\s*Refractor\.hasLanguage\(language\)/g, 'false')
              .replace(/Refractor__default\.default\.hasLanguage\(language\)\s*:\s*!1/g, '!1')
              .replace(/Refractor\.hasLanguage\(language\)\s*:\s*!1/g, '!1')
              .replace(/\$\[0\]\s*!==\s*language\s*\?\s*\(t0\s*=\s*language\s*\?\s*[^,]+,/, '$[0] !== language ? (t0 = !1,');
            return { code: patched, map: null };
          }
          // Ensure any direct load of react-refractor returns a harmless component
          if (id.includes('/react-refractor/')) {
            log('shimming react-refractor module')
            const shim = `
              export function registerLanguage() {}
              export function hasLanguage() { return false }
              export default function Refractor() { return null }
            `;
            return { code: shim, map: null };
          }
          return null;
        },
      },
    ],
  },
});
