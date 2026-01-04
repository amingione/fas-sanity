import path from 'node:path'
import { ensureDir, writeText } from '../lib/utils.mjs'

const SERVICES = [
  { repo: 'fas-cms', service: 'easypost', inputs: ['api-contract-violations.json'] },
  { repo: 'fas-cms', service: 'resend', inputs: ['api-contract-violations.json'] },
  { repo: 'fas-cms', service: 'schemas', inputs: ['schema-index.json', 'query-index.json', 'schema-vs-query.json', 'sanity-runtime-scan.json'] },
  { repo: 'fas-cms', service: 'env', inputs: ['env-resolution-matrix.json'] },
  { repo: 'fas-sanity', service: 'schemas', inputs: ['schema-index.json', 'sanity-runtime-scan.json', 'schema-vs-query.json'] },
  { repo: 'fas-sanity', service: 'env', inputs: ['env-resolution-matrix.json'] }
]

function buildPrompt({ repo, service, inputs }) {
  return `CODEX ENFORCEMENT PROMPT\n\nREPO SCOPE: ${repo}\nSERVICE SCOPE: ${service}\n\nAUTHORITATIVE INPUTS (READ-ONLY)\n${inputs.map(input => `- ${input}`).join('\n')}\n\nAUTHORIZATION GATE\nProceed only if the above JSON inputs contain enforcementApproved: true.\nIf not present or false, STOP immediately.\n\nRULES\n- Patch-only changes. No refactors.\n- No unrelated edits.\n- Use the audit outputs as the sole source of truth.\n- If a required field or mapping is missing, add the minimum code to satisfy the schema.\n- Never change schema definitions unless explicitly approved separately.\n`
}

export async function runEnforcementPrompts({ outputDir }) {
  const promptsDir = path.join(outputDir, 'CODEX-PROMPTS')
  await ensureDir(promptsDir)

  for (const entry of SERVICES) {
    const repoDir = path.join(promptsDir, entry.repo)
    await ensureDir(repoDir)
    const prompt = buildPrompt(entry)
    const filePath = path.join(repoDir, `${entry.service}.txt`)
    await writeText(filePath, prompt)
  }

  return {
    status: 'PASS',
    promptsDir: promptsDir,
    files: SERVICES.map(entry => `${entry.repo}/${entry.service}.txt`)
  }
}
