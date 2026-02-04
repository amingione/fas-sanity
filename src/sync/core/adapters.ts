// fas-sanity/src/sync/core/adapters.ts
import { SanityClient } from '@sanity/client';
import { MedusaClient } from 'medusa-js'; // Assuming Medusa JS client
import { Product as CanonicalProduct } from './types';

export async function patchSanityProduct(client: SanityClient, product: CanonicalProduct): Promise<void> {
  // TODO: Implement Sanity patch logic
}

export async function patchMedusaProduct(client: MedusaClient, product: CanonicalProduct): Promise<void> {
  // TODO: Implement Medusa patch logic
}
