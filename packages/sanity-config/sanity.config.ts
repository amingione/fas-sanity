// NOTE: Removed @sanity/color-input to avoid peer-dependency conflict with Sanity v4 and fix Netlify build.
import {defineConfig, type PluginOptions, type StudioTheme} from 'sanity'
import fs from 'fs'
import {config as loadDotenv} from 'dotenv'
import './src/styles/tailwind.css'
import {studioTheme} from '@sanity/ui'
// Desk Tool import is different across Sanity versions; support both named and default
// @ts-ignore
import * as _desk from 'sanity/desk'
type DeskToolFactory = (opts?: unknown) => PluginOptions
type DeskModule = {
  deskTool?: DeskToolFactory
  default?: DeskToolFactory
}
const deskModule = _desk as DeskModule | DeskToolFactory
const deskTool: DeskToolFactory =
  typeof deskModule === 'function'
    ? deskModule
    : deskModule.deskTool || deskModule.default || (_desk as unknown as DeskToolFactory)
import {visionTool} from '@sanity/vision'
import {codeInput} from '@sanity/code-input'
import {media} from 'sanity-plugin-media'
// Removed presentation/preview tool
import {schemaMarkup} from '@operationnation/sanity-plugin-schema-markup'
import {schemaTypes} from './src/schemaTypes'
import {deskStructure} from './src/desk/deskStructure'
import {deskStructureBuilderTool} from './src/plugins/deskStructureBuilder'
import resolveDocumentActions from './src/resolveDocumentActions'
import {resolveDownloadDocumentActions} from './src/documentActions/downloadDocumentActions'
import {resolveProductDocumentActions} from './src/documentActions/productDocumentActions'
import resolveDocumentBadges from './src/documentBadges'
import StudioLayout from './src/components/studio/StudioLayout'
import {orderView} from './src/views/orderView'
import CustomerDashboard from './src/components/studio/CustomerDashboard'
import VehicleServiceHistory from './src/components/studio/VehicleServiceHistory'
import './src/runtimeEnvBootstrap'

declare const __SANITY_STUDIO_RUNTIME_ENV__:
  | Record<string, string | undefined>
  | undefined

const hasProcess = typeof process !== 'undefined' && typeof process.cwd === 'function'
const joinSegments = (...segments: string[]) => segments.filter(Boolean).join('/')
const projectRoot = hasProcess ? process.cwd().replace(/\\/g, '/') : ''
const packageRoot = joinSegments(projectRoot, 'packages', 'sanity-config')

const loadEnvFiles = () => {
  if (!hasProcess) return
  const mode = process.env.NODE_ENV || process.env.MODE || 'development'
  const candidates = [
    '.env',
    '.env.local',
    `.env.${mode}`,
    `.env.${mode}.local`,
    '.env.development',
    '.env.development.local',
  ].map((filename) => joinSegments(projectRoot, filename))

  for (const file of candidates) {
    try {
      if (fs.existsSync(file)) {
        loadDotenv({path: file, override: false})
      }
    } catch {
      // ignore individual load errors so a missing file doesn't break startup
    }
  }
}

loadEnvFiles()

const aliasFromNodeModules = (specifier: string) =>
  hasProcess ? joinSegments(projectRoot, 'node_modules', ...specifier.split('/')) : specifier

const ALLOWED_STUDIO_PREFIXES = ['SANITY_STUDIO_', 'VITE_', 'PUBLIC_']

const workspaceModuleAliases = hasProcess
  ? {
      sanity: aliasFromNodeModules('sanity'),
      '@sanity/ui': aliasFromNodeModules('@sanity/ui'),
      react: aliasFromNodeModules('react'),
      'react-dom': aliasFromNodeModules('react-dom'),
      'styled-components': aliasFromNodeModules('styled-components'),
    }
  : {}

const getEnv = (name: string) => (hasProcess ? process.env[name] : undefined)
const collectStudioEnv = (
  source: Record<string, string | undefined>,
): Record<string, string | undefined> =>
  Object.fromEntries(
    Object.entries(source || {}).filter(([key]) =>
      ALLOWED_STUDIO_PREFIXES.some((prefix) => key.startsWith(prefix)),
    ),
  )

