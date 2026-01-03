import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

type AuditIssueType =
  | 'missing-functions-dir'
  | 'missing-handler-export'
  | 'orphaned-zip'
  | 'missing-zip'
  | 'parse-error'

type AuditIssue = {
  type: AuditIssueType
  file: string
  details: string
  fix: string
}

type AuditReport = {
  timestamp: string
  root: string
  functionsDir: string
  totals: {
    sourceFiles: number
    zipFiles: number
  }
  issues: AuditIssue[]
}

const SOURCE_EXTS = new Set(['.ts', '.tsx', '.js', '.cjs', '.mjs'])

function hasHandlerExport(source: string): boolean {
  return (
    /\bexport\s+(const|async function|function)\s+handler\b/.test(source) ||
    /\bexport\s*{\s*handler\s*}/.test(source) ||
    /\bexports\.handler\b/.test(source) ||
    /\bmodule\.exports\s*=\s*{[^}]*\bhandler\b/.test(source)
  )
}

function parseDiagnostics(filePath: string, source: string): string[] {
  const ext = path.extname(filePath)
  const isTsx = ext === '.tsx'
  const kind = isTsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const options: ts.CompilerOptions = {
    allowJs: true,
    jsx: ts.JsxEmit.Preserve,
  }
  const host = ts.createCompilerHost(options, true)
  host.readFile = (fileName) => (fileName === filePath ? source : undefined)
  host.fileExists = (fileName) => fileName === filePath
  host.getSourceFile = (fileName, languageVersion) => {
    if (fileName !== filePath) return undefined
    return ts.createSourceFile(fileName, source, languageVersion, true, kind)
  }

  const program = ts.createProgram([filePath], options, host)
  return ts
    .getPreEmitDiagnostics(program)
    .map((diag) => ts.flattenDiagnosticMessageText(diag.messageText, '\n'))
}

export function runAutoMapperAudit(root: string): AuditReport {
  const functionsDir = path.join(root, 'netlify', 'functions')
  const issues: AuditIssue[] = []

  if (!fs.existsSync(functionsDir)) {
    issues.push({
      type: 'missing-functions-dir',
      file: functionsDir,
      details: 'Expected Netlify functions directory not found.',
      fix: 'Restore netlify/functions or update the audit root.',
    })
    return {
      timestamp: new Date().toISOString(),
      root,
      functionsDir,
      totals: {sourceFiles: 0, zipFiles: 0},
      issues,
    }
  }

  const entries = fs.readdirSync(functionsDir)
  const sourceFiles = entries.filter((file) => SOURCE_EXTS.has(path.extname(file)))
  const zipFiles = entries.filter((file) => path.extname(file) === '.zip')

  const sourceBasenames = new Set(sourceFiles.map((file) => path.basename(file, path.extname(file))))
  const zipBasenames = new Set(zipFiles.map((file) => path.basename(file, '.zip')))

  for (const zipBase of zipBasenames) {
    if (!sourceBasenames.has(zipBase)) {
      issues.push({
        type: 'orphaned-zip',
        file: path.join(functionsDir, `${zipBase}.zip`),
        details: 'ZIP artifact exists without a matching source file.',
        fix: 'Remove the ZIP or restore the missing source file.',
      })
    }
  }

  for (const sourceFile of sourceFiles) {
    const base = path.basename(sourceFile, path.extname(sourceFile))
    if (!zipBasenames.has(base)) {
      issues.push({
        type: 'missing-zip',
        file: path.join(functionsDir, sourceFile),
        details: 'Source file has no matching ZIP artifact.',
        fix: 'Run the Netlify build to regenerate function bundles.',
      })
    }

    const absolutePath = path.join(functionsDir, sourceFile)
    const contents = fs.readFileSync(absolutePath, 'utf8')

    if (!hasHandlerExport(contents)) {
      issues.push({
        type: 'missing-handler-export',
        file: absolutePath,
        details: 'No Netlify handler export detected.',
        fix: 'Export a handler function (export const handler = async () => ...).',
      })
    }

    const diagnostics = parseDiagnostics(absolutePath, contents)
    if (diagnostics.length > 0) {
      issues.push({
        type: 'parse-error',
        file: absolutePath,
        details: diagnostics.join(' | '),
        fix: 'Fix the syntax error or TypeScript parse issue.',
      })
    }
  }

  return {
    timestamp: new Date().toISOString(),
    root,
    functionsDir,
    totals: {sourceFiles: sourceFiles.length, zipFiles: zipFiles.length},
    issues,
  }
}

function formatText(report: AuditReport): string {
  const lines: string[] = []
  lines.push('Auto Mapper Suite: Function Audit')
  lines.push(`Root: ${report.root}`)
  lines.push(`Functions: ${report.functionsDir}`)
  lines.push(
    `Sources: ${report.totals.sourceFiles} | Zips: ${report.totals.zipFiles} | Issues: ${report.issues.length}`
  )

  if (report.issues.length === 0) {
    lines.push('No issues found.')
    return lines.join('\n')
  }

  for (const issue of report.issues) {
    lines.push('')
    lines.push(`[${issue.type}] ${issue.file}`)
    lines.push(`Details: ${issue.details}`)
    lines.push(`Fix: ${issue.fix}`)
  }

  return lines.join('\n')
}

function parseArgs(args: string[]) {
  const json = args.includes('--json')
  const writeIndex = args.indexOf('--write')
  const writePath = writeIndex !== -1 ? args[writeIndex + 1] : undefined
  const rootIndex = args.indexOf('--root')
  const rootPath = rootIndex !== -1 ? args[rootIndex + 1] : process.cwd()
  return {json, writePath, rootPath}
}

if (require.main === module) {
  const {json, writePath, rootPath} = parseArgs(process.argv.slice(2))
  const report = runAutoMapperAudit(rootPath)
  const output = json ? JSON.stringify(report, null, 2) : formatText(report)
  if (writePath) {
    fs.writeFileSync(path.resolve(rootPath, writePath), output)
  } else {
    process.stdout.write(output + '\n')
  }
}
