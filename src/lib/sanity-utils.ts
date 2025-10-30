// src/lib/sanity-utils.ts
import { createClient } from '@sanity/client';
import imageUrlBuilder from '@sanity/image-url';

type SanityFetch = <T>(query: string, params?: Record<string, any>) => Promise<T>;
interface SanityClientLite {
  fetch: SanityFetch;
}

const toBooleanFlag = (value: unknown): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return false;
    if (['true', '1', 'yes', 'on', 'enabled'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off', 'disabled'].includes(normalized)) return false;
  }
  return false;
};

// Initialize Sanity client (support both PUBLIC_* and server-side SANITY_* envs)
const projectId =
  (import.meta.env.PUBLIC_SANITY_PROJECT_ID as string | undefined) ||
  (import.meta.env.SANITY_PROJECT_ID as string | undefined);
const dataset =
  (import.meta.env.PUBLIC_SANITY_DATASET as string | undefined) ||
  (import.meta.env.SANITY_DATASET as string | undefined) ||
  'production';
const apiVersion = '2023-01-01';

const imageBuilder = projectId && dataset ? imageUrlBuilder({ projectId, dataset }) : null;

const SANITY_CDN_HOSTS = new Set(['cdn.sanity.io', 'cdn.sanityusercontent.com']);

export interface SanityImageTransformOptions {
  width?: number;
  height?: number;
  quality?: number;
  format?: 'webp' | 'jpg' | 'jpeg' | 'png' | 'auto';
  fit?: 'clip' | 'crop' | 'fill' | 'max' | 'min' | 'scale';
  dpr?: number;
  blur?: number;
  sharpen?: number;
}

const DEFAULT_SANITY_IMAGE_PARAMS: Required<Pick<SanityImageTransformOptions, 'quality' | 'fit'>> & {
  auto: 'format';
} = Object.freeze({
  auto: 'format',
  fit: 'max',
  quality: 82
});

export const optimizeSanityImageUrl = (
  rawUrl: string | null | undefined,
  overrides: SanityImageTransformOptions = {}
): string | undefined => {
  if (!rawUrl || typeof rawUrl !== 'string') return undefined;
  const trimmed = rawUrl.trim();
  if (!trimmed) return undefined;

  try {
    const url = new URL(trimmed);
    if (!SANITY_CDN_HOSTS.has(url.hostname) || !url.pathname.includes('/images/')) {
      return url.toString();
    }

    const params = url.searchParams;

    if (overrides.format && overrides.format !== 'auto') {
      params.set('fm', overrides.format);
      params.delete('auto');
    } else if (!params.has('auto')) {
      params.set('auto', DEFAULT_SANITY_IMAGE_PARAMS.auto);
    }

    if (overrides.fit) {
      params.set('fit', overrides.fit);
    } else if (!params.has('fit')) {
      params.set('fit', DEFAULT_SANITY_IMAGE_PARAMS.fit);
    }

    if (overrides.width) {
      params.set('w', String(Math.max(1, Math.round(overrides.width))));
    }
    if (overrides.height) {
      params.set('h', String(Math.max(1, Math.round(overrides.height))));
    }

    if (overrides.quality) {
      params.set('q', String(Math.min(100, Math.max(1, Math.round(overrides.quality)))));
    } else if (!params.has('q')) {
      params.set('q', String(DEFAULT_SANITY_IMAGE_PARAMS.quality));
    }

    if (overrides.dpr) {
      params.set('dpr', String(Math.max(1, Math.round(overrides.dpr))));
    }
    if (overrides.blur) {
      params.set('blur', String(Math.max(0, Math.round(overrides.blur))));
    }
    if (overrides.sharpen) {
      params.set('sharpen', String(Math.max(0, Math.round(overrides.sharpen))));
    }

    url.search = params.toString();
    return url.toString();
  } catch {
    return trimmed;
  }
};

const studioUrlRaw =
  (import.meta.env.PUBLIC_SANITY_STUDIO_URL as string | undefined) ||
  (import.meta.env.PUBLIC_STUDIO_URL as string | undefined) ||
  (import.meta.env.SANITY_STUDIO_URL as string | undefined) ||
  (import.meta.env.SANITY_STUDIO_NETLIFY_BASE as string | undefined) ||
  undefined;
const studioUrl = typeof studioUrlRaw === 'string' && studioUrlRaw.trim() ? studioUrlRaw : undefined;

const parseHostList = (input: string | undefined): string[] =>
  typeof input === 'string'
    ? input
        .split(/[,\s]+/)
        .map((part) => part.trim().toLowerCase())
        .filter(Boolean)
    : [];

