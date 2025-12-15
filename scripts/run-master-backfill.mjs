#!/usr/bin/env node

/**
 * Utility script to invoke the masterBackfill Netlify function across paginated
 * offsets. Useful locally where the Netlify Dev timeout limits long-running batches.
 *
 * Examples:
 *   node scripts/run-master-backfill.mjs
 *   node scripts/run-master-backfill.mjs --base http://localhost:8888/.netlify/functions/masterBackfill --limit 50 --batches 6 --dryRun true
 */

const args = process.argv.slice(2)

const getArg = (name, fallback) => {
  const index = args.findIndex((arg) => arg === `--${name}`)
  if (index >= 0 && args[index + 1]) {
    return args[index + 1]
  }
  const withEquals = args.find((arg) => arg.startsWith(`--${name}=`))
  if (withEquals) {
    return withEquals.split('=').slice(1).join('=') || fallback
  }
  return fallback
}

const baseUrl =
  getArg('base', process.env.BACKFILL_BASE_URL) ||
  'http://localhost:8888/.netlify/functions/masterBackfill'
const limit = Number(getArg('limit', process.env.BACKFILL_LIMIT || '40'))
const batches = Number(getArg('batches', process.env.BACKFILL_BATCHES || '5'))
let offset = Number(getArg('offset', process.env.BACKFILL_OFFSET || '0'))
const dryRunRaw = getArg('dryRun', process.env.BACKFILL_DRY_RUN)
const dryRun =
  typeof dryRunRaw === 'string'
    ? dryRunRaw.toLowerCase() !== 'false'
    : process.env.BACKFILL_DRY_RUN
      ? process.env.BACKFILL_DRY_RUN.toLowerCase() !== 'false'
      : true

if (!Number.isFinite(limit) || limit <= 0) {
  console.error('Invalid limit value. Provide --limit=<number>.')
  process.exit(1)
}

if (!Number.isFinite(batches) || batches <= 0) {
  console.error('Invalid batches value. Provide --batches=<number>.')
  process.exit(1)
}

if (!Number.isFinite(offset) || offset < 0) {
  console.error('Invalid offset value. Provide --offset=<number>.')
  process.exit(1)
}

const run = async () => {
  console.log(
    `Running masterBackfill in ${batches} batches (limit=${limit}, dryRun=${dryRun}, starting offset=${offset})`,
  )

  for (let batch = 0; batch < batches; batch += 1) {
    const url = `${baseUrl}?limit=${limit}&offset=${offset}&dryRun=${dryRun}`
    console.log(`\nBatch ${batch + 1}/${batches} -> ${url}`)
    try {
      const response = await fetch(url, {method: 'POST'})
      const text = await response.text()
      if (!response.ok) {
        console.error(`Request failed (status ${response.status}): ${text}`)
        break
      }
      console.log(text)

      let parsed
      try {
        parsed = JSON.parse(text)
      } catch {
        // ignore JSON parse errors; the response was already printed
      }

      const totalThisRun = parsed?.stats?.total
      offset += limit

      if (!totalThisRun || totalThisRun < limit) {
        console.log('No more orders to process, exiting early.')
        break
      }
    } catch (err) {
      console.error(`Batch ${batch + 1} failed:`, err)
      break
    }
  }

  console.log('\nBackfill batches completed.')
}

run()
