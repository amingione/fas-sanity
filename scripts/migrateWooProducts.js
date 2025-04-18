const { createClient } = require('@sanity/client');
require('dotenv').config();

const client = createClient({
  projectId: 'r4og35qd',
  dataset: 'production',
  token: process.env.SANITY_API_TOKEN,
  useCdn: false,
  apiVersion: '2023-01-01',
});

async function migrateWooProducts() {
  const wooProducts = await client.fetch(`*[_type == "wooProduct"]`);

  if (wooProducts.length === 0) {
    console.log("⚠️ No wooProduct documents found.");
    return;
  }

  console.log(`Found ${wooProducts.length} wooProduct(s) to migrate...`);

  for (const item of wooProducts) {
    const newDoc = {
      _id: `product-${item._id.replace('wooProduct-', '')}`,
      _type: 'product',
      title: item.title,
      slug: item.slug,
      description: item.description,
      price: item.price,
      salePrice: item.salePrice,
      onSale: item.onSale,
      sku: item.sku,
      inventory: item.inventory,
      images: item.images,
      categories: item.categories,
      featured: item.featured,
      upsellProducts: item.upsellProducts
    };

    try {
      await client.createIfNotExists(newDoc);
      console.log(`✅ Migrated: ${item.title}`);
    } catch (err) {
      console.error(`❌ Failed to migrate ${item.title}:`, err.message);
    }
  }

  console.log('🚀 Migration complete');
}

migrateWooProducts().catch(console.error);