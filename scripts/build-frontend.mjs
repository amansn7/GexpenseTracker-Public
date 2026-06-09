#!/usr/bin/env node
// Pre-transpile JSX → JS. Removes 3MB browser Babel runtime.
// Run: node scripts/build-frontend.mjs
// Watch: node scripts/build-frontend.mjs --watch
//
// After building, concatenates individual IIFE outputs into 2 production
// bundles (mf-core.js, mf-app.js) + individual per-view chunks, content-hashes
// every .js in static/dist/, and writes ?v= params to templates.

import { build, context } from "esbuild";
import { readdirSync, mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from "fs";
import { join, relative } from "path";
import { createHash } from "crypto";
import { gzipSync } from "zlib";

const isWatch = process.argv.includes("--watch");
const srcDir = "static/src";
const outDir = "static/dist";
const vendorDir = join(outDir, "vendor");

const BUDGETS = {
  "mf-core.js": { maxSize: 120 * 1024 },
  "mf-app.js": { maxSize: 40 * 1024 },
  "always-loaded": { maxSize: 250 * 1024 },
  "lazy-chunk": { maxSize: 150 * 1024 },
  "total": { maxSize: 1200 * 1024 },
};

mkDir(outDir);
mkDir(vendorDir);

function mkDir(d) { mkdirSync(d, { recursive: true }); }

function findFiles(dir, extList) {
  const entries = readdirSync(dir, { withFileTypes: true });
  let results = [];
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory() && !e.name.startsWith(".")) {
      results = results.concat(findFiles(full, extList));
    } else if (e.isFile() && extList.some((ext) => e.name.endsWith(ext))) {
      results.push(full);
    }
  }
  return results;
}
const allSourceFiles = findFiles(srcDir, [".jsx", ".tsx", ".ts"]);
const entryPoints = allSourceFiles;
const relativeEntryNames = entryPoints.map((f) => relative(srcDir, f).replace(/\.(jsx|tsx|ts)$/, ""));

const buildNotifyPlugin = {
  name: "build-notify",
  setup(build) {
    build.onEnd((result) => {
      if (!isWatch) return;
      if (result.errors.length) return;
      concatBundles();
      concatLazyChunks();
      console.log(`  [${new Date().toLocaleTimeString()}] Rebuild complete`);
    });
  },
};

const options = {
  entryPoints,
  outdir: outDir,
  format: "iife",
  bundle: false,
  platform: "browser",
  jsx: "transform",
  jsxFactory: "React.createElement",
  jsxFragment: "React.Fragment",
  loader: { ".tsx": "tsx", ".ts": "ts" },
  target: ["es2017"],
  minify: !isWatch,
  logLevel: "info",
  plugins: [buildNotifyPlugin],
};

async function buildVendor() {
  const pkg = join("node_modules", "d3-sankey", "src", "index.js");
  if (!existsSync(pkg)) return;
  await build({
    entryPoints: [pkg],
    outfile: join(vendorDir, "d3-sankey.js"),
    format: "iife",
    bundle: true,
    globalName: "d3Sankey",
    target: ["es2017"],
    minify: !isWatch,
    logLevel: isWatch ? "silent" : "info",
  });
  if (!isWatch) console.log("  vendor/d3-sankey.js  (global `d3Sankey`)");
}

async function buildZodVendor() {
  await build({
    entryPoints: ["node_modules/zod/index.js"],
    outfile: join(vendorDir, "zod.js"),
    format: "iife",
    bundle: true,
    globalName: "z",
    target: ["es2017"],
    minify: !isWatch,
    logLevel: isWatch ? "silent" : "info",
  });
  if (!isWatch) console.log("  vendor/zod.js  (global `z`)");
}

