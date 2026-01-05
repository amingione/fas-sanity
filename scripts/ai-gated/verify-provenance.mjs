import fs from 'node:fs'
import path from 'node:path'
import {spawnSync} from 'node:child_process'

const DOC_EXTENSIONS = new Set(['.md', '.mdx', '.txt'])
const DOC_PREFIXES = ['docs/', '.docs/', '.github/']
const RUNTIME_PREFIXES = [
  'application/',
  'components/',
  'config/',
  'functions/',
  'lib/',
  'packages/',
  'queries/',
  'schemas/',
  'shared/',
  'src/',
  'utils/',
]

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

function parseArgs(argv) {
  const args = [...argv]
  const result = {task: null, base: null}
  for (let i = 0; i < args.length; i += 1) {
    const value = args[i]
    if (value === '--task') {
      result.task = args[i + 1]
      i += 1
      continue
    }
    if (value === '--base') {
      result.base = args[i + 1]
      i += 1
    }
  }
  return result
}

function isDocPath(filePath) {
  if (DOC_PREFIXES.some((prefix) => filePath.startsWith(prefix))) {
    return true
  }
  if (filePath === 'README.md') {
    return true
  }
  const ext = path.extname(filePath)
  return DOC_EXTENSIONS.has(ext)
}

function isRuntimePath(filePath) {
  return RUNTIME_PREFIXES.some((prefix) => filePath.startsWith(prefix))
}

function isBackfillScript(filePath) {
  if (!filePath.startsWith('scripts/')) {
    return false
  }
  const base = path.basename(filePath).toLowerCase()
  return base.startsWith('backfill') || filePath.toLowerCase().includes('/backfill')
}

function getChangedFiles(baseRef) {
  const diff = runGit(['diff', '--name-only', `${baseRef}...HEAD`]).stdout
  if (!diff) return []
  return diff.split('\n').map((line) => line.trim()).filter(Boolean)
}

function getBaseRef(explicitBase) {
  if (explicitBase) {
    return explicitBase
  }
  if (process.env.GITHUB_BASE_REF) {
    return `origin/${process.env.GITHUB_BASE_REF}`
  }
  return 'origin/main'
}

function listTaskDirs(stackRoot) {
  if (!fs.existsSync(stackRoot)) {
    return []
  }
  return fs
    .readdirSync(stackRoot, {withFileTypes: true})
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
}

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8')
  return JSON.parse(raw)
}

function requireFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing ${label}: ${filePath}`)
  }
}

function requireDirectoryWithFiles(dirPath, label) {
  if (!fs.existsSync(dirPath)) {
    throw new Error(`Missing ${label}: ${dirPath}`)
  }
  const entries = fs.readdirSync(dirPath).filter((entry) => !entry.startsWith('.'))
  if (!entries.length) {
    throw new Error(`Empty ${label}: ${dirPath}`)
  }
}

function getApprovedPaths(approvalPath) {
  if (!fs.existsSync(approvalPath)) {
    return []
  }
  const content = fs.readFileSync(approvalPath, 'utf8')
  const matches = [...content.matchAll(/`([^`]+)`/g)].map((match) => match[1])
  const paths = matches.filter((value) => value.includes('/') || value.includes('.'))
  return [...new Set(paths)]
}

function matchApprovedPath(filePath, approvedPaths) {
  for (const approved of approvedPaths) {
    if (approved === filePath) return true
    if (approved.endsWith('/**')) {
      const prefix = approved.slice(0, -3)
      if (filePath.startsWith(prefix)) return true
    }
    if (approved.endsWith('/*')) {
      const prefix = approved.slice(0, -2)
      if (filePath.startsWith(prefix)) return true
    }
    if (approved.endsWith('/')) {
      if (filePath.startsWith(approved)) return true
    }
    if (approved.includes('*')) {
      const pattern = `^${approved.replace(/\./g, '\\.').replace(/\*/g, '.*')}$`
      const regex = new RegExp(pattern)
      if (regex.test(filePath)) return true
    }
  }
  return false
}

function getMergeBase(baseRef) {
  const base = runGit(['merge-base', baseRef, 'HEAD'], {allowFailure: true})
  if (!base.ok || !base.stdout) {
    return null
  }
  return base.stdout.trim()
}

