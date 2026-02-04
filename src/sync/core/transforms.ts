// fas-sanity/src/sync/core/transforms.ts
import { Product as SanityProduct } from '@sanity/client'; // Assuming Sanity product type
import { Product as MedusaProduct } from '@medusajs/medusa'; // Assuming Medusa product type
import { Product as CanonicalProduct } from './types';

export function sanityProductToCanonical(product: SanityProduct): CanonicalProduct {
  // TODO: Implement transformation logic
  return {} as CanonicalProduct;
}

export function medusaProductToCanonical(product: MedusaProduct): CanonicalProduct {
  // TODO: Implement transformation logic
  return {} as CanonicalProduct;
}
