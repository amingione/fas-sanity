// NOTE: Removed @sanity/color-input to avoid peer-dependency conflict with Sanity v4 and fix Netlify build.
import {defaultTheme, defineConfig, type PluginOptions, type StudioTheme} from 'sanity'
import './src/styles/tailwind.css'
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
import resolveDocumentBadges from './src/documentBadges'
import StudioLayout from './src/components/studio/StudioLayout'
import {fasTheme} from './src/theme/fasTheme'
import {fasBrandTheme} from './src/theme/fasBrandTheme'
// Import order actions

const hasProcess = typeof process !== 'undefined' && typeof process.cwd === 'function'
const joinSegments = (...segments: string[]) => segments.filter(Boolean).join('/')
const projectRoot = hasProcess ? process.cwd().replace(/\\/g, '/') : ''
const packageRoot = joinSegments(projectRoot, 'packages', 'sanity-config')

const aliasFromNodeModules = (specifier: string) =>
  hasProcess ? joinSegments(projectRoot, 'node_modules', ...specifier.split('/')) : specifier

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
const collectStudioEnv = (): Record<string, string | undefined> => {
  if (!hasProcess || !process?.env) return {}
  const ALLOWED_PREFIXES = ['SANITY_STUDIO_', 'VITE_', 'PUBLIC_']
  return Object.fromEntries(
    Object.entries(process.env).filter(([key]) =>
      ALLOWED_PREFIXES.some((prefix) => key.startsWith(prefix)),
    ),
  )
}
const studioRuntimeEnv = collectStudioEnv()

const DEFAULT_API_VERSION = '2024-10-01'
const SANITY_API_VERSION =
  getEnv('SANITY_STUDIO_API_VERSION') || getEnv('SANITY_API_VERSION') || DEFAULT_API_VERSION

const envFlag = (value?: string | null) => {
  if (!value) return undefined

  const normalized = value.trim().toLowerCase()

  if (['1', 'true', 'yes', 'on', 'enable', 'enabled'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off', 'disable', 'disabled'].includes(normalized)) return false

  return undefined
}

const getEnvFlag = (...names: string[]) => {
  for (const name of names) {
    const raw = getEnv(name)
    if (raw !== undefined) {
      const flag = envFlag(raw)
      if (flag !== undefined) return flag
    }
  }
  return undefined
}

const useCoreTheme = envFlag(getEnv('SANITY_STUDIO_USE_CORE_THEME')) === true

const brandTheme: StudioTheme = fasBrandTheme || (fasTheme as StudioTheme)
const resolvedTheme: StudioTheme = useCoreTheme ? (defaultTheme as StudioTheme) : brandTheme

const normalizeBaseUrl = (value?: string | null, fallback?: string): string | undefined => {
  const candidate = value?.trim() || fallback?.trim()
  if (!candidate) return undefined
  return candidate.replace(/\/$/, '')
}

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
const visualEditingEnabled =
  disableVisualEditingOverride === true ? false : enableVisualEditingOverride === true // default disabled unless explicitly enabled

export default defineConfig({
  name: 'default',
  title: 'FAS Motorsports',

  projectId: process.env.SANITY_STUDIO_PROJECT_ID || process.env.SANITY_PROJECT_ID || 'r4og35qd',
  dataset: process.env.SANITY_STUDIO_DATASET || process.env.SANITY_DATASET || 'production',
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
      fallbackStudioOrigin: process.env.SANITY_STUDIO_CANVAS_FALLBACK_ORIGIN || undefined,
    },
  },

  document: {
    actions: (prev, context) => resolveDocumentActions(prev, context),
    badges: resolveDocumentBadges,
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
    ],
    build: {
      outDir: joinSegments(packageRoot, 'dist', 'studio'),
      rollupOptions: {
        external: ['sanity/refractor'],
      },
    },
    define: {
      __SANITY_STUDIO_RUNTIME_ENV__: JSON.stringify(studioRuntimeEnv),
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
