import fs from 'node:fs/promises'
import {existsSync} from 'node:fs'
import path from 'node:path'
import SftpClient from 'ssh2-sftp-client'
import dotenv from 'dotenv'
import {merchantFeedRowsToCsv, type MerchantFeedRow} from '../shared/merchantFeed'

type MerchantFeedApiResponse = {
  generatedAt: string
  count: number
  total: number
  rows: MerchantFeedRow[]
  skipped: Array<{id: string; reason: string}>
}

const dotenvPaths = ['.env', '.env.local', '.env.development']
dotenvPaths.forEach((configPath) => {
  if (existsSync(configPath)) {
    dotenv.config({path: configPath, override: false})
  }
})

const SFTP_HOST =
  process.env.GOOGLE_MERCHANT_SFTP_HOST || process.env.GMC_SFTP_HOST || 'partnerupload.google.com'
const SFTP_PORT = Number(
  process.env.GOOGLE_MERCHANT_SFTP_PORT || process.env.GMC_SFTP_PORT || 19321,
)
const SFTP_USERNAME = process.env.GOOGLE_MERCHANT_SFTP_USERNAME || process.env.GMC_SFTP_USERNAME
const SFTP_PASSWORD = process.env.GOOGLE_MERCHANT_SFTP_PASSWORD || process.env.GMC_SFTP_PASSWORD
const SFTP_REMOTE_DIR = (
  process.env.GOOGLE_MERCHANT_SFTP_REMOTE_DIR ||
  process.env.GMC_SFTP_REMOTE_DIR ||
  '/'
).replace(/\/?$/, '/')
const SFTP_FILENAME =
  process.env.GOOGLE_MERCHANT_SFTP_FILENAME || process.env.GMC_SFTP_FEED_FILENAME || 'products.csv'
const OUTPUT_DIR =
  process.env.GOOGLE_MERCHANT_FEED_OUTPUT_DIR ||
  process.env.GMC_FEED_OUTPUT_DIR ||
  path.resolve(process.cwd(), 'tmp')
const MERCHANT_FEED_SECRET =
  process.env.MERCHANT_FEED_API_SECRET || process.env.GOOGLE_MERCHANT_FEED_SECRET || ''

function resolveFeedEndpoint(): string {
  const explicitUrl =
    process.env.MERCHANT_FEED_API_URL || process.env.GOOGLE_MERCHANT_FEED_URL || ''
  if (explicitUrl) {
    return explicitUrl
  }

  const possibleBases = [
    process.env.URL,
    process.env.DEPLOY_URL,
    process.env.DEPLOY_PRIME_URL,
    process.env.SITE_BASE_URL,
    process.env.PUBLIC_SITE_URL,
  ].filter(Boolean) as string[]

  for (const base of possibleBases) {
    const normalized = base.replace(/\/$/, '')
    if (normalized) {
      return `${normalized}/.netlify/functions/merchant-feed`
    }
  }

  if (process.env.NETLIFY_DEV === 'true' || process.env.NODE_ENV !== 'production') {
    return 'http://localhost:8888/.netlify/functions/merchant-feed'
  }

  throw new Error(
    'Set MERCHANT_FEED_API_URL (or GOOGLE_MERCHANT_FEED_URL) so the feed uploader can fetch data.',
  )
}

const MERCHANT_FEED_ENDPOINT = resolveFeedEndpoint()

const REQUIRED_ENV: Array<[string, string | undefined]> = [
  ['GOOGLE_MERCHANT_SFTP_USERNAME / GMC_SFTP_USERNAME', SFTP_USERNAME],
  ['GOOGLE_MERCHANT_SFTP_PASSWORD / GMC_SFTP_PASSWORD', SFTP_PASSWORD],
] as const

function assertEnv() {
  const missing = REQUIRED_ENV.filter(([, value]) => !value).map(([key]) => key)
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
  }
}

async function fetchMerchantFeed(): Promise<MerchantFeedApiResponse> {
  const url = new URL(MERCHANT_FEED_ENDPOINT)
  url.searchParams.set('format', 'json')

  const headers: Record<string, string> = {}
  if (MERCHANT_FEED_SECRET) {
    headers['x-merchant-feed-secret'] = MERCHANT_FEED_SECRET
  }

  const response = await fetch(url.toString(), {headers})
  if (!response.ok) {
    const text = await response.text()
    throw new Error(
      `Merchant feed request failed (${response.status} ${response.statusText}): ${text}`,
    )
  }

  const payload = (await response.json()) as MerchantFeedApiResponse
  if (!payload || !Array.isArray(payload.rows)) {
    throw new Error('Merchant feed response was not in the expected format')
  }

  return payload
}

async function writeFeed(content: string): Promise<string> {
  await fs.mkdir(OUTPUT_DIR, {recursive: true})
  const outputPath = path.join(OUTPUT_DIR, SFTP_FILENAME)
  await fs.writeFile(outputPath, content, 'utf8')
  return outputPath
}

async function uploadViaSftp(localPath: string): Promise<void> {
  const sftp = new SftpClient()
  try {
    await sftp.connect({
      host: SFTP_HOST,
      port: SFTP_PORT,
      username: SFTP_USERNAME,
      password: SFTP_PASSWORD,
      readyTimeout: 20000,
    })

    const remotePath = `${SFTP_REMOTE_DIR}${path.basename(localPath)}`
    await sftp.put(localPath, remotePath)
    console.log(`Uploaded feed to ${remotePath}`)
  } finally {
    sftp.end().catch(() => {
      // ignore
    })
  }
}

async function main() {
  assertEnv()

  console.log(`Fetching merchant feed from ${MERCHANT_FEED_ENDPOINT}…`)
  const payload = await fetchMerchantFeed()
  console.log(
    `Fetched ${payload.count} rows from API (source documents: ${payload.total}, skipped: ${payload.skipped.length})`,
  )

  if (payload.rows.length === 0) {
    throw new Error('Merchant feed API returned zero valid rows')
  }

  const csvContent = merchantFeedRowsToCsv(payload.rows)
  console.log(`Writing feed with ${payload.rows.length} rows…`)
  const localPath = await writeFeed(csvContent)
  console.log(`Feed written to ${localPath}`)

  console.log(`Uploading ${path.basename(localPath)} via SFTP…`)
  await uploadViaSftp(localPath)

  if (payload.skipped.length > 0) {
    console.warn('Skipped rows reported by API:')
    payload.skipped.forEach((entry) => {
      console.warn(` - ${entry.id}: ${entry.reason}`)
    })
  }

  console.log(`Feed generated at ${payload.generatedAt}`)
  console.log('Done.')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