const defaultVisualEditingHosts = new Set<string>(['localhost', '127.0.0.1']);
let studioHost: string | undefined;
if (studioUrl) {
  try {
    studioHost = new URL(studioUrl).hostname.toLowerCase();
    if (studioHost) {
      defaultVisualEditingHosts.add(studioHost);
    }
  } catch {
    // ignore invalid URL
  }
}

const visualEditingAllowedHosts = new Set<string>([
  ...defaultVisualEditingHosts,
  ...parseHostList(import.meta.env.PUBLIC_SANITY_VISUAL_EDITING_ALLOWED_HOSTS as string | undefined),
]);

const isBrowserRuntime = typeof window !== 'undefined' && typeof window.location !== 'undefined';
const runtimeHostname = isBrowserRuntime ? window.location.hostname.toLowerCase() : undefined;

const isHostnameAllowlisted = (hostname: string | null | undefined): boolean => {
  const normalized = typeof hostname === 'string' ? hostname.trim().toLowerCase() : undefined;

  if (!normalized) {
    return visualEditingAllowedHosts.size === 0;
  }

  if (visualEditingAllowedHosts.size === 0) {
    return true;
  }

  return visualEditingAllowedHosts.has(normalized);
};

const visualEditingOriginAllowed = isBrowserRuntime
  ? isHostnameAllowlisted(runtimeHostname)
  : isHostnameAllowlisted(undefined);

const visualEditingRequested = toBooleanFlag(
  import.meta.env.PUBLIC_SANITY_ENABLE_VISUAL_EDITING as string | undefined
);

const previewDraftsEnvOverride = toBooleanFlag(
  (import.meta.env.PUBLIC_SANITY_PREVIEW_DRAFTS as string | undefined) ?? 'false'
);

const liveSubscriptionsRequested = toBooleanFlag(
  import.meta.env.PUBLIC_SANITY_ENABLE_LIVE_SUBSCRIPTIONS as string | undefined
);

const apiToken =
  (import.meta.env.SANITY_API_TOKEN as string | undefined) ||
  (import.meta.env.SANITY_WRITE_TOKEN as string | undefined) ||
  (import.meta.env.PUBLIC_SANITY_API_TOKEN as string | undefined) ||
  undefined;

const manualCacheDisableFlag =
  toBooleanFlag((import.meta.env.SANITY_DISABLE_CACHE as string | undefined) ?? 'false') ||
  toBooleanFlag((import.meta.env.PUBLIC_SANITY_DISABLE_CACHE as string | undefined) ?? 'false');
const manualCacheEnableFlagRaw =
  (import.meta.env.SANITY_ENABLE_CACHE as string | undefined) ||
  (import.meta.env.PUBLIC_SANITY_ENABLE_CACHE as string | undefined);
const manualCacheEnableFlag =
  manualCacheEnableFlagRaw === undefined ? true : toBooleanFlag(manualCacheEnableFlagRaw);

interface HostStateOptions {
  emitWarnings?: boolean;
}

interface HostState {
  allowlisted: boolean;
  visualEditingFlag: boolean;
  previewDraftsRequested: boolean;
  previewDraftsEnabled: boolean;
  liveSubscriptionsFlag: boolean;
  sanityCacheEnabled: boolean;
}

const computeHostState = (allowlisted: boolean, options: HostStateOptions = {}): HostState => {
  const { emitWarnings = false } = options;

  const visualEditingFlag = visualEditingRequested && allowlisted;
  const previewDraftsRequested = visualEditingFlag || (allowlisted && previewDraftsEnvOverride);

  let previewDraftsEnabled = Boolean(previewDraftsRequested);
  if (previewDraftsEnabled && !apiToken) {
    if (emitWarnings) {
      console.warn(
        '[sanity-utils] Preview drafts requested but no SANITY_API_TOKEN (or PUBLIC_SANITY_API_TOKEN) was found; falling back to published content.'
      );
    }
    previewDraftsEnabled = false;
  }

  const liveSubscriptionsFlag = allowlisted && liveSubscriptionsRequested;

  const sanityCacheEnabled =
    !manualCacheDisableFlag &&
    manualCacheEnableFlag &&
    !import.meta.env.DEV &&
    !previewDraftsEnabled &&
    !visualEditingFlag;

  return {
    allowlisted,
    visualEditingFlag,
    previewDraftsRequested,
    previewDraftsEnabled,
    liveSubscriptionsFlag,
    sanityCacheEnabled,
  };
};

