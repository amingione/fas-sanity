import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import {spawnSync} from 'node:child_process'

const USAGE = `Usage:
  pnpm run ai:rollback <task-name>
  pnpm run ai:rollback --task <task-name>
`

function parseArgs(argv) {
  const args = [...argv]
  const result = {task: null, help: false}
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
    if (!value.startsWith('-') && !result.task) {
      result.task = value
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

function ensureCleanWorkingTree() {
  const status = runGit(['status', '--porcelain'])
  if (status.stdout.length > 0) {
    throw new Error('Working tree is not clean. Commit or stash changes before rollback.')
  }
}

function createLogger(logPath) {
  return (message) => {
    const line = `[${new Date().toISOString()}] ${message}`
    fs.appendFileSync(logPath, `${line}\n`)
    console.log(line)
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

async function main() {
  const args = parseArgs(process.argv.slice(2))
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
  const logPath = path.join(baseDir, 'logs', 'rollback.log')
  const log = createLogger(logPath)

  const snapshotPath = path.join(baseDir, 'snapshots', 'base.json')
  const snapshot = await readSnapshot(snapshotPath)
  const originalBranch = snapshot?.originalBranch || null
  const autoBranch = snapshot?.autoBranch || `autoTest/${args.task}`

  log(`Task: ${args.task}`)
  if (snapshot) {
    log(`Snapshot found: ${snapshotPath}`)
  } else {
    log('Snapshot missing. Proceeding with best-effort rollback.')
  }

  if (originalBranch) {
    runGit(['checkout', originalBranch])
    log(`Checked out original branch: ${originalBranch}`)
  } else {
    log('Original branch unknown. Staying on current branch.')
  }

  const branchExists = runGit(['rev-parse', '--verify', autoBranch], {allowFailure: true})
  if (branchExists.ok) {
    runGit(['branch', '-D', autoBranch])
    log(`Deleted local branch: ${autoBranch}`)
  } else {
    log(`Local branch not found: ${autoBranch}`)
  }

  const remotes = runGit(['remote'], {allowFailure: true})
  if (remotes.ok && remotes.stdout.split('\n').includes('origin')) {
    const remoteDelete = runGit(['push', 'origin', '--delete', autoBranch], {
      allowFailure: true,
    })
    if (remoteDelete.ok) {
      log(`Deleted remote branch: origin/${autoBranch}`)
    } else {
      log(`Remote branch deletion failed or missing: origin/${autoBranch}`)
    }
  } else {
    log('No origin remote configured. Skipping remote cleanup.')
  }

  log('Rollback complete.')
}

main().catch((error) => {
  console.error(`[ai:rollback] ${error.message}`)
  process.exit(1)
})
