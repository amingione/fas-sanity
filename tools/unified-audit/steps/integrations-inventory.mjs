import fs from 'node:fs/promises'
import { listRepoFiles, relativeToRepo } from '../lib/file-scan.mjs'
import { cleanSnippet, stableSort, uniqueArray } from '../lib/utils.mjs'

const SIGNATURES = [
  { category: 'sanity', match: /@sanity\/client|createClient\(/ },
  { category: 'easypost', match: /easypost|EasyPost|EASYPOST_/i },
  { category: 'resend', match: /resend|RESEND_/i },
  { category: 'shipengine', match: /shipengine|SHIPENGINE_/i },
  { category: 'stripe', match: /stripe|STRIPE_/i },
  { category: 'twilio', match: /twilio|TWILIO_/i },
  { category: 'netlify', match: /netlify\/functions|Netlify/i },
  { category: 'vercel', match: /vercel|Vercel/i }
]

const ENV_REGEX = [
  /process\.env\.([A-Z0-9_]+)/g,
  /import\.meta\.env\.([A-Z0-9_]+)/g
]

export async function runIntegrationsInventory({ repos }) {
  const result = {
    status: 'PASS',
    hits: [],
    envKeys: {}
  }

  const files = []
  for (const repo of repos) {
    const repoFiles = await listRepoFiles(repo.path, ['**/*.{ts,tsx,js,jsx,mjs,cjs}'])
    for (const file of repoFiles) files.push({ repo, file })
  }

  for (const { repo, file } of files) {
    const content = await fs.readFile(file, 'utf8')
    const lines = content.split(/\r?\n/)

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i]
      for (const sig of SIGNATURES) {
        if (sig.match.test(line)) {
          result.hits.push({
            category: sig.category,
            repo: repo.name,
            file: relativeToRepo(repo.path, file),
            lineNo: i + 1,
            snippet: cleanSnippet(line)
          })
        }
      }
    }

    for (const regex of ENV_REGEX) {
      let match
      while ((match = regex.exec(content))) {
        const key = match[1]
        if (!result.envKeys[key]) result.envKeys[key] = { files: [] }
        result.envKeys[key].files.push(`${repo.name}/${relativeToRepo(repo.path, file)}`)
      }
    }
  }

  result.hits = result.hits.sort((a, b) => {
    const aKey = `${a.repo}/${a.file}:${a.lineNo}:${a.category}`
    const bKey = `${b.repo}/${b.file}:${b.lineNo}:${b.category}`
    return aKey.localeCompare(bKey)
  })

  for (const [key, data] of Object.entries(result.envKeys)) {
    data.files = stableSort(uniqueArray(data.files))
    result.envKeys[key] = data
  }

  return result
}