const resolveEnvSource = (): Record<string, string | undefined> => {
  if (typeof __SANITY_STUDIO_RUNTIME_ENV__ !== 'undefined') return __SANITY_STUDIO_RUNTIME_ENV__
  if (
    typeof window !== 'undefined' &&
    typeof window.__SANITY_STUDIO_RUNTIME_ENV__ !== 'undefined'
  ) {
    return window.__SANITY_STUDIO_RUNTIME_ENV__ as Record<string, string | undefined>
  }
  if (hasProcess && process?.env) return process.env
  return {}
}
const studioRuntimeEnv = collectStudioEnv(resolveEnvSource())
const serializedStudioRuntimeEnv = JSON.stringify(studioRuntimeEnv)
const processEnvDefine = JSON.stringify({
  ...studioRuntimeEnv,
  NODE_ENV: hasProcess ? process.env.NODE_ENV ?? 'production' : 'production',
  MODE: hasProcess ? process.env.MODE ?? process.env.NODE_ENV ?? 'production' : 'production',
})
if (hasProcess && (process.env.DEBUG_STUDIO_ENV || process.env.VERBOSE_STUDIO_ENV)) {
  // Helpful when envs aren't appearing in the client bundle.
  console.info('[sanity-config] studioRuntimeEnv keys:', Object.keys(studioRuntimeEnv))
}
const runtimeEnvInlineScript = `
  window.__SANITY_STUDIO_RUNTIME_ENV__ = Object.assign(
    {},
    window.__SANITY_STUDIO_RUNTIME_ENV__,
    ${serializedStudioRuntimeEnv}
  );
`.trim()

const readEnv = (name: string) => studioRuntimeEnv[name] ?? getEnv(name)

const DEFAULT_API_VERSION = '2024-10-01'
const SANITY_API_VERSION =
  readEnv('SANITY_STUDIO_API_VERSION') || readEnv('SANITY_API_VERSION') || DEFAULT_API_VERSION

