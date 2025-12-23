import dotenv from 'dotenv'
import {createClient} from '@sanity/client'

dotenv.config()

const client = createClient({
  projectId: 'your_id',
  dataset: 'production',
  token: process.env.SANITY_API_TOKEN,
  apiVersion: '2023-10-01',
  useCdn: false,
})

async function run() {
  const products = await client.fetch(`*[_type=="product"]{_id,name,fitmentYears}`)

  for (const p of products) {
    const slug = p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    const metaTitle = `${p.name} | ${p.fitmentYears || ''} Performance | FAS Motorsports`
    const metaDescription = `Upgrade your ${p.fitmentYears || ''} ${p.name} for maximum performance. Order now from FAS Motorsports.`.slice(0,155)

    await client
      .patch(p._id)
      .set({
        seoSlug: { _type: 'slug', current: slug },
        metaTitle,
        metaDescription,
        focusKeyword: p.name.split(' ')[0],
      })
      .commit()
  }
}

run()
