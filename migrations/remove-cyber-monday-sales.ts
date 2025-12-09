import {getCliClient} from 'sanity/cli'

const client = getCliClient()

async function removeCyberMondaySales() {
  console.log('Starting Cyber Monday cleanup...')

  const products = await client.fetch<{
    _id: string
    _rev: string
    title?: string
    tags?: string[]
    salePrice?: number | null
    onSale?: boolean
  }[]>(
    `
    *[_type == "product" && ("cyber-monday" in tags || defined(salePrice))] {
      _id,
      _rev,
      title,
      tags,
      salePrice,
      onSale
    }
  `,
  )

  console.log(`Found ${products.length} products to clean up`)

  const patches: Array<() => Promise<void>> = []

  for (const product of products) {
    const ops: Array<{set?: Record<string, unknown>; unset?: string[]}> = []

    if (Array.isArray(product.tags) && product.tags.includes('cyber-monday')) {
      const nextTags = product.tags.filter((tag) => tag !== 'cyber-monday')
      ops.push({set: {tags: nextTags}})
      console.log(`  Removing cyber-monday tag from: ${product.title || product._id}`)
    }

    if (product.salePrice !== null && product.salePrice !== undefined) {
      ops.push({unset: ['salePrice']})
      console.log(`  Removing salePrice ($${product.salePrice}) from: ${product.title || product._id}`)
    }

    if (product.onSale !== false) {
      ops.push({set: {onSale: false}})
      console.log(`  Setting onSale to false for: ${product.title || product._id}`)
    }

    if (ops.length === 0) continue

    patches.push(async () => {
      let tx = client.patch(product._id)
      ops.forEach((op) => {
        if (op.set) tx = tx.set(op.set)
        if (op.unset) tx = tx.unset(op.unset)
      })
      await tx.commit({autoGenerateArrayKeys: true, ifRevisionID: product._rev})
    })
  }

  // Execute in batches to avoid large transactions
  const batchSize = 10
  for (let i = 0; i < patches.length; i += batchSize) {
    const batch = patches.slice(i, i + batchSize)
    await Promise.all(batch.map((fn) => fn()))
    console.log(`Processed batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(patches.length / batchSize)}`)
  }

  console.log('\nVerifying…')
  const remaining = await client.fetch<number>(
    `count(*[_type == "product" && ("cyber-monday" in tags || defined(salePrice) || onSale == true)])`,
  )
  console.log(`Remaining products with cyber-monday tags, salePrice, or onSale=true: ${remaining}`)
}

removeCyberMondaySales()
  .then(() => {
    console.log('✅ Cleanup complete')
    process.exit(0)
  })
  .catch((err) => {
    console.error('Migration failed:', err)
    process.exit(1)
  })
