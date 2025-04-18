import { createClient } from '@sanity/client';
import dotenv from 'dotenv';
dotenv.config();

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
      productType: item.productType,
      variationOptions: item.variationOptions,
      parentProduct: item.parentProduct,
      simpleProductDetails: item.simpleProductDetails,
      specifications: item.specifications,
      vehicleCompatibility: item.vehicleCompatibility,
      horsepowerRange: item.horsepowerRange,
      partOfBundles: item.partOfBundles,
      pricingTiers: item.pricingTiers,
      bundlePreset: item.bundlePreset,
      compatibleVehicles: item.compatibleVehicles,
      attributes: item.attributes,
      installDifficulty: item.installDifficulty,
      installNotes: item.installNotes,
      mediaAssets: item.mediaAssets,
      reviews: item.reviews,
      relatedProducts: item.relatedProducts,
      upsellProducts: item.upsellProducts,
      promotionTagline: item.promotionTagline,
      promotionActive: item.promotionActive,
      promotionStartDate: item.promotionStartDate,
      promotionEndDate: item.promotionEndDate,
      coreRequired: item.coreRequired,
      coreNotes: item.coreNotes,
      condition: item.condition,
      shippingWeight: item.shippingWeight,
      boxDimensions: item.boxDimensions,
      shippingClass: item.shippingClass,
      shipsAlone: item.shipsAlone,
      handlingTime: item.handlingTime,
      specialShippingNotes: item.specialShippingNotes,
      recommendedUse: item.recommendedUse,
    };

    try {
      await client.createIfNotExists(newDoc);
      console.log(`✅ Migrated: ${item.title}`);
    } catch (err) {
      const error = err as Error;
      console.error(`❌ Failed to migrate ${item.title}:`, error.message);
    }
  }

  console.log('🚀 Migration complete');
}

migrateWooProducts().catch(console.error);