const runtimeHostState = computeHostState(visualEditingOriginAllowed, { emitWarnings: true });

const { visualEditingFlag, previewDraftsRequested, previewDraftsEnabled, liveSubscriptionsFlag } =
  runtimeHostState;

if (visualEditingRequested && !studioUrl) {
  console.warn(
    '[sanity-utils] Visual editing enabled but no PUBLIC_SANITY_STUDIO_URL (or SANITY_STUDIO_URL) configured.'
  );
}

if (visualEditingRequested && !runtimeHostState.allowlisted) {
  const allowed = Array.from(visualEditingAllowedHosts.values()).join(', ') || '<none>';
  console.warn(
    `[sanity-utils] Visual editing disabled for host "${runtimeHostname ?? '<unknown>'}". Allowlisted hosts: ${allowed}.`
  );
}

const parsePositiveInt = (value: unknown, fallback: number): number => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  if (typeof value === 'string') {
    const numeric = Number.parseInt(value.trim(), 10);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric;
    }
  }
  return fallback;
};

export const sanityCacheEnabled = runtimeHostState.sanityCacheEnabled;

const DEFAULT_SANITY_CACHE_TTL_SECONDS = parsePositiveInt(
  (import.meta.env.SANITY_CACHE_TTL_SECONDS as string | undefined) ||
    (import.meta.env.PUBLIC_SANITY_CACHE_TTL_SECONDS as string | undefined) ||
    0,
  300
);

type SanityCacheEntry = {
  value?: unknown;
  expiresAt: number;
  promise?: Promise<unknown>;
};

type SanityCacheStore = Map<string, SanityCacheEntry>;

const SANITY_CACHE_SYMBOL = Symbol.for('__fasSanityCacheStore__');

const getSanityCacheStore = (): SanityCacheStore => {
  const globalTarget = globalThis as typeof globalThis & {
    [SANITY_CACHE_SYMBOL]?: SanityCacheStore;
  };
  if (!globalTarget[SANITY_CACHE_SYMBOL]) {
    globalTarget[SANITY_CACHE_SYMBOL] = new Map<string, SanityCacheEntry>();
  }
  return globalTarget[SANITY_CACHE_SYMBOL]!;
};

const stableStringify = (value: unknown): string => {
  if (value === null) return 'null';

  switch (typeof value) {
    case 'undefined':
      return 'undefined';
    case 'number':
    case 'boolean':
      return JSON.stringify(value);
    case 'string':
      return JSON.stringify(value);
    case 'bigint':
      return `"${(value as bigint).toString()}"`;
    case 'symbol':
    case 'function':
      return `"${String(value)}"`;
    default:
      break;
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }

  const objectValue = value as Record<string, unknown>;
  const entries = Object.entries(objectValue)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
  return `{${entries.join(',')}}`;
};

export interface SanityCacheOptions {
  ttlSeconds?: number;
  forceRefresh?: boolean;
}

export const cachedSanityFetch = async <T>(
  keyParts: unknown[],
  fetcher: () => Promise<T>,
  options: SanityCacheOptions = {}
): Promise<T> => {
  const shouldUseCache = sanityCacheEnabled && !options.forceRefresh;
  const cacheStore = shouldUseCache ? getSanityCacheStore() : null;
  const ttlSeconds =
    options.ttlSeconds !== undefined
      ? Math.max(0, Math.floor(options.ttlSeconds))
      : DEFAULT_SANITY_CACHE_TTL_SECONDS;

  const cacheKey = shouldUseCache
    ? keyParts.map((part) => stableStringify(part)).join('|')
    : null;

  if (shouldUseCache && cacheStore && cacheKey) {
    const entry = cacheStore.get(cacheKey);
    const now = Date.now();
    if (entry) {
      if (entry.value !== undefined && entry.expiresAt > now) {
        return entry.value as T;
      }
      if (entry.promise) {
        return entry.promise as Promise<T>;
      }
    }

    if (ttlSeconds <= 0) {
      return fetcher();
    }

    const promise = (async () => {
      try {
        const result = await fetcher();
        cacheStore.set(cacheKey, {
          value: result,
          expiresAt: Date.now() + ttlSeconds * 1000
        });
        return result;
      } catch (err) {
        if (entry && entry.value !== undefined && entry.expiresAt > now) {
          cacheStore.set(cacheKey, entry);
        } else {
          cacheStore.delete(cacheKey);
        }
        throw err;
      }
    })();

    cacheStore.set(cacheKey, {
      value: entry?.value,
      expiresAt: Date.now() + ttlSeconds * 1000,
      promise
    });

    return promise;
  }

  return fetcher();
};

