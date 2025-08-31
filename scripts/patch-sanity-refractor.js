// Patch sanity's nested refractor to CJS-compatible v3 by copying root refractor
// This works around ESM require errors in Stackbit's schema fetcher.
const fs = require('fs');
const path = require('path');

function main() {
  const projectRoot = process.cwd();
  const src = path.join(projectRoot, 'node_modules', 'refractor');
  const target = path.join(projectRoot, 'node_modules', 'sanity', 'node_modules', 'refractor');

  try {
    if (!fs.existsSync(src)) {
      console.log('[patch-sanity-refractor] root refractor not found; skipping');
      return;
    }
    const srcPkg = JSON.parse(fs.readFileSync(path.join(src, 'package.json'), 'utf8'));
    if (!srcPkg.version.startsWith('3.')) {
      console.log('[patch-sanity-refractor] root refractor is not v3.x; skipping');
      return;
    }
    const sanityDir = path.dirname(target);
    if (!fs.existsSync(sanityDir)) {
      console.log('[patch-sanity-refractor] sanity not installed; skipping');
      return;
    }
    // Remove existing target and copy
    fs.rmSync(target, { recursive: true, force: true });
    copyDir(src, target);
    // Ensure Sanity's CJS requires like `refractor/bash` resolve by adding alias files
    const aliases = ['bash', 'javascript', 'json', 'jsx', 'typescript'];
    for (const name of aliases) {
      const aliasPath = path.join(target, `${name}.js`);
      const content = `module.exports = require('./lang/${name}.js');\n`;
      try {
        fs.writeFileSync(aliasPath, content);
      } catch (e) {
        // ignore individual alias errors
      }
    }
    console.log('[patch-sanity-refractor] patched sanity nested refractor to', srcPkg.version);
  } catch (err) {
    console.warn('[patch-sanity-refractor] patch failed:', err && err.message ? err.message : err);
  }
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const srcPath = path.join(from, entry.name);
    const dstPath = path.join(to, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, dstPath);
    } else if (entry.isSymbolicLink()) {
      const link = fs.readlinkSync(srcPath);
      fs.symlinkSync(link, dstPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, dstPath);
    }
  }
}

main();
