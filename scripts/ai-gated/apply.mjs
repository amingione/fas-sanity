import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import {spawn, spawnSync} from 'node:child_process'

const USAGE = `Usage:
  pnpm run ai:apply --task <task-name>
  pnpm run ai:apply --task <task-name> --prompt <prompt-path>
`

function parseArgs(argv) {
  const args = [...argv]
  const result = {task: null, prompt: null, help: false}
  for (let i = 0; i < args.length; i += 1) {
    const value = args[i]
    if (value === '--help' || value === '-h') {
      result.help = true
      continue
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

function parseNpmConfigArgv() {
  const raw = process.env.npm_config_argv
  if (!raw) {
    return null
  }
  try {
    const parsed = JSON.parse(raw)
    const source = parsed.original || parsed.cooked
    if (!Array.isArray(source)) {
      return null
    }
    return source.filter((value) => !['run', 'run-script', 'ai:apply'].includes(value))
  } catch {
    return null
  }
}

function getEffectiveArgv() {
  const direct = process.argv.slice(2)
  if (direct.length > 0) {
    return direct
  }
  const fallback = parseNpmConfigArgv()
  return fallback || []
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

function ensureCleanWorkingTree() {
  const status = runGit(['status', '--porcelain'])
  if (status.stdout.length > 0) {
    throw new Error('Working tree is not clean. Commit or stash changes before apply.')
  }
}

function createLogger(logPath) {
  return (message) => {
    const line = `[${new Date().toISOString()}] ${message}`
    fs.appendFileSync(logPath, `${line}\n`)
    console.log(line)
  }
}

async function runToolCommand(command, args, input, outputPath, log) {
  const argv = args && args.length > 0 ? ` ${args.join(' ')}` : ''
  log(`Running ${command}${argv}`)
  await new Promise((resolve, reject) => {
    const child = spawn(command, args || [], {stdio: ['pipe', 'pipe', 'pipe']})
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

function runCommand(command, args, logPath) {
  const result = spawnSync(command, args, {encoding: 'utf8'})
  fs.appendFileSync(logPath, result.stdout || '')
  fs.appendFileSync(logPath, result.stderr || '')
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`)
  }
}

async function readSnapshot(snapshotPath) {
  const stats = await fsp.stat(snapshotPath).catch(() => null)
  if (!stats || !stats.isFile()) {
    return null
  }
  const contents = await fsp.readFile(snapshotPath, 'utf8')
  return JSON.parse(contents)
}

function parseJsonFromOutput(output) {
  if (!output) return null
  const lines = output.split('\n').reverse()
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
      continue
    }
    try {
      return JSON.parse(trimmed)
    } catch {
      continue
    }
  }
  return null
}

async function main() {
  const args = parseArgs(getEffectiveArgv())
  if (args.help) {
    console.log(USAGE)
    process.exit(0)
  }
  if (!args.task) {
    exitWithUsage('Missing task name.')
  }
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(args.task)) {
    exitWithUsage('Invalid task name. Use letters, numbers, dot, dash, underscore only.')
  }

  const repoRoot = runGit(['rev-parse', '--show-toplevel']).stdout
  if (!repoRoot) {
    throw new Error('Not inside a git repository.')
  }

  ensureCleanWorkingTree()

  const baseDir = path.join(repoRoot, '.ai-stack-trace', args.task)
  await fsp.mkdir(path.join(baseDir, 'logs'), {recursive: true})
  await fsp.mkdir(path.join(baseDir, 'final'), {recursive: true})
  await fsp.mkdir(path.join(baseDir, 'codex', 'apply'), {recursive: true})

  const logPath = path.join(baseDir, 'logs', 'apply.log')
  const testLogPath = path.join(baseDir, 'logs', 'tests.log')
  const deployLogPath = path.join(baseDir, 'logs', 'deploy.log')
  const log = createLogger(logPath)

  const snapshotPath = path.join(baseDir, 'snapshots', 'base.json')
  const snapshot = await readSnapshot(snapshotPath)
  const autoBranch = snapshot?.autoBranch || `autoTest/${args.task}`
  const expectedSha = snapshot?.originalHeadSha || null
  const promptPath = args.prompt || snapshot?.prompt || null

  if (!promptPath) {
    exitWithUsage('Missing prompt path. Provide --prompt or ensure snapshot has prompt.')
  }

  const approvedPath = path.join(baseDir, 'contract', 'APPROVED')
  const approvedRaw = await fsp.readFile(approvedPath, 'utf8').catch(() => null)
  if (!approvedRaw) {
    throw new Error('Approval gate missing. Run ai:approve first.')
  }
  const approvedMatch = approvedRaw.trim().match(/^APPROVED:([^:]+):([a-f0-9]{7,40})$/i)
  if (!approvedMatch) {
    throw new Error('APPROVED file must be formatted as APPROVED:<task>:<sha>')
  }
  const approvedTask = approvedMatch[1]
  const approvedSha = approvedMatch[2]
  if (approvedTask !== args.task) {
    throw new Error(`APPROVED task mismatch: expected ${args.task}, got ${approvedTask}`)
  }
  if (expectedSha && approvedSha !== expectedSha) {
    throw new Error(`APPROVED SHA mismatch: expected ${expectedSha}, got ${approvedSha}`)
  }

  const currentBranch = runGit(['rev-parse', '--abbrev-ref', 'HEAD']).stdout
  if (currentBranch !== autoBranch) {
    runGit(['checkout', autoBranch])
    log(`Checked out ${autoBranch}`)
  }

  const promptContent = await fsp.readFile(path.resolve(promptPath), 'utf8')
  const codexPlanPath = path.join(baseDir, 'codex', 'audit', 'plan.md')
  const approvalDocPath = path.join(baseDir, 'contract', 'approval.md')
  const codexApplyOutput = path.join(baseDir, 'codex', 'apply', 'output.md')

  const codexPlan = await fsp.readFile(codexPlanPath, 'utf8').catch(() => '')
  const approvalDoc = await fsp.readFile(approvalDocPath, 'utf8').catch(() => '')

  const codexInput = [
    'CODEX APPLY MODE. APPLY ONLY APPROVED CHANGES.',
    '--- PROMPT ---',
    promptContent,
    '--- APPROVAL CONTRACT ---',
    approvalDoc,
    '--- CODEX PLAN ---',
    codexPlan,
  ].join('\n')

  await runToolCommand('codex', ['exec', '-'], codexInput, codexApplyOutput, log)
  log('Codex apply output saved.')

  const diffPath = path.join(baseDir, 'codex', 'apply', 'changes.diff')
  const diff = runGit(['diff']).stdout
  await fsp.writeFile(diffPath, `${diff}\n`)

  const changedFiles = runGit(['status', '--porcelain']).stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => line.slice(3).trim())

  try {
    runCommand('pnpm', ['test'], testLogPath)
    runCommand('pnpm', ['run', 'lint'], testLogPath)
    const driftResult = spawnSync('node', ['scripts/check-schema-drift.mjs'], {
      encoding: 'utf8',
    })
    fs.appendFileSync(testLogPath, driftResult.stdout || '')
    fs.appendFileSync(testLogPath, driftResult.stderr || '')
  } catch (error) {
    const failedPath = path.join(baseDir, 'final', 'FAILED.md')
    await fsp.writeFile(failedPath, `Failure: ${error.message}\n`)
    throw error
  }

  let deployUrl = null
  let deployId = null
  try {
    const push = runGit(['push', '-u', 'origin', autoBranch], {allowFailure: true})
    fs.appendFileSync(deployLogPath, push.stdout || '')
    fs.appendFileSync(deployLogPath, push.stderr || '')
    if (push.ok) {
      log(`Pushed ${autoBranch} to origin`)
    } else {
      log(`Push failed for ${autoBranch}. See deploy log.`)
    }
    const deployArgs = ['deploy', '--json', '--alias', 'autoTest', '--message', `ai-gated:${args.task}`]
    const defaultDir = fs.existsSync('dist') ? 'dist' : null
    const deployDir = process.env.NETLIFY_DEPLOY_DIR || defaultDir
    if (deployDir) {
      deployArgs.push('--dir', deployDir)
    }
    const deployResult = spawnSync('netlify', deployArgs, {encoding: 'utf8'})
    fs.appendFileSync(deployLogPath, deployResult.stdout || '')
    fs.appendFileSync(deployLogPath, deployResult.stderr || '')
    if (deployResult.status !== 0) {
      throw new Error('Netlify deploy failed. See deploy log for details.')
    }
    const deployJson = parseJsonFromOutput(deployResult.stdout)
    deployUrl = deployJson?.deploy_url || deployJson?.url || null
    deployId = deployJson?.deploy_id || deployJson?.id || null
    if (!deployUrl || !deployId) {
      log('Netlify deploy completed but URL/ID not found in output.')
    }
  } catch (error) {
    const failedPath = path.join(baseDir, 'final', 'FAILED.md')
    await fsp.writeFile(failedPath, `Failure: ${error.message}\n`)
    throw error
  }

  const headSha = runGit(['rev-parse', 'HEAD']).stdout
  const timestamp = new Date().toISOString()
  const status = {
    status: 'SUCCESS',
    task: args.task,
    branch: autoBranch,
    commitSha: headSha,
    timestamp,
    context: 'autoTest',
    filesChanged: changedFiles,
    testsRun: ['pnpm test', 'pnpm run lint', 'node scripts/check-schema-drift.mjs'],
    warnings: [],
    deployUrl,
    deployId,
  }
  const statusPath = path.join(baseDir, 'final', 'status.json')
  await fsp.writeFile(statusPath, `${JSON.stringify(status, null, 2)}\n`)
  log(`Final status written: ${statusPath}`)
}

main().catch((error) => {
  console.error(`[ai:apply] ${error.message}`)
  process.exit(1)
})