const perspective = previewDraftsEnabled ? 'previewDrafts' : 'published';
const stegaEnabled = visualEditingFlag && Boolean(studioUrl);

// Gracefully handle missing env vars in preview/editor environments
const hasSanityConfig = Boolean(projectId && dataset);
if (!hasSanityConfig) {
  console.warn(
    '[sanity-utils] Missing PUBLIC_SANITY_PROJECT_ID or PUBLIC_SANITY_DATASET; Sanity client disabled.'
  );
}

const clientOptions: Parameters<typeof createClient>[0] = {
  projectId,
  dataset,
  apiVersion,
  useCdn: false,
  perspective,
};

if (previewDraftsEnabled && apiToken) {
  clientOptions.token = apiToken;
}

if (stegaEnabled && studioUrl) {
  clientOptions.stega = { enabled: true, studioUrl } as const;
}

export const sanity: SanityClientLite | null = hasSanityConfig
  ? (createClient(clientOptions) as unknown as SanityClientLite)
  : null;

// Back-compat aliases for callers expecting different names
export const sanityClient = sanity as any;
export const client = sanity as any;
export const getClient = () => sanity as any;

export const config = {
  projectId,
  dataset,
  apiVersion,
  perspective,
  studioUrl: stegaEnabled ? studioUrl : undefined,
} as const;
export const clientConfig = config;
export const defaultClientConfig = config;

export const visualEditingEnabled = stegaEnabled;
export const previewDraftsActive = previewDraftsEnabled;
export const previewDraftsRequestedFlag = runtimeHostState.previewDraftsRequested;
export const liveSubscriptionsEnabled = stegaEnabled && liveSubscriptionsFlag;

export const isVisualEditingHostnameAllowlisted = (hostname: string | null | undefined): boolean =>
  isHostnameAllowlisted(hostname);
export const visualEditingHostAllowlisted = runtimeHostState.allowlisted;
export const visualEditingRequestedFlag = visualEditingRequested;

export type ResolveSanityRuntimeStateOptions = HostStateOptions;

export interface ResolvedSanityRuntimeState {
  allowlisted: boolean;
  perspective: 'published' | 'previewDrafts';
  visualEditingRequested: boolean;
  visualEditingEnabled: boolean;
  previewDraftsRequested: boolean;
  previewDraftsEnabled: boolean;
  liveSubscriptionsRequested: boolean;
  liveSubscriptionsEnabled: boolean;
  sanityCacheEnabled: boolean;
}

export const resolveSanityRuntimeStateForHostname = (
  hostname: string | null | undefined,
  options: ResolveSanityRuntimeStateOptions = {}
): ResolvedSanityRuntimeState => {
  const allowlisted = isHostnameAllowlisted(hostname);
  const hostState = computeHostState(allowlisted, options);
  const stegaEnabledForHost = hostState.visualEditingFlag && Boolean(studioUrl);
  const perspectiveForHost: ResolvedSanityRuntimeState['perspective'] = hostState.previewDraftsEnabled
    ? 'previewDrafts'
    : 'published';

  return {
    allowlisted,
    perspective: perspectiveForHost,
    visualEditingRequested,
    visualEditingEnabled: stegaEnabledForHost,
    previewDraftsRequested: hostState.previewDraftsRequested,
    previewDraftsEnabled: hostState.previewDraftsEnabled,
    liveSubscriptionsRequested,
    liveSubscriptionsEnabled: stegaEnabledForHost && hostState.liveSubscriptionsFlag,
    sanityCacheEnabled: hostState.sanityCacheEnabled,
  };
};