async function buildReactWindowVendor() {
  // Resolve entry point from the package's module field (ESM) or main (CJS),
  // falling back to the legacy path used by react-window 2.x.
  const pkgJsonPath = join("node_modules", "react-window", "package.json");
  if (!existsSync(pkgJsonPath)) {
    if (!isWatch) console.log("  Skipping react-window (not found)");
    return;
  }
  const pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
  const entry = pkgJson.module || pkgJson.main || "dist/react-window.js";
  const pkg = join("node_modules", "react-window", entry);
  if (!existsSync(pkg)) {
    if (!isWatch) console.log(`  Skipping react-window (entry not found: ${entry})`);
    return;
  }
  await build({
    entryPoints: [pkg],
    outfile: join(vendorDir, "react-window.js"),
    format: "iife",
    bundle: true,
    globalName: "ReactWindow",
    target: ["es2017"],
    minify: !isWatch,
    logLevel: isWatch ? "silent" : "info",
    plugins: [{
      name: "external-globals",
      setup(build) {
        build.onResolve({ filter: /^(react|react-dom)$/ }, (args) => {
          return { path: args.path, namespace: "external-globals" };
        });
        build.onLoad({ filter: /.*/, namespace: "external-globals" }, (args) => {
          const g = { react: "React", "react-dom": "ReactDOM" }[args.path];
          return { contents: `module.exports = ${g};` };
        });
      },
    }],
  });
  if (!isWatch) console.log("  vendor/react-window.js  (global `ReactWindow`)");
}

function hash(content) {
  return createHash("sha256").update(content).digest("hex").slice(0, 8);
}

// Core bundles (always loaded)
const BUNDLES = [
  {
    name: "mf-core",
    files: [
      "utils/format", "types/validation", "components/Skeleton",
      "date-utils", "data", "icons", "focus-trap", "error-boundary",
      "keyboard-hint", "sound", "sync-progress", "settings-ui",
      "inbox-styles", "inbox-common", "view-cache", "hooks/useHistory",
      "contexts", "haptic", "shell",
      "capacitor-bridge",
    ],
  },
  { name: "mf-app", files: ["app"] },
];

// Lazy chunks: per-view chunks loaded on demand.
// Each chunk is one or more IIFE files concatenated together.
// The first file in the array runs first (dependency order).
// Views map: the view names (used in app.jsx) that this chunk serves.
const LAZY_CHUNKS = {
  "inbox":        { files: ["inbox-detail", "inbox-panels", "inbox-search", "inbox-review", "inbox-duplicates", "inbox-bulk-reclass", "inbox"],      views: ["inbox", "search", "review"] },
  "flow":         { files: ["flow"],                                       views: ["flow", "picture"] },
  "dashboard":    { files: ["dashboard"],                                  views: ["dashboard", "today"] },
  "health":       { files: ["health"],                                     views: ["health"] },
  "reports":      { files: ["reports"],                                    views: ["reports"] },
  "recurring":    { files: ["recurring"],                                  views: ["recurring"] },
  "debt":         { files: ["debt"],                                       views: ["debt"] },
  "goals":        { files: ["goals"],                                      views: ["goals"] },
  "budgets":      { files: ["budget-llm-sections", "budget-modal", "budgets"], views: ["budgets"] },
  "account":      { files: ["account-admin", "account-rule-modal", "account-rules", "account-admin-settings", "hooks/useTOTP", "hooks/usePasskey", "account"], views: ["profile", "settings"] },
  "admin":        { files: ["admin"],                                      views: ["admin"] },
  "onboarding":   { files: ["hooks/useTOTP", "hooks/usePasskey", "onboarding"], views: ["onboarding"] },
};

