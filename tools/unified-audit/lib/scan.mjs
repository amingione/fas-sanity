import path from 'node:path'
import fg from 'fast-glob'

const CODE_GLOBS = [
  '**/*.{js,jsx,ts,tsx,cjs,mjs}',
]

export function scanCodeFiles(repoPath) {
  return fg.sync(CODE_GLOBS, {
    cwd: repoPath,
    absolute: true,
    ignore: ['**/node_modules/**', '**/dist/**', '**/.next/**', '**/out/**', '**/.git/**'],
  }).map((filePath) => path.normalize(filePath))
}

export function scanSchemaFiles(repoPath) {
  return fg.sync('**/schemas/**/*.{js,jsx,ts,tsx}', {
    cwd: repoPath,
    absolute: true,
    ignore: ['**/node_modules/**', '**/dist/**', '**/.next/**', '**/out/**', '**/.git/**'],
  }).map((filePath) => path.normalize(filePath))
}