// Define interfaces
export interface Product {
  _id: string;
  title: string;
  slug: { current: string };
  price?: number | null;
  sku?: string;
  description?: string;
  shortDescription?: any;
  metaTitle?: string;
  metaDescription?: string;
  canonicalUrl?: string;
  noindex?: boolean;
  brand?: string;
  gtin?: string;
  mpn?: string;
  shippingClass?: string;
  shippingWeight?: number;
  images: {
    asset: {
      _id: string;
      url: string;
    };
    alt?: string;
  }[];
  categories: {
    _id: string;
    title: string;
    slug: { current: string };
  }[];
  tune?: {
    title: string;
    slug: { current: string };
  };
  compatibleVehicles?: {
    make: string;
    model: string;
    slug: { current: string };
  }[];
  averageHorsepower?: number;
  filters?: string[];
  specifications?: { key: string; value: string }[];
  attributes?: { key: string; value: string }[];
  productType?: string;
  requiresPaintCode?: boolean;
  importantNotes?: any;
  socialImage?: { asset: { _id: string; url: string }; alt?: string };
  addOns?: Array<{
    label?: string;
    priceDelta?: number;
    description?: string;
    skuSuffix?: string;
    defaultSelected?: boolean;
    group?: string;
    key?: string;
    name?: string;
    title?: string;
    value?: string;
    price?: number;
    delta?: number;
  }>;
  customPaint?: {
    enabled?: boolean;
    additionalPrice?: number;
    paintCodeRequired?: boolean;
    codeLabel?: string;
    instructions?: string;
  };
  variationOptions?: any[];
  optionGroups?: any[];
  variations?: any[];
  options?: any[];
}

export interface Category {
  _id: string;
  title: string;
  slug: { current: string };
  imageUrl?: string;
  description?: string;
}

export interface Tune {
  _id: string;
  title: string;
  slug: { current: string };
}

export interface Vehicle {
  _id: string;
  title: string;
  slug: { current: string };
}

type QueryParamValue = string | number | boolean | string[] | number[];
type QueryParams = Record<string, QueryParamValue>;

const normalizeUrlString = (value: string | undefined | null): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith('//')) {
    const httpsUrl = `https:${trimmed}`;
    return optimizeSanityImageUrl(httpsUrl) ?? httpsUrl;
  }
  if (/^https:\/\//i.test(trimmed)) {
    return optimizeSanityImageUrl(trimmed) ?? trimmed;
  }
  if (/^http:\/\//i.test(trimmed)) {
    const httpsUrl = `https://${trimmed.slice('http://'.length)}`;
    return optimizeSanityImageUrl(httpsUrl) ?? httpsUrl;
  }
  if (/^image-/i.test(trimmed) && imageBuilder) {
    try {
      const built = imageBuilder.image(trimmed).auto('format').fit('max').quality(DEFAULT_SANITY_IMAGE_PARAMS.quality).url();
      return optimizeSanityImageUrl(built) ?? built;
    } catch {
      return undefined;
    }
  }
  return trimmed;
};

const DIRECT_IMAGE_KEYS = [
  'url',
  'imageUrl',
  'imageURL',
  'image_url',
  'src',
  'href',
  'assetUrl',
  'assetURL',
  'downloadUrl',
  'downloadURL',
  'thumbUrl',
  'thumbnail',
  'thumbnailUrl',
  'thumb',
  'photo',
  'value',
  'current',
  'path',
] as const;

export const resolveSanityImageUrl = (candidate: unknown, seen = new Set<unknown>()): string | undefined => {
  if (candidate == null) return undefined;
  if (typeof candidate === 'string') {
    return normalizeUrlString(candidate);
  }

  if (seen.has(candidate)) return undefined;

  if (Array.isArray(candidate)) {
    seen.add(candidate);
    for (const entry of candidate) {
      const resolved = resolveSanityImageUrl(entry, seen);
      if (resolved) return resolved;
    }
    return undefined;
  }

  if (typeof candidate !== 'object') return undefined;

  seen.add(candidate);

  const obj = candidate as Record<string, unknown>;

  for (const key of DIRECT_IMAGE_KEYS) {
    if (key in obj) {
      const resolved = resolveSanityImageUrl(obj[key], seen);
      if (resolved) return resolved;
    }
  }

  if ('asset' in obj) {
    const resolved = resolveSanityImageUrl(obj.asset, seen);
    if (resolved) return resolved;
  }

  if (typeof obj._ref === 'string') {
    const built = normalizeUrlString(obj._ref);
    if (built && /^https?:/i.test(built)) {
      return built;
    }
  }

  if (typeof obj._id === 'string') {
    const built = normalizeUrlString(obj._id);
    if (built && /^https?:/i.test(built)) {
      return built;
    }
  }

  return undefined;
};

export const normalizeSanityImageUrl = (candidate: unknown): string | undefined =>
  resolveSanityImageUrl(candidate);

