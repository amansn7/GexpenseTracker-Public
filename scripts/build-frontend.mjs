#!/usr/bin/env node
// Pre-transpile JSX → JS. Removes 3MB browser Babel runtime.
// Run: node scripts/build-frontend.mjs
// Watch: node scripts/build-frontend.mjs --watch
//
// After building, concatenates individual IIFE outputs into 3 production
// bundles (mf-core.js, mf-views.js, mf-app.js), content-hashes every .js
// in static/dist/, and writes ?v= params to templates.

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

function hash(content) {
  return createHash("sha256").update(content).digest("hex").slice(0, 8);
}

// Dependency order for concatenation (files that need to load before others)
const BUNDLES = [
  {
    name: "mf-core",
    files: [
      "date-utils", "data", "icons", "focus-trap", "error-boundary",
      "keyboard-hint", "sound", "sync-progress", "settings-ui",
      "inbox-styles", "inbox-common", "shell",
    ],
  },
  {
    name: "mf-views",
    files: [
      "inbox-detail", "inbox-panels", "inbox",
      "flow", "health", "dashboard", "reports",
      "recurring", "debt", "goals", "budgets",
      "onboarding", "account", "admin",
    ],
  },
  { name: "mf-app", files: ["app"] },
];

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

function applyContentHashes() {
  const distFiles = [...BUNDLES.map((b) => `${b.name}.js`), "vendor/d3-sankey.js"];
  const hashMap = {};
  for (const f of distFiles) {
    const p = join(outDir, f);
    try {
      const content = readFileSync(p);
      hashMap[f] = hash(content);
    } catch {}
  }

  // Login template — only login-effects is needed
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

  // Index template — replace individual dist/*.js with bundles, keep vendor
  let html = readFileSync("templates/index.html", "utf8");
  // Remove individual dist/*.js script lines (not vendor/, not bundles)
  html = html.replace(/^\s*<script src="\/static\/dist\/[\w-]+\.js(?:\?v=[\w.-]+)?"><\/script>\s*$/gm, "");
  // Remove blank lines left by removal
  html = html.replace(/\n{3,}/g, "\n\n");
  // Insert bundle script tags before </body>
  const bundleTags = BUNDLES.map((b) => {
    const key = `${b.name}.js`;
    const v = hashMap[key] || "";
    return `  <script src="/static/dist/${b.name}.js${v ? `?v=${v}` : ""}"></script>`;
  }).join("\n");
  html = html.replace("</body>", `${bundleTags}\n</body>`);
  writeFileSync("templates/index.html", html);
  console.log(`  Updated templates/index.html with bundle script tags`);
}

if (watch) {
  await Promise.all([buildVendor(), context(options).then(ctx => ctx.watch())]);
  console.log("Watching static/src/*.jsx for changes…");
} else {
  await build(options);
  console.log(`Built ${files.length} files → ${outDir}/`);
  concatBundles();
  await buildVendor();
  applyContentHashes();
}
