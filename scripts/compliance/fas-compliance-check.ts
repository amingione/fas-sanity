#!/usr/bin/env npx ts-node
/**
 * FAS Architecture Compliance Checker
 *
 * Governing authority: fas-sanity/AGENTS.md
 * Canonical flow:  Sanity (content) → Medusa (commerce) → fas-cms-fresh (UI)
 *
 * Usage:
 *   npx ts-node scripts/compliance/fas-compliance-check.ts
 *   npm run compliance:check          (see package.json)
 *   make compliance-check             (see Makefile)
 *
 * Exit codes:
 *   0 — all checks pass or warnings only
 *   1 — one or more compliance violations (errors)
 */

import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

// ─── Config ──────────────────────────────────────────────────────────────────

const BASE = path.resolve(__dirname, "../../../..");  // points to GitHub root
const REPOS = {
  "fas-cms-fresh": path.join(BASE, "fas-cms-fresh"),
  "fas-medusa":    path.join(BASE, "fas-medusa"),
  "fas-sanity":    path.join(BASE, "fas-sanity"),
  "fas-dash":      path.join(BASE, "fas-dash"),
} as const;
type RepoName = keyof typeof REPOS;

// ─── Types ───────────────────────────────────────────────────────────────────

type Severity = "error" | "warning" | "info";
interface CheckResult {
  rule: string;
  repo: RepoName | "all";
  status: "pass" | "fail" | "warn" | "skip";
  severity: Severity;
  message: string;
  file?: string;
  remediation?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function exists(p: string): boolean { return fs.existsSync(p); }

function grep(pattern: string, dir: string, glob = "*.ts"): string[] {
  try {
    const out = execSync(
      `grep -r "${pattern}" "${dir}" --include="${glob}" -l 2>/dev/null`,
      { encoding: "utf8", stdio: ["pipe","pipe","pipe"] }
    ).trim();
    return out ? out.split("\n").filter(Boolean) : [];
  } catch { return []; }
}

function readFile(p: string): string {
  return exists(p) ? fs.readFileSync(p, "utf8") : "";
}

function pass(rule: string, repo: RepoName|"all", msg: string): CheckResult {
  return { rule, repo, status: "pass", severity: "info", message: msg };
}
function fail(rule: string, repo: RepoName|"all", msg: string,
  opts?: { file?: string; remediation?: string; severity?: Severity }): CheckResult {
  return { rule, repo, status: "fail", severity: opts?.severity ?? "error",
    message: msg, file: opts?.file, remediation: opts?.remediation };
}
function warn(rule: string, repo: RepoName|"all", msg: string,
  opts?: { file?: string; remediation?: string }): CheckResult {
  return { rule, repo, status: "warn", severity: "warning",
    message: msg, file: opts?.file, remediation: opts?.remediation };
}
function skip(rule: string, repo: RepoName|"all", msg: string): CheckResult {
  return { rule, repo, status: "skip", severity: "info", message: msg };
}

// ─── Rules ───────────────────────────────────────────────────────────────────

/** R1: Sanity Netlify functions must not contain active Stripe / order logic */
function checkSanityNotTransactional(): CheckResult[] {
  const results: CheckResult[] = [];
  const netlifyFns = path.join(REPOS["fas-sanity"], "netlify/functions");
  if (!exists(netlifyFns)) return [skip("R1-sanity-not-transactional","fas-sanity","netlify/functions not found")];

  const stripeFiles = grep("stripe|Stripe", netlifyFns);
  if (stripeFiles.length > 0) {
    results.push(fail("R1-sanity-not-transactional","fas-sanity",
      `${stripeFiles.length} Netlify function(s) contain direct Stripe code — must be disabled`,
      { file: stripeFiles[0],
        remediation: "Add 410 redirects in netlify.toml for createCheckoutSession, stripeWebhook, manual-fulfill-order" }
    ));
  } else {
    results.push(pass("R1-sanity-not-transactional","fas-sanity","No active Stripe in Sanity Netlify functions"));
  }

  // Check for 410 redirects already present
  const toml = readFile(path.join(REPOS["fas-sanity"], "netlify.toml"));
  const has410 = toml.includes("DEPRECATED") || toml.match(/410.*createCheckoutSession|stripeWebhook.*410/s);
  if (!has410 && stripeFiles.length > 0) {
    results.push(warn("R1-sanity-not-transactional","fas-sanity",
      "netlify.toml missing 410 redirects for deprecated commerce functions",
      { remediation: "run: make compliance-disable-legacy-fns" }
    ));
  }

  return results;
}

/** R2: fas-cms-fresh must not directly instantiate Stripe or Shippo */
function checkNoDirectStripeShippoInStorefront(): CheckResult[] {
  const results: CheckResult[] = [];
  const apiDir = path.join(REPOS["fas-cms-fresh"], "src/pages/api");
  if (!exists(apiDir)) return [skip("R2-no-direct-stripe-shippo","fas-cms-fresh","src/pages/api not found")];

  const stripeViolations = grep("new Stripe\\|stripe\\.paymentIntents\\.create\\|stripe\\.checkout\\.sessions", apiDir)
    .filter(f => !f.includes("/medusa/"));
  if (stripeViolations.length > 0) {
    results.push(fail("R2-no-direct-stripe-shippo","fas-cms-fresh",
      `Direct Stripe usage in ${stripeViolations.length} non-Medusa route(s)`,
      { file: stripeViolations[0],
        remediation: "Replace with medusaFetch('/store/payment-intents', ...) — all payment calls proxy through Medusa" }
    ));
  } else {
    results.push(pass("R2-no-direct-stripe-shippo","fas-cms-fresh","No direct Stripe in storefront routes"));
  }

  const shippoFiles = grep("require.*shippo\\|from.*shippo\\|new Shippo", apiDir);
  if (shippoFiles.length > 0) {
    results.push(fail("R2-no-direct-stripe-shippo","fas-cms-fresh",
      `Direct Shippo in ${shippoFiles.length} route(s)`,
      { file: shippoFiles[0],
        remediation: "Remove Shippo calls; shipping options come from Medusa /store/carts/:id/shipping-options" }
    ));
  } else {
    results.push(pass("R2-no-direct-stripe-shippo","fas-cms-fresh","No direct Shippo in storefront routes"));
  }
  return results;
}

/** R3: fas-cms-fresh must not write commerce records to Sanity */
function checkStorefrontNoSanityCommerceWrites(): CheckResult[] {
  const apiDir = path.join(REPOS["fas-cms-fresh"], "src/pages/api");
  if (!exists(apiDir)) return [skip("R3-no-sanity-writes","fas-cms-fresh","src/pages/api not found")];

  const writes = grep("sanityClient\\.create\\|sanityClient\\.patch\\|client\\.create(\\|client\\.patch(", apiDir);
  if (writes.length > 0) {
    return [warn("R3-no-sanity-writes","fas-cms-fresh",
      `${writes.length} file(s) write to Sanity from storefront — verify content-only (not order/payment data)`,
      { file: writes[0],
        remediation: "Only blog/review writes are acceptable. Route order/payment writes through Medusa." }
    )];
  }
  return [pass("R3-no-sanity-writes","fas-cms-fresh","No Sanity writes in storefront API")];
}

/** R4: fas-dash must use Medusa for all commerce data */
function checkDashUsesMedusa(): CheckResult[] {
  const results: CheckResult[] = [];
  const medusaAdmin = path.join(REPOS["fas-dash"], "src/lib/medusa-admin.ts");

  if (!exists(medusaAdmin)) {
    results.push(fail("R4-dash-uses-medusa","fas-dash",
      "src/lib/medusa-admin.ts not found — all admin calls must use this utility",
      { remediation: "Create medusa-admin.ts with medusaAdminFetch() using MEDUSA_ADMIN_API_KEY" }
    ));
  } else {
    results.push(pass("R4-dash-uses-medusa","fas-dash","medusa-admin.ts utility present"));
  }

  const apiDir = path.join(REPOS["fas-dash"], "src/app/api");
  const badSanity = grep("sanityClient.*order\\|sanityClient.*product\\|sanityClient.*inventory", apiDir);
  if (badSanity.length > 0) {
    results.push(warn("R4-dash-uses-medusa","fas-dash",
      "Potential Sanity reads for commerce data — verify vendor CRM only",
      { remediation: "Orders, products, inventory must come from medusaAdminFetch(). Only purchase-orders/vendor CRM may use Sanity." }
    ));
  } else {
    results.push(pass("R4-dash-uses-medusa","fas-dash","No suspicious Sanity commerce reads in fas-dash API"));
  }
  return results;
}

/** R5: All repos must have AGENTS.md referencing Medusa */
function checkGovernanceFiles(): CheckResult[] {
  const results: CheckResult[] = [];
  for (const [name, repoPath] of Object.entries(REPOS)) {
    const repo = name as RepoName;
    const agentsFile = path.join(repoPath, "AGENTS.md");
    const claudeFile = path.join(repoPath, "CLAUDE.md");

    if (!exists(agentsFile)) {
      results.push(fail("R5-governance-files", repo, "AGENTS.md missing",
        { remediation: "Create AGENTS.md referencing Medusa-first architecture" }));
    } else {
      const content = readFile(agentsFile).toLowerCase();
      if (!content.includes("medusa")) {
        results.push(warn("R5-governance-files", repo, "AGENTS.md does not mention Medusa",
          { file: agentsFile, remediation: "Add Medusa-first architecture rules to AGENTS.md" }));
      } else {
        results.push(pass("R5-governance-files", repo, "AGENTS.md present and references Medusa"));
      }
    }

    if (!exists(claudeFile)) {
      results.push(warn("R5-governance-files", repo, "CLAUDE.md missing",
        { remediation: `Create CLAUDE.md in ${repoPath} with role, stack, and architecture rules` }));
    } else {
      results.push(pass("R5-governance-files", repo, "CLAUDE.md present"));
    }
  }
  return results;
}

/** R6: complete-order.ts in fas-cms-fresh must be disabled (410) */
function checkCompleteOrderDisabled(): CheckResult[] {
  const f = path.join(REPOS["fas-cms-fresh"], "src/pages/api/complete-order.ts");
  if (!exists(f)) return [pass("R6-complete-order-disabled","fas-cms-fresh","complete-order.ts does not exist")];
  const c = readFile(f);
  if (c.includes("410") || c.includes("Deprecated") || c.includes("disabled")) {
    return [pass("R6-complete-order-disabled","fas-cms-fresh","complete-order.ts correctly returns 410")];
  }
  return [fail("R6-complete-order-disabled","fas-cms-fresh",
    "complete-order.ts may be active — order completion must be Stripe webhook only",
    { file: f, remediation: "Return 410 from this endpoint: 'Order completion is webhook-only'" }
  )];
}

/** R7: fas-medusa must own the Stripe webhook handler */
function checkMedusaOwnsStripeWebhook(): CheckResult[] {
  const f = path.join(REPOS["fas-medusa"], "src/api/webhooks/stripe/route.ts");
  if (exists(f)) return [pass("R7-medusa-owns-stripe-webhook","fas-medusa","Stripe webhook handler exists in Medusa")];
  return [fail("R7-medusa-owns-stripe-webhook","fas-medusa",
    "src/api/webhooks/stripe/route.ts not found",
    { remediation: "Create Stripe webhook handler in fas-medusa that confirms payment and creates order" }
  )];
}

/** R8: OpenTelemetry instrumentation must be enabled in fas-medusa */
function checkOtelEnabled(): CheckResult[] {
  const f = path.join(REPOS["fas-medusa"], "instrumentation.ts");
  if (!exists(f)) return [warn("R8-otel-enabled","fas-medusa","instrumentation.ts not found",
    { remediation: "Create instrumentation.ts with registerOtel() for workflow/HTTP/query tracing" }
  )];
  const c = readFile(f);
  if (c.includes("// export function register") || c.match(/^\s*\/\/.*registerOtel/m)) {
    return [warn("R8-otel-enabled","fas-medusa","instrumentation.ts exists but registerOtel is commented out",
      { file: f, remediation: "Uncomment register() and set OTEL_EXPORTER_OTLP_ENDPOINT in Railway" }
    )];
  }
  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    return [warn("R8-otel-enabled","fas-medusa",
      "instrumentation.ts enabled but OTEL_EXPORTER_OTLP_ENDPOINT not set in this environment",
      { remediation: "Set OTEL_EXPORTER_OTLP_ENDPOINT in Railway for production tracing" }
    )];
  }
  return [pass("R8-otel-enabled","fas-medusa","OpenTelemetry instrumentation enabled")];
}