// ── ESM side-effect bundle pipeline ─────────────────────────────────────────
const ESM_ENTRY_MAP = {
  "app.esm": "static/src/main.ts",
  "lazy/inbox.esm": "static/src/lazy/inbox.ts",
  "lazy/flow.esm": "static/src/lazy/flow.ts",
  "lazy/dashboard.esm": "static/src/lazy/dashboard.ts",
  "lazy/health.esm": "static/src/lazy/health.ts",
  "lazy/reports.esm": "static/src/lazy/reports.ts",
  "lazy/recurring.esm": "static/src/lazy/recurring.ts",
  "lazy/debt.esm": "static/src/lazy/debt.ts",
  "lazy/goals.esm": "static/src/lazy/goals.ts",
  "lazy/budgets.esm": "static/src/lazy/budgets.ts",
  "lazy/account.esm": "static/src/lazy/account.ts",
  "lazy/admin.esm": "static/src/lazy/admin.ts",
  "lazy/onboarding.esm": "static/src/lazy/onboarding.ts",
};

const esmOptions = {
  entryPoints: ESM_ENTRY_MAP,
  outdir: join(outDir, "esm"),
  format: "esm",
  bundle: true,
  platform: "browser",
  jsx: "transform",
  jsxFactory: "React.createElement",
  jsxFragment: "React.Fragment",
  loader: { ".tsx": "tsx", ".ts": "ts" },
  target: ["es2017"],
  minify: !isWatch,
  logLevel: "info",
};

function concatBundles() {
  for (const bundle of BUNDLES) {
    const parts = bundle.files.map((f) => {
      const p = join(outDir, `${f}.js`);
      try { return readFileSync(p, "utf8"); } catch { return ""; }
    });
    const combined = parts.join("\n");
    writeFileSync(join(outDir, `${bundle.name}.js`), combined);
    if (!isWatch) console.log(`  ${bundle.name}.js  (${(combined.length / 1024).toFixed(1)}kb)`);
  }
}

function concatLazyChunks() {
  for (const [name, chunk] of Object.entries(LAZY_CHUNKS)) {
    const parts = chunk.files.map((f) => {
      const p = join(outDir, `${f}.js`);
      try { return readFileSync(p, "utf8"); } catch { return ""; }
    });
    const combined = parts.join("\n");
    writeFileSync(join(outDir, `${name}.js`), combined);
    if (!isWatch) console.log(`  ${name}.js  (${(combined.length / 1024).toFixed(1)}kb)`);
  }
}