const envFlag = (value?: string | null) => {
  if (!value) return undefined

  const normalized = value.trim().toLowerCase()

  if (['1', 'true', 'yes', 'on', 'enable', 'enabled'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off', 'disable', 'disabled'].includes(normalized)) return false

  return undefined
}

const getEnvFlag = (...names: string[]) => {
  for (const name of names) {
    const raw = readEnv(name)
    if (raw !== undefined) {
      const flag = envFlag(raw)
      if (flag !== undefined) return flag
    }
  }
  return undefined
}

const resolvedTheme: StudioTheme = studioTheme

const disableVisionOverride = getEnvFlag(
  'SANITY_STUDIO_DISABLE_VISION',
  'VITE_SANITY_STUDIO_DISABLE_VISION',
)
const enableVisualEditingOverride = getEnvFlag(
  'SANITY_STUDIO_ENABLE_VISUAL_EDITING',
  'VITE_SANITY_STUDIO_ENABLE_VISUAL_EDITING',
)
const disableVisualEditingOverride = getEnvFlag(
  'SANITY_STUDIO_DISABLE_VISUAL_EDITING',
  'VITE_SANITY_STUDIO_DISABLE_VISUAL_EDITING',
)
// Preview tool removed; all related URL/target resolvers deleted

const visionEnabled = disableVisionOverride === true ? false : true
// default disabled unless explicitly enabled
const visualEditingEnabled =
  disableVisualEditingOverride === true ? false : enableVisualEditingOverride === true

export default defineConfig({
  name: 'default',
  title: 'FAS Motorsports',

  projectId: readEnv('SANITY_STUDIO_PROJECT_ID') || readEnv('SANITY_PROJECT_ID') || 'r4og35qd',
  dataset: readEnv('SANITY_STUDIO_DATASET') || readEnv('SANITY_DATASET') || 'production',
  /**
   * CORS origins must include:
   *   http://localhost:8888
   *   https://fassanity.fasmotorsports.com
   */
  api: {
    apiVersion: SANITY_API_VERSION,
    useCdn: false,
  },

  plugins: [
    deskTool({
      name: 'desk',
      title: 'Content',
      structure: deskStructure,
    }),
    deskStructureBuilderTool(),
    media(),
    codeInput(),
    schemaMarkup(),
    // preview/presentation tool removed
    ...(visionEnabled ? [visionTool()] : []),
  ],

  apps: {
    canvas: {
      enabled: true,
      fallbackStudioOrigin: readEnv('SANITY_STUDIO_CANVAS_FALLBACK_ORIGIN') || undefined,
    },
  },

  document: {
    actions: (prev, context) =>
      resolveProductDocumentActions(
        resolveDownloadDocumentActions(resolveDocumentActions(prev, context), context),
        context,
      ),
    badges: resolveDocumentBadges,
    views: [
      {
        id: 'order-management-view',
        title: 'Order Management',
        component: orderView,
      },
      {
        id: 'customer-dashboard',
        title: 'Customer Dashboard',
        component: CustomerDashboard,
      },
      {
        id: 'vehicle-history',
        title: 'Vehicle Service History',
        component: VehicleServiceHistory,
      },
    ],
  },

  schema: {
    types: schemaTypes,
  },
  theme: resolvedTheme,
  studio: {
    components: {
      layout: StudioLayout,
    },
  },
  vite: {
    envPrefix: ['SANITY_STUDIO_', 'VITE_', 'PUBLIC_'],
    resolve: {
      // Ensure only a single instance of these packages end up in the bundle.
      // With pnpm, multiple peer variants can otherwise create duplicate contexts.
      dedupe: ['sanity', '@sanity/ui', 'react', 'react-dom', 'styled-components'],
      preserveSymlinks: true,
      alias: [
        ...Object.entries(workspaceModuleAliases).map(([find, replacement]) => ({
          find,
          replacement,
        })),
        {
          // Work around CJS/ESM interop glitches with react-refractor across workspace packages.
          find: /^react-refractor(?:\/dist\/index\.js)?$/,
          replacement: joinSegments(packageRoot, 'src', 'shims', 'react-refractor-shim.tsx'),
        },
        // Explicitly map refractor language subpaths to v3 files to satisfy Sanity imports
        {find: 'refractor/bash', replacement: aliasFromNodeModules('refractor/lang/bash.js')},
        {
          find: 'refractor/javascript',
          replacement: aliasFromNodeModules('refractor/lang/javascript.js'),
        },
        {find: 'refractor/json', replacement: aliasFromNodeModules('refractor/lang/json.js')},
        {find: 'refractor/jsx', replacement: aliasFromNodeModules('refractor/lang/jsx.js')},
        {
          find: 'refractor/typescript',
          replacement: aliasFromNodeModules('refractor/lang/typescript.js'),
        },
      ],
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
        'react-refractor',
      ],
    },
    server: {
      fs: {
        allow: [projectRoot, packageRoot].filter(Boolean),
      },
    },
    plugins: [
      {
        name: 'fas-react-refractor-alias',
        enforce: 'pre',
        resolveId(source: string) {
          if (source === 'react-refractor' || source === 'react-refractor/dist/index.js') {
            return joinSegments(packageRoot, 'src', 'shims', 'react-refractor-shim.tsx')
          }
          return undefined
        },
      },
      {
        name: 'fas-runtime-env-inject',
        transformIndexHtml: () => ({
          tags: [
            {
              tag: 'script',
              injectTo: 'head',
              children: runtimeEnvInlineScript,
            },
          ],
        }),
      },
    ],
    build: {
      outDir: joinSegments(packageRoot, 'dist', 'studio'),
      rollupOptions: {
        external: ['sanity/refractor'],
      },
    },
    define: {
      __SANITY_STUDIO_RUNTIME_ENV__: serializedStudioRuntimeEnv,
      'process.env': processEnvDefine,
      PRESENTATION_ENABLE_VISUAL_EDITING: JSON.stringify(visualEditingEnabled),
      'process.env.SANITY_STUDIO_PRESENTATION_ENABLE_VISUAL_EDITING': JSON.stringify(
        visualEditingEnabled ? 'true' : 'false',
      ),
    },
  },
  // Add this to reduce console warnings
  __internal: {
    // @ts-ignore
    skipEnvCheck: true,
  },
})