/** R9: fas-cms-fresh must have flow logger */
function checkFlowLoggerPresent(): CheckResult[] {
  const f = path.join(REPOS["fas-cms-fresh"], "src/lib/logger.ts");
  if (!exists(f)) return [warn("R9-flow-logger","fas-cms-fresh","src/lib/logger.ts not found",
    { remediation: "Create flow logger from FAS governance system deliverables" }
  )];
  const c = readFile(f);
  if (c.includes("withFlowLog") && c.includes("FAILURE_MAP")) {
    return [pass("R9-flow-logger","fas-cms-fresh","Flow logger with failure map is installed")];
  }
  return [warn("R9-flow-logger","fas-cms-fresh","logger.ts exists but may be missing withFlowLog or FAILURE_MAP")];
}

// ─── Runner ──────────────────────────────────────────────────────────────────

function runAllChecks(): CheckResult[] {
  return [
    ...checkSanityNotTransactional(),
    ...checkNoDirectStripeShippoInStorefront(),
    ...checkStorefrontNoSanityCommerceWrites(),
    ...checkDashUsesMedusa(),
    ...checkGovernanceFiles(),
    ...checkCompleteOrderDisabled(),
    ...checkMedusaOwnsStripeWebhook(),
    ...checkOtelEnabled(),
    ...checkFlowLoggerPresent(),
  ];
}

