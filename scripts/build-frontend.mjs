#!/usr/bin/env node
// Pre-transpile JSX → JS. Removes 3MB browser Babel runtime.
// Run: node scripts/build-frontend.mjs
// Watch: node scripts/build-frontend.mjs --watch
//
// After building, concatenates individual IIFE outputs into 2 production
// bundles (mf-core.js, mf-app.js) + individual per-view chunks, content-hashes
// every .js in static/dist/, and writes ?v= params to templates.

import { build, context } from "esbuild";
import { readdirSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";

const watch = process.argv.includes("--watch");
const srcDir = "static/src";
const outDir = "static/dist";
const vendorDir = join(outDir, "vendor");

mkDir(outDir);
mkDir(vendorDir);

function mkDir(d) { mkdirSync(d, { recursive: true }); }

const files = readdirSync(srcDir).filter((f) => f.endsWith(".jsx"));
const entryPoints = files.map((f) => join(srcDir, f));

const options = {
  entryPoints,
  outdir: outDir,
  format: "iife",
  bundle: false,
  platform: "browser",
  jsx: "transform",
  jsxFactory: "React.createElement",
  jsxFragment: "React.Fragment",
  target: ["es2017"],
  minify: !watch,
  logLevel: "info",
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
    minify: !watch,
    logLevel: watch ? "silent" : "info",
  });
  if (!watch) console.log("  vendor/d3-sankey.js  (global `d3Sankey`)");
}

async function buildReactWindowVendor() {
  const pkg = join("node_modules", "react-window", "dist", "react-window.js");
  if (!existsSync(pkg)) {
    if (!watch) console.log("  Skipping react-window (not found)");
    return;
  }
  await build({
    entryPoints: [pkg],
    outfile: join(vendorDir, "react-window.js"),
    format: "iife",
    bundle: true,
    globalName: "ReactWindow",
    target: ["es2017"],
    minify: !watch,
    logLevel: watch ? "silent" : "info",
  });
  if (!watch) console.log("  vendor/react-window.js  (global `ReactWindow`)");
}

function hash(content) {
  return createHash("sha256").update(content).digest("hex").slice(0, 8);
}

// Core bundles (always loaded)
const BUNDLES = [
  {
    name: "mf-core",
    files: [
      "date-utils", "data", "icons", "focus-trap", "error-boundary",
      "keyboard-hint", "sound", "sync-progress", "settings-ui",
      "inbox-styles", "inbox-common", "contexts", "shell",
    ],
  },
  { name: "mf-app", files: ["app"] },
];

// Lazy chunks: per-view chunks loaded on demand.
// Each chunk is one or more IIFE files concatenated together.
// The first file in the array runs first (dependency order).
// Views map: the view names (used in app.jsx) that this chunk serves.
const LAZY_CHUNKS = {
  "inbox":        { files: ["inbox-detail", "inbox-panels", "inbox"],      views: ["inbox", "search", "review"] },
  "flow":         { files: ["flow"],                                       views: ["flow", "picture"] },
  "dashboard":    { files: ["dashboard"],                                  views: ["dashboard", "today"] },
  "health":       { files: ["health"],                                     views: ["health"] },
  "reports":      { files: ["reports"],                                    views: ["reports"] },
  "recurring":    { files: ["recurring"],                                  views: ["recurring"] },
  "debt":         { files: ["debt"],                                       views: ["debt"] },
  "goals":        { files: ["goals"],                                      views: ["goals"] },
  "budgets":      { files: ["budgets"],                                    views: ["budgets"] },
  "account":      { files: ["account-admin", "account"],                   views: ["profile", "settings"] },
  "admin":        { files: ["admin"],                                      views: ["admin"] },
  "onboarding":   { files: ["onboarding"],                                 views: ["onboarding"] },
};

function concatBundles() {
  for (const bundle of BUNDLES) {
    const parts = bundle.files.map((f) => {
      const p = join(outDir, `${f}.js`);
      try { return readFileSync(p, "utf8"); } catch { return ""; }
    });
    const combined = parts.join("\n");
    writeFileSync(join(outDir, `${bundle.name}.js`), combined);
    if (!watch) console.log(`  ${bundle.name}.js  (${(combined.length / 1024).toFixed(1)}kb)`);
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
    if (!watch) console.log(`  ${name}.js  (${(combined.length / 1024).toFixed(1)}kb)`);
  }
}

function applyContentHashes() {
  // Collect all distributed files to hash
  const distFiles = [
    ...BUNDLES.map((b) => `${b.name}.js`),
    ...Object.keys(LAZY_CHUNKS).map((name) => `${name}.js`),
    "vendor/d3-sankey.js",
    "vendor/react-window.js",
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

  // Index template
  let html = readFileSync("templates/index.html", "utf8");

  // Remove individual dist/*.js script lines (not vendor/, not bundles)
  html = html.replace(/^\s*<script src="\/static\/dist\/[\w-]+\.js(?:\?v=[\w.-]+)?"><\/script>\s*$/gm, "");
  // Remove old chunk manifest inline scripts from previous builds
  html = html.replace(/^\s*<script[^>]*>window\.__mfChunks=.*?<\/script>\s*$/gm, "");
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

  // Insert: manifest first (for app.jsx chunk loader), then bundles before </body>
  html = html.replace("</body>", `${manifestScript}\n${bundleTags}\n</body>`);
  writeFileSync("templates/index.html", html);
  console.log(`  Updated templates/index.html with chunk manifest + bundles`);
}

if (watch) {
  await Promise.all([buildVendor(), buildReactWindowVendor(), context(options).then(ctx => ctx.watch())]);
  console.log("Watching static/src/*.jsx for changes…");
} else {
  await build(options);
  console.log(`Built ${files.length} files → ${outDir}/`);
  concatBundles();
  concatLazyChunks();
  await buildVendor();
  await buildReactWindowVendor();
  applyContentHashes();
}