const normalizeImageEntry = (value: unknown): unknown => {
  if (value == null) return value;
  if (typeof value === 'string') {
    return normalizeUrlString(value) ?? value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => normalizeImageEntry(entry));
  }

  if (typeof value === 'object') {
    const clone: Record<string, unknown> = { ...(value as Record<string, unknown>) };
    for (const key of DIRECT_IMAGE_KEYS) {
      if (typeof clone[key] === 'string') {
        const normalized = normalizeUrlString(clone[key] as string);
        if (normalized && normalized !== clone[key]) {
          clone[key] = normalized;
        }
      }
    }

    if (clone.asset && typeof clone.asset === 'object') {
      const assetClone: Record<string, unknown> = { ...(clone.asset as Record<string, unknown>) };
      const assetUrl = resolveSanityImageUrl(assetClone);
      if (assetUrl) {
        assetClone.url = assetUrl;
        if (!clone.url || typeof clone.url !== 'string') {
          clone.url = assetUrl;
        }
      }
      clone.asset = assetClone;
    } else {
      const resolved = resolveSanityImageUrl(clone);
      if (resolved) {
        clone.url = resolved;
      }
    }

    return clone;
  }

  return value;
};

export const coercePriceToNumber = (value: unknown): number | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const normalized = value.replace(/[^0-9.,-]+/g, '').replace(/,/g, '');
    if (!normalized) return null;
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const normalizeProductPrice = <T extends { price?: unknown; images?: unknown; socialImage?: unknown }>(product: T): T => {
  if (!product) return product;
  const normalizedPrice = coercePriceToNumber((product as any).price);
  const clone: Record<string, unknown> = { ...(product as any) };
  if (normalizedPrice === null) {
    delete clone.price;
  } else {
    clone.price = normalizedPrice;
  }

  if ('images' in clone) {
    const value = clone.images;
    clone.images = Array.isArray(value)
      ? value.map((entry: unknown) => normalizeImageEntry(entry))
      : normalizeImageEntry(value);
  }

  if ('socialImage' in clone && clone.socialImage !== undefined) {
    clone.socialImage = normalizeImageEntry(clone.socialImage);
  }

  if ('includedInKit' in clone && Array.isArray(clone.includedInKit)) {
    clone.includedInKit = (clone.includedInKit as unknown[]).map((item) => {
      if (!item || typeof item !== 'object') return item;
      const entry = { ...(item as Record<string, unknown>) };
      if ('image' in entry) {
        entry.image = normalizeImageEntry(entry.image);
      }
      if ('imageUrl' in entry) {
        const normalizedUrl = normalizeSanityImageUrl(entry.imageUrl);
        if (normalizedUrl) {
          entry.imageUrl = normalizedUrl;
        }
      }
      return entry;
    });
  }

  return clone as T;
};

const normalizeCategoryEntry = <T extends { imageUrl?: unknown }>(category: T): T => {
  if (!category) return category;
  const clone: Record<string, unknown> = { ...(category as any) };
  const normalized = normalizeSanityImageUrl(clone.imageUrl);
  if (normalized) {
    clone.imageUrl = normalized;
  }
  return clone as T;
};

// Fetch all products
export async function fetchProductsFromSanity({
  categorySlug,
  tuneSlug,
  vehicleSlug,
  vehicleSlugs,
  minHp
}: {
  categorySlug?: string;
  tuneSlug?: string;
  vehicleSlug?: string;
  vehicleSlugs?: string[];
  minHp?: number;
}): Promise<Product[]> {
  try {
    if (!hasSanityConfig) return [];
    const conditions: string[] = [];
    const params: QueryParams = {};

    if (categorySlug) {
      conditions.push(`references(*[_type == "category" && slug.current == $categorySlug]._id)`);
      params.categorySlug = categorySlug;
    }
    // Do not restrict by category when none is selected; show all products
    if (tuneSlug) {
      conditions.push(`tune->slug.current == $tuneSlug`);
      params.tuneSlug = tuneSlug;
    }
    const normalizedVehicleSlugs =
      Array.isArray(vehicleSlugs) && vehicleSlugs.length
        ? Array.from(
            new Set(
              vehicleSlugs
                .map((slug) => (typeof slug === 'string' ? slug.trim().toLowerCase() : ''))
                .filter(Boolean)
            )
          )
        : null;

    if (normalizedVehicleSlugs && normalizedVehicleSlugs.length) {
      conditions.push(`count((compatibleVehicles[]->slug.current)[@ in $vehicleSlugs]) > 0`);
      params.vehicleSlugs = normalizedVehicleSlugs;
    } else if (vehicleSlug) {
      const normalizedSlug = typeof vehicleSlug === 'string' ? vehicleSlug.trim().toLowerCase() : '';
      if (normalizedSlug) {
        conditions.push(`$vehicleSlug in compatibleVehicles[]->slug.current`);
        params.vehicleSlug = normalizedSlug;
      }
    }
    if (typeof minHp === 'number' && !isNaN(minHp)) {
      conditions.push(`averageHorsepower >= $minHp`);
      params.minHp = minHp;
    }

    const query = `*[_type == "product"${conditions.length ? ` && ${conditions.join(' && ')}` : ''}]{
      _id,
      title,
      slug,
      metaTitle,
      metaDescription,
      price,
      averageHorsepower,
      description,
      shortDescription,
      importantNotes,
      brand,
      gtin,
      mpn,
      canonicalUrl,
      noindex,
      socialImage{ asset->{ _id, url }, alt },
      specifications,
      attributes,
      includedInKit[]{ item, quantity, notes },
      productType,
      requiresPaintCode,
      images[]{ asset->{ _id, url }, alt },
      tune->{ title, slug },
      compatibleVehicles[]->{ make, model, slug },
      // include free-form filter tags from schema
      filters[]->{
        _id,
        title,
        slug
      },
      // support either field name: "categories" or "category"
      "categories": select(
        defined(categories) => categories[]->{ _id, title, slug },
        defined(category) => category[]->{ _id, title, slug }
      )
    }`;

    if (!sanity) return [];

    const executeQuery = async () => {
      const results = await sanity!.fetch<Product[]>(query, params);
      return Array.isArray(results) ? results.map((item) => normalizeProductPrice(item)) : [];
    };

    return cachedSanityFetch(
      [
        'fetchProductsFromSanity',
        config.projectId,
        config.dataset,
        perspective,
        conditions,
        params
      ],
      executeQuery
    );
  } catch (err) {
    console.error('Failed to fetch products:', err);
    return [];
  }
}

