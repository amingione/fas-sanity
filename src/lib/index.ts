export {fetchProductRequirements} from './fetchProductRequirements'
export type {FetchProductRequirementsOptions, ProductRequirements} from './fetchProductRequirements'
export {
  fetchPhysicalProducts,
  fetchServiceProducts,
  fetchBundleProducts,
  type FetchCatalogOptions,
} from './fetchCatalogProducts'
export {
  evaluateProductSelections,
  type ProductRequirementContext,
  type SelectionEvaluation,
  type SelectionMaps,
} from './evaluateProductSelections'
export {
  PHYSICAL_PRODUCTS_QUERY,
  SERVICE_PRODUCTS_QUERY,
  BUNDLE_PRODUCTS_QUERY,
  type CatalogProduct,
} from './productQueries'
export {normalizeAddress, type CanonicalAddress} from './address'