function getTaskDir(stackRoot, taskArg) {
  if (taskArg) {
    const taskDir = path.join(stackRoot, taskArg)
    if (!fs.existsSync(taskDir)) {
      throw new Error(`Task directory not found: ${taskDir}`)
    }
    return {task: taskArg, taskDir}
  }
  const tasks = listTaskDirs(stackRoot)
  if (tasks.length === 1) {
    return {task: tasks[0], taskDir: path.join(stackRoot, tasks[0])}
  }
  if (!tasks.length) {
    throw new Error('No .ai-stack-trace task directories found.')
  }
  throw new Error('Multiple .ai-stack-trace tasks found. Pass --task <name>.')
}

function getStatusFilesChanged(status) {
  if (Array.isArray(status.filesChanged)) return status.filesChanged
  if (Array.isArray(status.changedFiles)) return status.changedFiles
  if (Array.isArray(status.files)) return status.files
  return []
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const baseRef = getBaseRef(args.base)
  const baseCheck = runGit(['rev-parse', '--verify', baseRef], {allowFailure: true})
  if (!baseCheck.ok) {
    throw new Error(`Base ref not found: ${baseRef}`)
  }

  const changedFiles = getChangedFiles(baseRef)
  const nonDocChanges = changedFiles.filter((filePath) => !isDocPath(filePath))
  const requiresProvenance = nonDocChanges.some(
    (filePath) => isRuntimePath(filePath) || isBackfillScript(filePath),
  )

  if (!requiresProvenance) {
    console.log('✅ AI provenance check: no runtime/schema/backfill changes detected')
    return
  }

  const stackRoot = path.resolve('.ai-stack-trace')
  const {task, taskDir} = getTaskDir(stackRoot, args.task)

  const approvedPath = path.join(taskDir, 'contract', 'APPROVED')
  const codexAuditDir = path.join(taskDir, 'codex', 'audit')
  const claudeReviewDir = path.join(taskDir, 'claude', 'review')
  const geminiAuditDir = path.join(taskDir, 'gemini', 'audit')
  const finalStatusPath = path.join(taskDir, 'final', 'status.json')
  const approvalDocPath = path.join(taskDir, 'contract', 'approval.md')
  const snapshotPath = path.join(taskDir, 'snapshots', 'base.json')

  requireFile(approvedPath, 'APPROVED file')
  requireDirectoryWithFiles(codexAuditDir, 'Codex audit artifacts')
  requireDirectoryWithFiles(claudeReviewDir, 'Claude review artifacts')
  requireDirectoryWithFiles(geminiAuditDir, 'Gemini audit artifacts')
  requireFile(finalStatusPath, 'final status report')

  const approvedRaw = fs.readFileSync(approvedPath, 'utf8').trim()
  const approvedMatch = approvedRaw.match(/^APPROVED:([^:]+):([a-f0-9]{7,40})$/i)
  if (!approvedMatch) {
    throw new Error('APPROVED file must be formatted as APPROVED:<task>:<sha>')
  }
  const approvedTask = approvedMatch[1]
  const approvedSha = approvedMatch[2]
  if (approvedTask !== task) {
    throw new Error(`APPROVED task mismatch: expected ${task}, got ${approvedTask}`)
  }

  let expectedSha = null
  if (fs.existsSync(snapshotPath)) {
    const snapshot = readJson(snapshotPath)
    expectedSha = snapshot.originalHeadSha || null
  }
  if (!expectedSha) {
    expectedSha = getMergeBase(baseRef)
  }
  if (expectedSha && approvedSha !== expectedSha) {
    throw new Error(`APPROVED SHA mismatch: expected ${expectedSha}, got ${approvedSha}`)
  }

  const status = readJson(finalStatusPath)
  if (String(status.status || '').toUpperCase() !== 'SUCCESS') {
    throw new Error('final/status.json must include status: "SUCCESS"')
  }

  const statusFiles = getStatusFilesChanged(status)
  if (statusFiles.length) {
    const missing = nonDocChanges.filter((filePath) => !statusFiles.includes(filePath))
    if (missing.length) {
      throw new Error(`final/status.json is missing changed files: ${missing.join(', ')}`)
    }
  }

  const approvedPaths = getApprovedPaths(approvalDocPath)
  if (approvedPaths.length) {
    const unapproved = nonDocChanges.filter(
      (filePath) => !matchApprovedPath(filePath, approvedPaths),
    )
    if (unapproved.length) {
      throw new Error(
        `Changes found outside approved scope: ${unapproved.join(', ')} (see ${approvalDocPath})`,
      )
    }
  }

  console.log(`✅ AI provenance check: validated task ${task}`)
}

try {
  main()
} catch (error) {
  console.error(`❌ AI provenance check failed: ${error.message}`)
  process.exit(1)
}
