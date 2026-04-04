#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();

const requiredFiles = [
  "README.md",
  "AGENTS.md",
  "docs/governance/FAS_4_REPO_PIPELINE_TASK_TRACKER.md",
  "docs/governance/RELEASE_CHECKLIST.md",
  "docs/architecture/canonical-commerce-architecture.md",
  "docs/architecture/migration-status.md",
];

const bannedPatterns = [
  /Shopify is the source of truth/i,
  /Sanity\s+(is|acts as|serves as)\s+[^\n]{0,80}(commerce|catalog|product|pricing|inventory|cart|checkout|order)\s+authority/i,
  /Stripe\s+(is|acts as|serves as)\s+[^\n]{0,80}(catalog|product|inventory|order)\s+authority/i,
  /direct Stripe checkout authority/i,
  /(?:global|canonical|architecture)\s+authority[^\n]{0,120}CLAUDE\.md/i,
];

function listScopedMarkdownFiles() {
  const scoped = ["README.md", "AGENTS.md", "docs/codex.md", "docs/features.md"];
  const files = new Set();

  for (const rel of scoped) {
    const fp = path.join(repoRoot, rel);
    if (fs.existsSync(fp) && fs.statSync(fp).isFile()) files.add(rel);
  }

  for (const area of ["docs/governance", "docs/architecture"]) {
    const areaPath = path.join(repoRoot, area);
    if (!fs.existsSync(areaPath)) continue;
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const filePath = path.join(dir, entry.name);
        const rel = path.relative(repoRoot, filePath);
        if (entry.isDirectory()) {
          walk(filePath);
          continue;
        }
        if (entry.isFile() && rel.endsWith(".md")) files.add(rel);
      }
    };
    walk(areaPath);
  }

  return [...files];
}

let failed = false;
for (const rel of requiredFiles) {
  const fp = path.join(repoRoot, rel);
  if (!fs.existsSync(fp)) {
    console.error(`[FAIL] missing required file ${rel}`);
    failed = true;
  }
}

const agentsPath = path.join(repoRoot, "AGENTS.md");
if (fs.existsSync(agentsPath)) {
  const agentsText = fs.readFileSync(agentsPath, "utf8");
  if (!/medusa/i.test(agentsText)) {
    console.error("[FAIL] AGENTS.md must reference Medusa authority");
    failed = true;
  }
  if (!/FAS_4_REPO_PIPELINE_TASK_TRACKER\.md/.test(agentsText)) {
    console.error("[FAIL] AGENTS.md must reference FAS_4_REPO_PIPELINE_TASK_TRACKER.md");
    failed = true;
  }
}

for (const rel of listScopedMarkdownFiles()) {
  const text = fs.readFileSync(path.join(repoRoot, rel), "utf8");
  for (const pattern of bannedPatterns) {
    if (pattern.test(text)) {
      console.error(`[FAIL] banned phrase match in ${rel} :: ${pattern}`);
      failed = true;
    }
  }
}

if (failed) process.exit(1);
console.log("Docs drift check passed.");
