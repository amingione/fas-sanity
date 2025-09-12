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

  // Patch Sanity's patched worker file to not auto-run in main thread
  try {
    const workerFile = path.join(projectRoot, 'node_modules', 'sanity', 'lib', '_internal', 'cli', 'threads', 'getGraphQLAPIs.patched.js');
    if (fs.existsSync(workerFile)) {
      let content = fs.readFileSync(workerFile, 'utf8');
      const needle = 'main().then(() => process.exit());';
      const guard = 'if (!node_worker_threads.isMainThread) main().then(() => process.exit());';
      if (content.includes(needle) && !content.includes(guard)) {
        content = content.replace(needle, guard);
        fs.writeFileSync(workerFile, content);
        console.log('[patch-sanity-refractor] guarded worker main() in getGraphQLAPIs.patched.js');
      }
    }
  } catch (err) {
    console.warn('[patch-sanity-refractor] failed to guard worker file:', err && err.message ? err.message : err);
  }

  // Normalize @sanity/diff package if it was unpacked with a stray "lib 2" folder
  try {
    const diffDir = path.join(projectRoot, 'node_modules', '@sanity', 'diff')
    const libDir = path.join(diffDir, 'lib')
    const lib2Dir = path.join(diffDir, 'lib 2')
    if (fs.existsSync(lib2Dir)) {
      const libIsEmpty = !fs.existsSync(libDir) || fs.readdirSync(libDir).length === 0
      if (libIsEmpty) {
        try { fs.rmSync(libDir, { recursive: true, force: true }) } catch { /* noop */ }
        fs.renameSync(lib2Dir, libDir)
        console.log('[patch-sanity-refractor] normalized @sanity/diff: moved "lib 2" -> "lib"')
      }
    }
  } catch (err) {
    console.warn('[patch-sanity-refractor] failed to normalize @sanity/diff:', err && err.message ? err.message : err)
  }

  // Clamp react-refractor to safe, no-highlight behavior (avoid LazyRefractor crashes)
  try {
    const rrFile = path.join(projectRoot, 'node_modules', 'react-refractor', 'lib', 'Refractor.js')
    if (fs.existsSync(rrFile)) {
      let src = fs.readFileSync(rrFile, 'utf8')
      // Replace registerLanguage/hasLanguage implementations
      src = src.replace(
        /Refractor\.registerLanguage\s*=\s*function\s*\([^)]*\)\s*\{[\s\S]*?\};/,
        'Refractor.registerLanguage = function () { /* no-op (shim) */ };'
      )
      src = src.replace(
        /Refractor\.hasLanguage\s*=\s*function\s*\([^)]*\)\s*\{[\s\S]*?\};/,
        'Refractor.hasLanguage = function () { return false; };'
      )
      fs.writeFileSync(rrFile, src)
      console.log('[patch-sanity-refractor] clamped react-refractor hasLanguage/registerLanguage')
    } else {
      console.log('[patch-sanity-refractor] react-refractor not found; skipping clamp')
    }
  } catch (err) {
    console.warn('[patch-sanity-refractor] failed to clamp react-refractor:', err && err.message ? err.message : err)
  }

  // Also patch @sanity/ui LazyRefractor chunk to always treat languages as unregistered
  try {
    const uiEs = path.join(projectRoot, 'node_modules', '@sanity', 'ui', 'dist', '_chunks-es', 'refractor.mjs')
    const uiCjs = path.join(projectRoot, 'node_modules', '@sanity', 'ui', 'dist', '_chunks-cjs', 'refractor.js')

    if (fs.existsSync(uiEs)) {
      let s = fs.readFileSync(uiEs, 'utf8')
      s = s.replace(/Refractor\.hasLanguage\(language\)\s*:\s*!1/, '!1')
      s = s.replace(/\$\[0\]\s*!==\s*language\s*\?\s*\(t0\s*=\s*language\s*\?\s*Refractor\.hasLanguage\(language\)\s*:\s*!1\s*,/,
        '$[0] !== language ? (t0 = !1,'
      )
      fs.writeFileSync(uiEs, s)
      console.log('[patch-sanity-refractor] patched @sanity/ui ESM refractor to disable highlighting')
    }

    if (fs.existsSync(uiCjs)) {
      let s2 = fs.readFileSync(uiCjs, 'utf8')
      s2 = s2.replace(/Refractor__default\.default\.hasLanguage\(language\)\s*:\s*!1/, '!1')
      s2 = s2.replace(/\$\[0\]\s*!==\s*language\s*\?\s*\(t0\s*=\s*language\s*\?\s*Refractor__default\.default\.hasLanguage\(language\)\s*:\s*!1\s*,/,
        '$[0] !== language ? (t0 = !1,'
      )
      fs.writeFileSync(uiCjs, s2)
      console.log('[patch-sanity-refractor] patched @sanity/ui CJS refractor to disable highlighting')
    }
  } catch (err) {
    console.warn('[patch-sanity-refractor] failed to patch @sanity/ui refractor chunk:', err && err.message ? err.message : err)
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
