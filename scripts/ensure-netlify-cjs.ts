import {mkdirSync, writeFileSync} from 'node:fs'
import {dirname, join} from 'node:path'

const TARGETS = [
  join(process.cwd(), 'packages', 'sanity-config', '.netlify', 'package.json'),
]

const CONTENT = JSON.stringify({type: 'commonjs'}, null, 2)

for (const target of TARGETS) {
  const dir = dirname(target)
  try {
    mkdirSync(dir, {recursive: true})
  } catch {
    // ignore mkdir errors (best effort)
  }
  try {
    writeFileSync(target, CONTENT)
  } catch {
    // ignore write errors (best effort)
  }
}
