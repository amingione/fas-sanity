import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import {spawn, spawnSync} from 'node:child_process'

const USAGE = `Usage:
  pnpm run ai:gated --task <task-name> --prompt <prompt-path>
`

const REQUIRED_DIRS = [
  'plan',
  'gemini/audit',
  'claude/review',
  'codex/audit',
  'codex/apply',
  'contract',
  'enforce',
  'logs',
  'snapshots',
]

function parseArgs(argv) {
  const args = {...argv}
  const result = {task: null, prompt: null}
  for (let i = 0; i < args.length; i += 1) {
    const value = args[i]
    if (value === '--help' || value === '-h') {
      return {...result, help: true}
    }
    if (value === '--task') {
      result.task = args[i + 1]
      i += 1
      continue
    }
    if (value === '--prompt') {
      result.prompt = args[i + 1]
      i += 1
    }
  }
  return result
}

function exitWithUsage(message) {
  if (message) {
    console.error(message)
  }
  console.error(USAGE)
  process.exit(1)
}

function runGit(args, {allowFailure = false} = {}) {
  const result = spawnSync('git', args, {encoding: 'utf8'})
  if (result.status !== 0) {
    if (allowFailure) {
      return {ok: false, stdout: result.stdout, stderr: result.stderr}
    }
    throw new Error(result.stderr || `git ${args.join(' ')} failed`)
  }
  return {ok: true, stdout: result.stdout.trim(), stderr: result.stderr}
}

function validateTaskName(task) {
  if (!task) {
    exitWithUsage('Missing required --task value.')
  }
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(task)) {
    exitWithUsage('Invalid task name. Use letters, numbers, dot, dash, underscore only.')
  }
}

async function ensurePromptPath(promptPath) {
  if (!promptPath) {
    exitWithUsage('Missing required --prompt value.')
  }
  const resolved = path.resolve(promptPath)
  const stats = await fsp.stat(resolved).catch(() => null)
  if (!stats || !stats.isFile()) {
    exitWithUsage(`Prompt file not found: ${promptPath}`)
  }
  return resolved
}

async function ensureDirectories(baseDir) {
  await Promise.all(
    REQUIRED_DIRS.map(async (dir) => {
      await fsp.mkdir(path.join(baseDir, dir), {recursive: true})
    }),
  )
}

function createLogger(logPath) {
  return (message) => {
    const line = `[${new Date().toISOString()}] ${message}`
    fs.appendFileSync(logPath, `${line}\n`)
    console.log(line)
  }
}

function ensureCleanWorkingTree() {
  const status = runGit(['status', '--porcelain'])
  if (status.stdout.length > 0) {
    throw new Error('Working tree is not clean. Commit or stash changes before running.')
  }
}

async function runToolCommand(command, input, outputPath, log) {
  log(`Running ${command}`)
  await new Promise((resolve, reject) => {
    const child = spawn(command, [], {stdio: ['pipe', 'pipe', 'pipe']})
    const outputStream = fs.createWriteStream(outputPath, {encoding: 'utf8'})
    let stderr = ''

    child.stdout.pipe(outputStream)
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', (error) => {
      reject(error)
    })
    child.on('close', (code) => {
      outputStream.end()
      if (code !== 0) {
        reject(new Error(`${command} exited with code ${code}: ${stderr}`))
        return
      }
      resolve()
    })

    child.stdin.write(input)
    child.stdin.end()
  })
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(USAGE)
    process.exit(0)
  }

  validateTaskName(args.task)
  const promptPath = await ensurePromptPath(args.prompt)

  const repoRoot = runGit(['rev-parse', '--show-toplevel']).stdout
  if (!repoRoot) {
    throw new Error('Not inside a git repository.')
  }

  ensureCleanWorkingTree()

  const baseDir = path.join(repoRoot, '.ai-stack-trace', args.task)
  await ensureDirectories(baseDir)

  const logPath = path.join(baseDir, 'logs', 'run.log')
  const log = createLogger(logPath)

  const branch = runGit(['rev-parse', '--abbrev-ref', 'HEAD']).stdout
  const headSha = runGit(['rev-parse', 'HEAD']).stdout
  const timestamp = new Date().toISOString()
  const autoBranch = `autoTest/${args.task}`

  log(`Task: ${args.task}`)
  log(`Prompt: ${promptPath}`)
  log(`Branch: ${branch}`)
  log(`Head SHA: ${headSha}`)

  const existingBranch = runGit(['rev-parse', '--verify', autoBranch], {allowFailure: true})
  if (existingBranch.ok) {
    throw new Error(`Branch already exists: ${autoBranch}`)
  }

  runGit(['checkout', '-b', autoBranch])
  log(`Created branch ${autoBranch}`)

  const snapshotPath = path.join(baseDir, 'snapshots', 'base.json')
  const snapshot = {
    task: args.task,
    prompt: promptPath,
    originalBranch: branch,
    originalHeadSha: headSha,
    autoBranch,
    timestamp,
  }
  await fsp.writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`)
  log(`Snapshot written: ${snapshotPath}`)

  const promptContent = await fsp.readFile(promptPath, 'utf8')
  const geminiOutputPath = path.join(baseDir, 'gemini', 'audit', 'output.md')
  const claudeOutputPath = path.join(baseDir, 'claude', 'review', 'output.md')
  const codexPlanPath = path.join(baseDir, 'codex', 'audit', 'plan.md')

  await runToolCommand('gemini', promptContent, geminiOutputPath, log)
  const geminiOutput = await fsp.readFile(geminiOutputPath, 'utf8')

  await runToolCommand('claude', geminiOutput, claudeOutputPath, log)
  const claudeOutput = await fsp.readFile(claudeOutputPath, 'utf8')

  const codexInput = [
    'CODEX PLAN ONLY. DO NOT APPLY PATCHES.',
    '--- PROMPT ---',
    promptContent,
    '--- GEMINI AUDIT ---',
    geminiOutput,
    '--- CLAUDE REVIEW ---',
    claudeOutput,
  ].join('\n')

  await runToolCommand('codex', codexInput, codexPlanPath, log)
  log('Codex plan output saved.')

  const approvalPath = path.join(baseDir, 'contract', 'approval.md')
  const approvalInstructions = [
    '# Approval Gate',
    '',
    'This run is paused for human approval.',
    '',
    'To approve and continue (future phase), create:',
    `.ai-stack-trace/${args.task}/contract/APPROVED`,
    '',
    'File contents must be:',
    `APPROVED:${args.task}:${headSha}`,
    '',
    'Until that file exists, the runner must refuse to continue.',
  ].join('\n')
  await fsp.writeFile(approvalPath, `${approvalInstructions}\n`)
  log(`Approval instructions written: ${approvalPath}`)

  const approvedFlagPath = path.join(baseDir, 'contract', 'APPROVED')
  const approvedFlag = await fsp.stat(approvedFlagPath).catch(() => null)
  if (!approvedFlag) {
    log('Approval not found. Create the APPROVED file to proceed.')
    process.exit(2)
  }

  log('Approval file detected. No apply phase is implemented yet.')
}

main().catch((error) => {
  console.error(`[ai:gated] ${error.message}`)
  process.exit(1)
})
