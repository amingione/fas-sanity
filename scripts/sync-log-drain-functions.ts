import fs from 'node:fs'
import path from 'node:path'

const FUNCTIONS_DIR = path.resolve(process.cwd(), 'netlify/functions')
const DOC_PATH = path.resolve(
  process.cwd(),
  'docs',
  'SANITY AGENT',
  'Log Drains SDK',
  'functions_log_drain_sdk_types.md',
)

const START_MARKER = '<!-- LOG_DRAIN_FUNCTIONS_START -->'
const END_MARKER = '<!-- LOG_DRAIN_FUNCTIONS_END -->'
const ALLOWED_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs'])

const functionsList: string[] = []

function walk(dir: string, relativeBase = '') {
  const entries = fs.readdirSync(dir, {withFileTypes: true})
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === '__tests__') continue
    const entryPath = path.join(dir, entry.name)
    const relativePath = relativeBase ? `${relativeBase}/${entry.name}` : entry.name

    if (entry.isDirectory()) {
      walk(entryPath, relativePath)
      continue
    }

    if (!entry.isFile()) continue
    if (entry.name.endsWith('.zip')) continue

    const ext = path.extname(entry.name).toLowerCase()
    if (!ALLOWED_EXTENSIONS.has(ext)) continue

    functionsList.push(relativePath)
  }
}

if (!fs.existsSync(FUNCTIONS_DIR)) {
  console.error('Netlify functions directory not found:', FUNCTIONS_DIR)
  process.exit(1)
}

walk(FUNCTIONS_DIR)

const uniqueFunctions = Array.from(new Set(functionsList)).sort((a, b) =>
  a.localeCompare(b),
)

const bullets = uniqueFunctions.map((fn) => `- \`${fn}\``).join('\n')
const replacement = `${START_MARKER}\n${bullets}\n${END_MARKER}`

const docExists = fs.existsSync(DOC_PATH)
if (!docExists) {
  console.error('Target documentation file missing:', DOC_PATH)
  process.exit(1)
}

const docContent = fs.readFileSync(DOC_PATH, 'utf8')

if (!docContent.includes(START_MARKER) || !docContent.includes(END_MARKER)) {
  console.error('Log drain markers not found in documentation file.')
  process.exit(1)
}

const updatedContent = docContent.replace(
  new RegExp(`${START_MARKER}[\\s\\S]*?${END_MARKER}`, 'm'),
  replacement,
)

fs.writeFileSync(DOC_PATH, updatedContent, 'utf8')
console.log('Synchronized Netlify functions list with log drain documentation.')