// Fetch all categories
export async function fetchCategories(): Promise<Category[]> {
  try {
    if (!hasSanityConfig) return [];
    const query = `*[_type == "category" && defined(slug.current)] {
      _id,
      title,
      slug,
      "imageUrl": coalesce(image.asset->url, mainImage.asset->url, images[0].asset->url),
      description
    }`;
    if (!sanity) return [];
    const executeQuery = async () => {
      const results = await sanity!.fetch<Category[]>(query, {});
      return Array.isArray(results) ? results.map((item) => normalizeCategoryEntry(item)) : [];
    };
    return cachedSanityFetch(
      ['fetchCategories', config.projectId, config.dataset, perspective],
      executeQuery
    );
  } catch (err) {
    console.error('Failed to fetch categories:', err);
    return [];
  }
}

// Fetch all tunes
export async function fetchTunes(): Promise<Tune[]> {
  try {
    if (!hasSanityConfig) return [];
    const query = `*[_type == "tune" && defined(slug.current)] {
      _id,
      title,
      slug
    }`;
    if (!sanity) return [];
    const executeQuery = async () => sanity!.fetch<Tune[]>(query, {});
    return cachedSanityFetch(
      ['fetchTunes', config.projectId, config.dataset, perspective],
      executeQuery
    );
  } catch (err) {
    console.error('Failed to fetch tunes:', err);
    return [];
  }
}

// Fetch all vehicles
export async function fetchVehicles(): Promise<Vehicle[]> {
  try {
    if (!hasSanityConfig) return [];
    const query = `*[_type == "vehicleModel" && defined(slug.current)] {
      _id,
      title,
      slug
    }`;
    if (!sanity) return [];
    const executeQuery = async () => sanity!.fetch<Vehicle[]>(query, {});
    return cachedSanityFetch(
      ['fetchVehicles', config.projectId, config.dataset, perspective],
      executeQuery
    );
  } catch (err) {
    console.error('Failed to fetch vehicles:', err);
    return [];
  }
}