function applyContentHashes() {
  // Collect all distributed files to hash
  // Also hash any .js in the login template that isn't a bundle/chunk
  const loginScripts = readFileSync("templates/login.html", "utf8").match(
    /\/static\/dist\/([\w./-]+\.js)/g
  ) || [];
  const loginKeys = loginScripts.map((s) => s.replace("/static/dist/", ""));

  const distFiles = [
    ...BUNDLES.map((b) => `${b.name}.js`),
    ...Object.keys(LAZY_CHUNKS).map((name) => `${name}.js`),
    "vendor/d3-sankey.js",
    "vendor/react-window.js",
    "vendor/zod.js",
    ...loginKeys,
  ];

  const hashMap = {};
  for (const f of distFiles) {
    const p = join(outDir, f);
    try {
      const content = readFileSync(p);
      hashMap[f] = hash(content);
    } catch {}
  }

  // Login template — only login-effects needs hashing
  for (const tmpl of ["templates/login.html"]) {
    let html = readFileSync(tmpl, "utf8");
    html = html.replace(
      /(<script src="\/static\/dist\/([\w./-]+)\.js)(?:\?v=[\w.-]+)?(">)/g,
      (_m, pre, name, suf) => {
        const key = `${name}.js`;
        return hashMap[key] ? `${pre}?v=${hashMap[key]}${suf}` : _m;
      }
    );
    writeFileSync(tmpl, html);
    console.log(`  Updated ${tmpl}`);
  }

  // Build chunk manifest: map chunk names to versioned URLs
  const manifest = {};
  for (const [name] of Object.entries(LAZY_CHUNKS)) {
    const key = `${name}.js`;
    if (hashMap[key]) {
      manifest[name] = `/static/dist/${name}.js?v=${hashMap[key]}`;
    }
  }

  // ── ESM hashing ──
  const esmChunkHashMap = {};
  for (const [name] of Object.entries(LAZY_CHUNKS)) {
    const p = join(outDir, "esm", "lazy", `${name}.esm.js`);
    try { esmChunkHashMap[name] = hash(readFileSync(p)); } catch {}
  }
  let appESMHash = '';
  const appESMPath = join(outDir, "esm", "app.esm.js");
  try { appESMHash = hash(readFileSync(appESMPath)); } catch {}

  // Index template
  let html = readFileSync("templates/index.html", "utf8");

  // Remove individual dist/*.js script lines (not vendor/, not bundles)
  html = html.replace(/^\s*<script src="\/static\/dist\/[\w-]+\.js(?:\?v=[\w.-]+)?"><\/script>\s*$/gm, "");
  // Remove old chunk manifest inline scripts from previous builds
  html = html.replace(/^\s*<script[^>]*>window\.__mfChunks=.*?<\/script>\s*$/gm, "");
  // Remove old ESM tags
  html = html.replace(/^\s*<script type="module" src="\/static\/dist\/esm\/[^"]*"><\/script>\s*$/gm, "");
  html = html.replace(/^\s*<script[^>]*>window\.__mfChunksESM=.*?<\/script>\s*$/gm, "");
  // Remove old modulepreload tags from previous builds
  html = html.replace(/^\s*<link rel="modulepreload" href="\/static\/dist\/esm\/app\.esm\.js[^"]*">\s*$/gm, "");
  html = html.replace(/^\s*<link rel="modulepreload" href="\/static\/dist\/esm\/lazy\/[^"]*">\s*$/gm, "");
  // Remove blank lines left by removal
  html = html.replace(/\n{3,}/g, "\n\n");

  // Build script tags for bundles
  const bundleTags = BUNDLES.map((b) => {
    const key = `${b.name}.js`;
    const v = hashMap[key] || "";
    return `  <script src="/static/dist/${b.name}.js${v ? `?v=${v}` : ""}"></script>`;
  }).join("\n");

  // Build manifest inline script (must be before mf-app.js so chunks are defined)
  const nonce = "{{ request.state.nonce }}";
  const manifestScript = `  <script nonce="${nonce}">window.__mfChunks=${JSON.stringify(manifest)};</script>`;

  // Build ESM manifest
  const esmManifest = {};
  for (const [name, h] of Object.entries(esmChunkHashMap)) {
    esmManifest[name] = `/static/dist/esm/lazy/${name}.esm.js?v=${h}`;
  }
  const esmManifestScript = `  <script nonce="${nonce}">window.__mfChunksESM=${JSON.stringify(esmManifest)};</script>`;
  const esmModuleTag = appESMHash
    ? `\n  <script type="module" src="/static/dist/esm/app.esm.js?v=${appESMHash}"></script>`
    : '';

  // Modulepreload hints for critical ESM chunks + main entry
  const appPreloadTag = appESMHash
    ? `  <link rel="modulepreload" href="/static/dist/esm/app.esm.js?v=${appESMHash}">`
    : '';
  const criticalPreload = ["inbox"];
  const preloadTags = criticalPreload
    .filter(name => esmManifest[name])
    .map(name => `  <link rel="modulepreload" href="${esmManifest[name]}">`)
    .join("\n");
  const allPreloads = [appPreloadTag, preloadTags].filter(Boolean).join("\n");
  const preloadSection = allPreloads ? `\n${allPreloads}` : '';

  // Insert: ESM manifest + preloads + module, then IIFE manifest + bundles before </body>
  html = html.replace("</body>", `${esmManifestScript}${preloadSection}${esmModuleTag}\n${manifestScript}\n${bundleTags}\n</body>`);
  writeFileSync("templates/index.html", html);
  console.log(`  Updated templates/index.html with chunk manifest + bundles`);

  // ── CSS versioning ──
  const cssPath = "static/styles.css";
  const cssContent = readFileSync(cssPath);
  const cssHash = hash(cssContent);

  for (const tmpl of ["templates/index.html", "templates/login.html"]) {
    let html = readFileSync(tmpl, "utf8");
    html = html.replace(
      /(\/static\/styles\.css)(?:\?v=[\w.-]+)?/g,
      `$1?v=${cssHash}`
    );
    writeFileSync(tmpl, html);
    console.log(`  Updated ${tmpl} (styles.css v=${cssHash})`);
  }
}

