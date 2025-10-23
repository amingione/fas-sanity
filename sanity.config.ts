// NOTE: Removed @sanity/color-input to avoid peer-dependency conflict with Sanity v4 and fix Netlify build.
import { defineConfig, type PluginOptions } from 'sanity';
import './styles/tailwind.css';
// Desk Tool import is different across Sanity versions; support both named and default
// @ts-ignore
import * as _desk from 'sanity/desk';
type DeskToolFactory = (opts?: unknown) => PluginOptions;
type DeskModule = {
  deskTool?: DeskToolFactory;
  default?: DeskToolFactory;
};
const deskModule = _desk as DeskModule | DeskToolFactory;
const deskTool: DeskToolFactory =
  typeof deskModule === 'function'
    ? deskModule
    : deskModule.deskTool || deskModule.default || (_desk as unknown as DeskToolFactory);
import { visionTool } from '@sanity/vision';
import { codeInput } from '@sanity/code-input';
import { media } from 'sanity-plugin-media';
import { presentationTool } from '@sanity/presentation';
import { arenaSyncPlugin } from './plugins/arena-sync';
import { schemaTypes } from './schemaTypes';
import { deskStructure } from './desk/deskStructure';
import resolveDocumentActions from './resolveDocumentActions';
import ShippingCalendar from './components/studio/ShippingCalendar';
import AdminTools from './components/studio/AdminTools';
import StudioLayout from './components/studio/StudioLayout';

const hasProcess = typeof process !== 'undefined' && typeof process.cwd === 'function';
const joinSegments = (...segments: string[]) => segments.filter(Boolean).join('/');
const projectRoot = hasProcess ? process.cwd().replace(/\\/g, '/') : '';

const aliasFromNodeModules = (specifier: string) =>
  hasProcess
    ? joinSegments(projectRoot, 'node_modules', ...specifier.split('/'))
    : specifier;

const workspaceModuleAliases = hasProcess
  ? {
      sanity: aliasFromNodeModules('sanity'),
      '@sanity/ui': aliasFromNodeModules('@sanity/ui'),
      react: aliasFromNodeModules('react'),
      'react-dom': aliasFromNodeModules('react-dom'),
      'styled-components': aliasFromNodeModules('styled-components'),
    }
  : {};

const getEnv = (name: string) => (hasProcess ? process.env[name] : undefined);
const collectStudioEnv = (): Record<string, string | undefined> => {
  if (!hasProcess || !process?.env) return {};
  const ALLOWED_PREFIXES = ['SANITY_STUDIO_', 'VITE_', 'PUBLIC_', 'CALCOM_'];
  return Object.fromEntries(
    Object.entries(process.env).filter(([key]) =>
      ALLOWED_PREFIXES.some((prefix) => key.startsWith(prefix))
    )
  );
};
const studioRuntimeEnv = collectStudioEnv();

const envFlag = (value?: string | null) => {
  if (!value) return undefined;

  const normalized = value.trim().toLowerCase();

  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;

  return undefined;
};

const sanityEnv = getEnv('SANITY_STUDIO_ENV');
const nodeEnv = getEnv('NODE_ENV');
const enableVisionOverride = envFlag(getEnv('SANITY_STUDIO_ENABLE_VISION'));
const disableVisionOverride = envFlag(getEnv('SANITY_STUDIO_DISABLE_VISION'));
const presentationPreviewOrigin =
  getEnv('SANITY_STUDIO_PREVIEW_ORIGIN') ||
  getEnv('PUBLIC_SITE_URL') ||
  getEnv('SANITY_STUDIO_NETLIFY_BASE') ||
  undefined;

const isDev =
  sanityEnv !== undefined
    ? sanityEnv !== 'production'
    : nodeEnv !== undefined
      ? nodeEnv !== 'production'
      : false;

const visionEnabled = true;

export default defineConfig({
  name: 'default',
  title: 'FAS Motorsports',

  projectId: process.env.SANITY_STUDIO_PROJECT_ID || 'r4og35qd',
  dataset: process.env.SANITY_STUDIO_DATASET || 'production',
  /**
   * CORS origins must include:
   *   http://localhost:8888
   *   https://fassanity.fasmotorsports.com
   */
  api: {
    apiVersion: '2025-10-22',
    useCdn: false,
  },

  plugins: [
    deskTool({
      name: 'desk',
      title: 'Content',
      structure: deskStructure,
    }),
    media(),
    arenaSyncPlugin(),
    codeInput(),
    presentationTool(
      presentationPreviewOrigin
        ? {
            previewUrl: {
              origin: presentationPreviewOrigin.replace(/\/$/, ''),
            },
          }
        : {},
    ),
    ...(visionEnabled ? [visionTool()] : []),
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
  studio: {
    components: {
      layout: StudioLayout,
    },
  },
  vite: {
    resolve: {
      // Ensure only a single instance of these packages end up in the bundle.
      // With pnpm, multiple peer variants can otherwise create duplicate contexts.
      dedupe: ['sanity', '@sanity/ui', 'react', 'react-dom', 'styled-components'],
      preserveSymlinks: true,
      alias: {
        ...workspaceModuleAliases,
        // Work around occasional CJS/ESM interop glitches with react-refractor in dev.
        // Use a relative replacement to avoid importing Node's `path` in the browser.
        'react-refractor': './shims/react-refractor-shim.tsx',
        // Explicitly map refractor language subpaths to v3 files to satisfy Sanity imports
        'refractor/bash': aliasFromNodeModules('refractor/lang/bash.js'),
        'refractor/javascript': aliasFromNodeModules('refractor/lang/javascript.js'),
        'refractor/json': aliasFromNodeModules('refractor/lang/json.js'),
        'refractor/jsx': aliasFromNodeModules('refractor/lang/jsx.js'),
        'refractor/typescript': aliasFromNodeModules('refractor/lang/typescript.js'),
      },
    },
    // Remove custom Vite transforms that monkey‑patch @sanity/ui to avoid input regressions
    optimizeDeps: {
      exclude: [
        'sanity',
        '@sanity/ui',
        'sanity/desk',
        'sanity/router',
        'react',
        'react-dom',
        'styled-components',
      ],
    },
    server: {
      fs: {
        allow: [projectRoot].filter(Boolean),
      },
    },
    plugins: [],
    build: {
      rollupOptions: {
        external: ['sanity/refractor'],
      },
    },
    define: {
      __SANITY_STUDIO_RUNTIME_ENV__: JSON.stringify(studioRuntimeEnv),
    },
  },
});