// Fetch product by slug
export async function getProductBySlug(slug: string): Promise<Product | null> {
  try {
    if (!hasSanityConfig) return null;
    const query = `*[_type == "product" && slug.current == $slug][0]{
      _id,
      title,
      slug,
      price,
      sku,
      // rich text fields may be arrays
      shortDescription,
      description,
      importantNotes,
      specifications,
      attributes,
      includedInKit[]{ item, quantity, notes },
      productType,
      images[]{ asset->{ _id, url }, alt },
      filters[]->{
        _id,
        title,
        slug
      },
      shippingClass,
      shippingWeight,
      brand,
      gtin,
      mpn,
      metaTitle,
      metaDescription,
      canonicalUrl,
      noindex,
      socialImage{ asset->{ _id, url }, alt },

      // --- Variants/Options (support multiple shapes)
      // Keep inline option objects intact (avoid projecting away custom fields like 'sizes')
      options[],
      optionGroups[],
      variationOptions[],
      variations[],

      // --- Upgrades & Custom Paint ---
      addOns[]{
        label,
        priceDelta,
        description,
        skuSuffix,
        defaultSelected,
        group, key, name, title, value, price, delta
      },
      customPaint{
        enabled,
        additionalPrice,
        paintCodeRequired,
        codeLabel,
        instructions
      },

      // --- Categories (support either field name) ---
      "categories": select(
        defined(categories) => categories[]->{ _id, title, slug },
        defined(category) => category[]->{ _id, title, slug }
      )
    }`;
    if (!sanity) return null;
    const executeQuery = async () => {
      const productResult = await sanity!.fetch<Product | null>(query, { slug });
      return productResult ? normalizeProductPrice(productResult) : null;
    };
    return cachedSanityFetch(
      ['getProductBySlug', config.projectId, config.dataset, perspective, slug],
      executeQuery
    );
  } catch (err) {
    console.error(`Failed to fetch product with slug "${slug}":`, err);
    return null;
  }
}

// Auto-related products based on overlapping categories/filters (computed at query time)
export async function getRelatedProducts(
  slug: string,
  categoryIds: string[] = [],
  filters: string[] = [],
  limit = 6
) {
  if (!hasSanityConfig) return [];
  const ids = Array.isArray(categoryIds) ? categoryIds : [];
  const flt = Array.isArray(filters) ? filters : [];
  const query = `
    *[_type == "product" && slug.current != $slug]{
      _id,
      title,
      slug,
      price,
      images[]{asset->{url}, alt},
      "categories": select(
        defined(categories) => categories[]->{ _id, title, slug },
        defined(category) => category[]->{ _id, title, slug }
      ),
      // relevance: category overlap (supports either field name) + filter overlap
      "rel": count(coalesce(category[]._ref, categories[]._ref, [])[ @ in $catIds ]) + count(coalesce(filters, [])[ @ in $filters ])
    } | order(rel desc, onSale desc, coalesce(salePrice, price, 9e9) asc, _createdAt desc)[0...$limit]
  `;
  const params = { slug, catIds: ids, filters: flt, limit } as Record<string, any>;
  if (!sanity) return [];
  const executeQuery = async () => {
    const results = await sanity!.fetch<Product[]>(query, params);
    return Array.isArray(results) ? results.map((item) => normalizeProductPrice(item)) : [];
  };
  return cachedSanityFetch(
    [
      'getRelatedProducts',
      config.projectId,
      config.dataset,
      perspective,
      slug,
      ids,
      flt,
      limit
    ],
    executeQuery
  );
}

// Auto-upsell: same category, higher (or equal) price than current item
export async function getUpsellProducts(
  slug: string,
  categoryIds: string[] = [],
  basePrice?: number,
  limit = 6
) {
  if (!hasSanityConfig) return [];
  const ids = Array.isArray(categoryIds) ? categoryIds : [];
  const hasPrice = typeof basePrice === 'number' && !Number.isNaN(basePrice);
  const query = `
    *[_type == "product" && slug.current != $slug
      && count(coalesce(category[]._ref, categories[]._ref, [])[ @ in $catIds ]) > 0
      ${hasPrice ? '&& defined(price) && price >= $price' : ''}]{
      _id,
      title,
      slug,
      price,
      images[]{asset->{url}, alt},
      "categories": select(
        defined(categories) => categories[]->{ _id, title, slug },
        defined(category) => category[]->{ _id, title, slug }
      )
    } | order(price asc, _createdAt desc)[0...$limit]
  `;
  const params: Record<string, any> = { slug, catIds: ids, limit };
  if (hasPrice) params.price = basePrice;
  if (!sanity) return [];
  const executeQuery = async () => {
    const results = await sanity!.fetch<Product[]>(query, params);
    return Array.isArray(results) ? results.map((item) => normalizeProductPrice(item)) : [];
  };
  return cachedSanityFetch(
    [
      'getUpsellProducts',
      config.projectId,
      config.dataset,
      perspective,
      slug,
      ids,
      hasPrice ? basePrice : null,
      limit
    ],
    executeQuery
  );
}

// Backwards-compatible alias to old name
export async function getSimilarProducts(
  categories: { slug?: { current?: string } }[] = [],
  currentSlug: string,
  limit = 6
): Promise<Product[]> {
  const catIds = (categories || []).map((c: any) => c?._id || c?._ref).filter(Boolean);
  return getRelatedProducts(currentSlug, catIds, [], limit);
}
