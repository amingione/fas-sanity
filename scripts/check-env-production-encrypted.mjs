#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);

if (argv.includes("-h") || argv.includes("--help")) {
  console.log(`Validate that .env.production contains encrypted dotenvx values only.\n\nUsage:\n  node ./scripts/check-env-production-encrypted.mjs [options]\n\nOptions:\n  --file <path>          Env file to validate (default: .env.production)\n  --allow-plain <keys>   Comma-separated keys allowed to be plaintext\n                         (default: DOTENV_PUBLIC_KEY_PRODUCTION)\n  -h, --help             Show help`);
  process.exit(0);
}

let file = ".env.production";
const allowPlain = new Set(["DOTENV_PUBLIC_KEY_PRODUCTION"]);

for (let i = 0; i < argv.length; i += 1) {
  const arg = argv[i];
  if (arg === "--file") {
    file = argv[i + 1] || file;
    i += 1;
    continue;
  }
  if (arg === "--allow-plain") {
    const raw = argv[i + 1] || "";
    i += 1;
    for (const key of raw.split(",").map((piece) => piece.trim()).filter(Boolean)) {
      allowPlain.add(key);
    }
  }
}

const filePath = path.resolve(process.cwd(), file);
if (!fs.existsSync(filePath)) {
  console.error(`[env-encryption-check] File not found: ${filePath}`);
  process.exit(1);
}

const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
const violations = [];
let assignmentCount = 0;

for (let i = 0; i < lines.length; i += 1) {
  const line = lines[i];
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;

  const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (!match) continue;

  const key = match[1];
  const value = match[2].trim();
  assignmentCount += 1;

  if (allowPlain.has(key)) continue;
  if (/^["']?encrypted:/.test(value)) continue;

  violations.push({
    line: i + 1,
    key,
    valuePreview: value.slice(0, 80),
  });
}

if (assignmentCount === 0) {
  console.error(`[env-encryption-check] No KEY=VALUE entries found in ${file}.`);
  process.exit(1);
}

if (violations.length > 0) {
  console.error(`[env-encryption-check] ${violations.length} plaintext key(s) found in ${file}:`);
  for (const violation of violations) {
    console.error(`  - line ${violation.line}: ${violation.key}=${violation.valuePreview}`);
  }
  console.error("[env-encryption-check] Run dotenvx encrypt -f .env.production before deploy.");
  process.exit(1);
}

console.log(
  `[env-encryption-check] OK: ${file} has ${assignmentCount} assignments; all non-allowed keys are encrypted.`
);
