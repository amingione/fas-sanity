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
import {presentationTool} from '@sanity/presentation'
import {definePreviewUrl} from '@sanity/preview-url-secret/define-preview-url'
import {schemaMarkup} from '@operationnation/sanity-plugin-schema-markup'
import {schemaTypes} from './src/schemaTypes'
import {deskStructure} from './src/desk/deskStructure'
import resolveDocumentActions from './src/resolveDocumentActions'
import StudioLayout from './src/components/studio/StudioLayout'
import {fasTheme} from './src/theme/fasTheme'
import {fasBrandTheme} from './src/theme/fasBrandTheme'

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
  const ALLOWED_PREFIXES = ['SANITY_STUDIO_', 'VITE_', 'PUBLIC_', 'CALCOM_']
  return Object.fromEntries(
    Object.entries(process.env).filter(([key]) =>
      ALLOWED_PREFIXES.some((prefix) => key.startsWith(prefix)),
    ),
  )
}
const studioRuntimeEnv = collectStudioEnv()

const envFlag = (value?: string | null) => {
  if (!value) return undefined

  const normalized = value.trim().toLowerCase()

  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false

  return undefined
}

const useCoreTheme = envFlag(getEnv('SANITY_STUDIO_USE_CORE_THEME')) === true

const brandTheme: StudioTheme = fasBrandTheme || (fasTheme as StudioTheme)
const resolvedTheme: StudioTheme = useCoreTheme
  ? (defaultTheme as StudioTheme)
  : brandTheme

const normalizeBaseUrl = (value?: string | null, fallback?: string): string | undefined => {
  const candidate = value?.trim() || fallback?.trim()
  if (!candidate) return undefined
  return candidate.replace(/\/$/, '')
}

const sanityEnv = getEnv('SANITY_STUDIO_ENV')
const nodeEnv = getEnv('NODE_ENV')
const enableVisualEditingOverride = envFlag(getEnv('SANITY_STUDIO_ENABLE_VISUAL_EDITING'))
const disableVisualEditingOverride = envFlag(getEnv('SANITY_STUDIO_DISABLE_VISUAL_EDITING'))
const presentationPreviewOrigin =
  getEnv('SANITY_STUDIO_PREVIEW_ORIGIN') ||
  getEnv('PUBLIC_SITE_URL') ||
  getEnv('SANITY_STUDIO_NETLIFY_BASE') ||
  undefined

const previewOrigin = normalizeBaseUrl(presentationPreviewOrigin, 'http://localhost:4321')!

const fasCmsPreviewOrigin = normalizeBaseUrl(
  getEnv('SANITY_STUDIO_FAS_CMS_PREVIEW_ORIGIN') ||
    getEnv('SANITY_STUDIO_LEGACY_PREVIEW_ORIGIN') ||
    getEnv('FAS_CMS_PREVIEW_ORIGIN'),
)

const previewUrlResolver = definePreviewUrl({
  origin: previewOrigin,
  preview: '/',
})

type PreviewTarget = {
  key: string
  label: string
  origin: string
}

const previewTargets: PreviewTarget[] = [
  {key: 'primary', label: 'Storefront', origin: previewOrigin},
  ...(fasCmsPreviewOrigin
    ? [{key: 'fas-cms', label: 'FAS CMS', origin: fasCmsPreviewOrigin}] as PreviewTarget[]
    : []),
]

type PreviewableDocument = {
  _type?: string | null
  _id?: string | null
  slug?: {current?: string | null} | null
}

const resolvePreviewPath = (document: PreviewableDocument | null | undefined): string => {
  if (!document) return '/'

  const slug = document.slug?.current?.trim()
  const fallbackSlug = document._id?.replace(/^drafts\./, '')

  switch (document._type) {
    case 'product':
      return `/shop/${slug || fallbackSlug || ''}`
    case 'category':
      return `/shop/categories/${slug || fallbackSlug || ''}`
    case 'page':
      return `/${slug || fallbackSlug || ''}`
    case 'home':
      return '/'
    default:
      return '/'
  }
}

type LocationResolverValue = {
  slug?: string | null
  _id?: string | null
}

const buildDocumentLocation = (title: string, type: string) => ({
  select: {
    slug: 'slug.current',
    _id: '_id',
  },
  resolve: (value: LocationResolverValue | null) => {
    if (!value?._id) return undefined
    const path = resolvePreviewPath({
      _type: type,
      _id: value._id,
      slug: value.slug ? {current: value.slug} : null,
    })

    const locations = previewTargets.map((target) => ({
      title: `${title} (${target.label})`,
      href: new URL(path || '/', target.origin).toString(),
    }))

    if (!locations.length) return undefined

    return {
      locations,
    }
  },
})

const isDev =
  sanityEnv !== undefined
    ? sanityEnv !== 'production'
    : nodeEnv !== undefined
      ? nodeEnv !== 'production'
      : false

const visionEnabled =
  disableVisionOverride === true
    ? false
    : enableVisionOverride === true
      ? true
      : isDev
const visualEditingEnabled =
  disableVisualEditingOverride === true
    ? false
    : enableVisualEditingOverride === true
      ? true
      : isDev

export default defineConfig({
  name: 'default',
  title: 'FAS Motorsports',

  projectId:
    process.env.SANITY_STUDIO_PROJECT_ID ||
    process.env.SANITY_PROJECT_ID ||
    'r4og35qd',
  dataset:
    process.env.SANITY_STUDIO_DATASET ||
    process.env.SANITY_DATASET ||
    'production',
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
    codeInput(),
    schemaMarkup(),
    presentationTool({
      previewUrl: previewUrlResolver,
      name: 'preview',
      title: 'Preview',
      resolve: {
        locations: {
          product: buildDocumentLocation('Shop product', 'product'),
          category: buildDocumentLocation('Browse category', 'category'),
          page: buildDocumentLocation('View page', 'page'),
          home: buildDocumentLocation('Home', 'home'),
        },
      },
    }),
    ...(visionEnabled ? [visionTool()] : []),
  ],

  apps: {
    canvas: {
      enabled: true,
      fallbackStudioOrigin: process.env.SANITY_STUDIO_CANVAS_FALLBACK_ORIGIN || undefined,
    },
  },

  document: {
    actions: resolveDocumentActions,
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
})
