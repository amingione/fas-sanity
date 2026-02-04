// fas-sanity/scripts/sync/inventory-products.ts
import { createClient } from '@sanity/client';
import { sanityProductToCanonical } from '../../src/sync/core/transforms';

// TODO: Replace with actual Sanity client configuration
const sanityClient = createClient({
  projectId: 'r4og35qd',
  dataset: 'production',
  apiVersion: '2024-01-01',
  useCdn: false,
});

async function inventoryProducts() {
  console.log('Fetching products from Sanity...');
  const products = await sanityClient.fetch('*[_type == "product"]');
  console.log(`Found ${products.length} products.`);

  const canonicalProducts = products.map(sanityProductToCanonical);

  console.log('Canonical Products (sample):', JSON.stringify(canonicalProducts.slice(0, 2), null, 2));
}

inventoryProducts().catch((error) => {
  console.error('Error during product inventory:', error);
  process.exit(1);
});