function getGzipSize(filePath) {
  try {
    return gzipSync(readFileSync(filePath)).length;
  } catch {
    return 0;
  }
}

function analyzeBundles() {
  const alwaysLoaded = [];
  const lazyChunks = [];
  let totalSize = 0;
  let totalGzip = 0;

  for (const bundle of BUNDLES) {
    const filePath = join(outDir, `${bundle.name}.js`);
    if (existsSync(filePath)) {
      const size = statSync(filePath).size;
      const gzip = getGzipSize(filePath);
      alwaysLoaded.push({ name: `${bundle.name}.js`, size, gzip });
      totalSize += size;
      totalGzip += gzip;
    }
  }

  const vendorFiles = existsSync(vendorDir) ? readdirSync(vendorDir).filter(f => f.endsWith(".js")) : [];
  if (vendorFiles.length > 0) {
    let vendorSize = 0;
    let vendorGzip = 0;
    for (const f of vendorFiles) {
      const fp = join(vendorDir, f);
      const size = statSync(fp).size;
      vendorSize += size;
      vendorGzip += getGzipSize(fp);
    }
    alwaysLoaded.push({ name: "vendor/", size: vendorSize, gzip: vendorGzip, isDir: true });
    totalSize += vendorSize;
    totalGzip += vendorGzip;
  }

  const compDir = join(outDir, "components");
  const compFiles = existsSync(compDir) ? readdirSync(compDir).filter(f => f.endsWith(".js")) : [];
  if (compFiles.length > 0) {
    let compSize = 0;
    let compGzip = 0;
    for (const f of compFiles) {
      const fp = join(compDir, f);
      const size = statSync(fp).size;
      compSize += size;
      compGzip += getGzipSize(fp);
    }
    alwaysLoaded.push({ name: "components/", size: compSize, gzip: compGzip, isDir: true });
    totalSize += compSize;
    totalGzip += compGzip;
  }

  const cssPath = "static/styles.css";
  if (existsSync(cssPath)) {
    const size = statSync(cssPath).size;
    const gzip = getGzipSize(cssPath);
    alwaysLoaded.push({ name: "styles.css", size, gzip });
    totalSize += size;
    totalGzip += gzip;
  }

  for (const [name] of Object.entries(LAZY_CHUNKS)) {
    const filePath = join(outDir, `${name}.js`);
    if (existsSync(filePath)) {
      const size = statSync(filePath).size;
      const gzip = getGzipSize(filePath);
      lazyChunks.push({ name: `${name}.js`, size, gzip });
      totalSize += size;
      totalGzip += gzip;
    }
  }

  return { alwaysLoaded, lazyChunks, totalSize, totalGzip };
}

function formatLine(name, size, gzip, status) {
  const namePadded = `  ${name.padEnd(20)}`;
  const sizeStr = `${(size / 1024).toFixed(1)} KB`.padStart(9);
  const gzipStr = `(gzip: ${(gzip / 1024).toFixed(1)} KB)`.padEnd(19);
  return `${namePadded} ${sizeStr} ${gzipStr} ${status}`;
}

