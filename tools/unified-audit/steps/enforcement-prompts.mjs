import path from 'node:path'
import { writeText } from '../lib/utils.mjs'

function promptTemplate({ repo, service, inputs }) {
  return [
    `REPO SCOPE: ${repo}`,
    `SERVICE SCOPE: ${service}`,
    '',
    'AUTHORITATIVE INPUTS (READ-ONLY):',
    ...inputs.map((input) => `- ${input}`),
    '',
    'AUTHORIZATION GATE:',
    'Proceed only if ALL authoritative JSON inputs contain enforcementApproved: true.',
    'Else STOP.',
    '',
    'STRICT RULES:',
    '- Patch-only changes; no refactors, no reformatting, no unrelated edits.',
    '- Use the audit outputs to resolve only the cited violations.',
    '- Preserve existing business logic; do not change schema unless explicitly approved.',
    '',
    'TASK:',
    'Apply the minimal code changes required to remediate the audit findings for this service scope.',
    '',
  ].join('\n')
}

export async function runEnforcementPrompts(context) {
  const { outputDir } = context
  const promptsDir = path.join(outputDir, 'CODEX-PROMPTS')

  const prompts = [
    {
      repo: 'fas-cms',
      service: 'easypost',
      inputs: [
        'api-contract-violations.json',
        'integrations-inventory.json',
        'schema-index.json',
      ],
    },
    {
      repo: 'fas-cms',
      service: 'resend',
      inputs: [
        'api-contract-violations.json',
        'integrations-inventory.json',
        'schema-index.json',
      ],
    },
    {
      repo: 'fas-cms',
      service: 'schemas',
      inputs: [
        'schema-index.json',
        'query-index.json',
        'schema-vs-query.json',
        'sanity-runtime-scan.json',
      ],
    },
    {
      repo: 'fas-cms',
      service: 'env',
      inputs: [
        'env-resolution-matrix.json',
        'integrations-inventory.json',
      ],
    },
    {
      repo: 'fas-sanity',
      service: 'schemas',
      inputs: [
        'schema-index.json',
        'sanity-runtime-scan.json',
        'schema-vs-query.json',
      ],
    },
    {
      repo: 'fas-sanity',
      service: 'env',
      inputs: [
        'env-resolution-matrix.json',
        'integrations-inventory.json',
      ],
    },
  ]

  for (const prompt of prompts) {
    const filePath = path.join(promptsDir, prompt.repo, `${prompt.service}.txt`)
    writeText(filePath, promptTemplate(prompt))
  }

  return { status: 'OK', generatedAt: new Date().toISOString() }
}