function printReport(results: CheckResult[]): void {
  const ICON  = { pass: "✅", fail: "🔴", warn: "⚠️ ", skip: "⏭️ " } as const;
  const COLOR = { pass:"\x1b[32m", fail:"\x1b[31m", warn:"\x1b[33m", skip:"\x1b[90m", reset:"\x1b[0m" } as const;

  console.log("\n" + "═".repeat(70));
  console.log("  FAS Architecture Compliance Report");
  console.log("  Authority: fas-sanity/AGENTS.md");
  console.log("  " + new Date().toISOString());
  console.log("═".repeat(70) + "\n");

  for (const r of results) {
    const c = COLOR[r.status];
    console.log(`${c}${ICON[r.status]} [${r.repo}] ${r.rule}${COLOR.reset}`);
    console.log(`   ${r.message}`);
    if (r.file) console.log(`   File: ${r.file.replace(BASE + "/", "")}`);
    if (r.remediation && r.status !== "pass") console.log(`   Fix:  ${r.remediation}`);
    console.log();
  }

  const failures = results.filter(r => r.status === "fail");
  const warnings = results.filter(r => r.status === "warn");
  const passes   = results.filter(r => r.status === "pass");
  const skipped  = results.filter(r => r.status === "skip");

  console.log("─".repeat(70));
  console.log(
    `${COLOR.fail}🔴 Errors:   ${failures.length}${COLOR.reset}   ` +
    `${COLOR.warn}⚠️  Warnings: ${warnings.length}${COLOR.reset}   ` +
    `${COLOR.pass}✅ Passing:  ${passes.length}${COLOR.reset}   ` +
    `${COLOR.skip}⏭️  Skipped:  ${skipped.length}${COLOR.reset}`
  );
  console.log("─".repeat(70) + "\n");

  if (failures.length > 0) {
    console.log("🚨 COMPLIANCE VIOLATIONS — must resolve before merging:\n");
    failures.forEach((r, i) => {
      console.log(`  ${i + 1}. [${r.repo}] ${r.message}`);
      if (r.remediation) console.log(`     → ${r.remediation}`);
    });
    console.log();
    process.exit(1);
  } else if (warnings.length > 0) {
    console.log("⚠️  Warnings present — review before marking build complete.\n");
    process.exit(0);
  } else {
    console.log("✅ All compliance checks passed. Build is architecture-compliant.\n");
    process.exit(0);
  }
}

const results = runAllChecks();
printReport(results);