function checkBudgets(analysis) {
  const violations = [];

  for (const item of analysis.alwaysLoaded) {
    if (!item.isDir && BUDGETS[item.name]) {
      if (item.size > BUDGETS[item.name].maxSize) {
        violations.push(`${item.name} is ${(item.size / 1024).toFixed(1)}KB (max ${(BUDGETS[item.name].maxSize / 1024).toFixed(0)}KB)`);
      }
    }
  }

  const alwaysLoadedSize = analysis.alwaysLoaded.reduce((s, i) => s + i.size, 0);
  if (alwaysLoadedSize > BUDGETS["always-loaded"].maxSize) {
    violations.push(`always-loaded ${(alwaysLoadedSize / 1024).toFixed(1)}KB (max ${(BUDGETS["always-loaded"].maxSize / 1024).toFixed(0)}KB)`);
  }

  for (const item of analysis.lazyChunks) {
    if (item.size > BUDGETS["lazy-chunk"].maxSize) {
      violations.push(`${item.name} is ${(item.size / 1024).toFixed(1)}KB (max ${(BUDGETS["lazy-chunk"].maxSize / 1024).toFixed(0)}KB)`);
    }
  }

  if (analysis.totalSize > BUDGETS["total"].maxSize) {
    violations.push(`total ${(analysis.totalSize / 1024).toFixed(1)}KB (max ${(BUDGETS["total"].maxSize / 1024).toFixed(0)}KB)`);
  }

  return { pass: violations.length === 0, violations };
}

function printAnalysis(analysis) {
  const budgetChecks = checkBudgets(analysis);

  console.log(`\n📦 Bundle Analysis`);
  console.log(`─────────────────────────────────────────────────────`);

  for (const item of analysis.alwaysLoaded) {
    const budget = !item.isDir && BUDGETS[item.name] ? BUDGETS[item.name] : null;
    const over = budget && item.size > budget.maxSize;
    const status = over ? `⚠️  OVER ${(budget.maxSize / 1024).toFixed(0)}KB` : `✅`;
    console.log(formatLine(item.name, item.size, item.gzip, status));
  }

  const alwaysLoadedSize = analysis.alwaysLoaded.reduce((s, i) => s + i.size, 0);
  const alwaysLoadedGzip = analysis.alwaysLoaded.reduce((s, i) => s + i.gzip, 0);
  const alwaysOver = alwaysLoadedSize > BUDGETS["always-loaded"].maxSize;
  const alwaysStatus = alwaysOver ? `⚠️  OVER ${(BUDGETS["always-loaded"].maxSize / 1024).toFixed(0)}KB` : `✅`;
  console.log(`  ${'─'.repeat(47)}`);
  console.log(formatLine("Always-loaded total:", alwaysLoadedSize, alwaysLoadedGzip, alwaysStatus));
  console.log(`  ${'─'.repeat(47)}`);

  for (const item of analysis.lazyChunks) {
    const over = item.size > BUDGETS["lazy-chunk"].maxSize;
    const status = over ? `⚠️  OVER ${(BUDGETS["lazy-chunk"].maxSize / 1024).toFixed(0)}KB` : `✅`;
    console.log(formatLine(item.name, item.size, item.gzip, status));
  }

  const totalOver = analysis.totalSize > BUDGETS["total"].maxSize;
  const totalStatus = totalOver ? `⚠️  OVER ${(BUDGETS["total"].maxSize / 1024).toFixed(0)}KB` : `✅`;
  console.log(`\n  Total (all): ${(analysis.totalSize / 1024).toFixed(1)} KB (gzip: ${(analysis.totalGzip / 1024).toFixed(1)} KB) ${totalStatus}`);

  return budgetChecks;
}

function lintCSS() {
  const css = readFileSync("static/styles.css", "utf8");
  const warnings = [];

  const pxFontSize = css.match(/font-size:\s*\d+px/g);
  if (pxFontSize) {
    warnings.push(`Found ${pxFontSize.length} font-size in px values (should use rem)`);
  }

  if (warnings.length > 0) {
    console.log(`\n\u26A0\uFE0F  CSS Lint Warnings:`);
    for (const w of warnings) {
      console.log(`  ${w}`);
    }
  }
}

function writeManifest(analysis, budgetChecks) {
  const bundles = {};

  for (const item of [...analysis.alwaysLoaded, ...analysis.lazyChunks]) {
    if (!item.isDir) {
      const fp = join(outDir, item.name);
      const content = existsSync(fp) ? readFileSync(fp) : Buffer.alloc(0);
      const key = item.name.replace(/\.js$/, "");
      bundles[key] = {
        file: item.name,
        size: item.size,
        size_kb: +((item.size / 1024).toFixed(1)),
        hash: hash(content),
      };
    }
  }

  const shellFiles = [
    "static/styles.css",
    "static/vendor/react.production.min.js",
    "static/vendor/react-dom.production.min.js",
    "static/dist/vendor/d3-sankey.js",
    "static/dist/vendor/react-window.js",
    "static/dist/components/Button.js",
    "static/dist/components/Input.js",
    "static/dist/components/Modal.js",
    "static/dist/components/BottomSheet.js",
    "static/dist/components/ProgressBar.js",
    "static/dist/components/Skeleton.js",
    "static/dist/components/Toggle.js",
    "static/dist/mf-core.js",
    "static/dist/mf-app.js",
  ];
  const shell = [];
  const allHashes = [];
  for (const f of shellFiles) {
    try {
      const content = readFileSync(f);
      const h = hash(content);
      allHashes.push(h);
      shell.push("/" + f + "?v=" + h);
    } catch {
      shell.push("/" + f);
    }
  }
  for (const [name] of Object.entries(LAZY_CHUNKS)) {
    const fp = join(outDir, name + ".js");
    try {
      const content = readFileSync(fp);
      const h = hash(content);
      allHashes.push(h);
      shell.push("/static/dist/" + name + ".js?v=" + h);
    } catch {}
  }
  // ESM entry for service worker caching
  const esmShell = join(outDir, "esm", "app.esm.js");
  try {
    const content = readFileSync(esmShell);
    const h = hash(content);
    allHashes.push(h);
    shell.push("/static/dist/esm/app.esm.js?v=" + h);
  } catch {}
  const swVersion = hash(allHashes.join("|"));

  const alwaysLoadedSize = analysis.alwaysLoaded.reduce((s, i) => s + i.size, 0);
  const manifest = {
    version: swVersion,
    timestamp: new Date().toISOString(),
    shell,
    bundles,
    always_loaded_size_kb: +((alwaysLoadedSize / 1024).toFixed(1)),
    total_size_kb: +((analysis.totalSize / 1024).toFixed(1)),
    budgets: {
      passed: budgetChecks.pass,
      violations: budgetChecks.violations,
    },
  };

  writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`  static/dist/manifest.json written (version ${swVersion})`);
}

if (isWatch) {
  await Promise.all([buildVendor(), buildReactWindowVendor(), buildZodVendor(), context(options).then(ctx => ctx.watch()), context(esmOptions).then(ctx => ctx.watch())]);

  console.log("Watching static/src/*.jsx, *.tsx, *.ts for changes\u2026");
  console.log("  IIFE \u2192 static/dist/");
  console.log("  ESM  \u2192 static/dist/esm/");
} else {
  await build(options);
  console.log(`Built ${entryPoints.length} files \u2192 ${outDir}/`);
  concatBundles();
  concatLazyChunks();
  await buildVendor();
  await buildReactWindowVendor();
  await buildZodVendor();
  await build(esmOptions);
  if (!isWatch) console.log(`Built ${Object.keys(ESM_ENTRY_MAP).length} ESM entries \u2192 ${outDir}/esm/`);
  if (!isWatch) console.log(``);
  applyContentHashes();
  lintCSS();

  const analysis = analyzeBundles();
  const budgetChecks = printAnalysis(analysis);
  writeManifest(analysis, budgetChecks);
  if (!budgetChecks.pass && process.env.CI) {
    console.error("❌ Bundle size budget exceeded. Optimize or increase budget.");
    process.exit(1);
  }
}
