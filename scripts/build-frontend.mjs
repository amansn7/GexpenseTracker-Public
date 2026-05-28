#!/usr/bin/env node
// Pre-transpile JSX → JS. Removes 3MB browser Babel runtime.
// Run: node scripts/build-frontend.mjs
// Watch: node scripts/build-frontend.mjs --watch
//
// After building, content-hashes every .js in static/dist/ and writes the
// first 8 hex chars as ?v= param in templates/index.html and login.html.

import { build, context } from "esbuild";
import { readdirSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { join, basename, relative } from "path";
import { createHash } from "crypto";

const watch = process.argv.includes("--watch");
const srcDir = "static/src";
const outDir = "static/dist";
const vendorDir = join(outDir, "vendor");

mkdirSync(outDir, { recursive: true });
mkdirSync(vendorDir, { recursive: true });

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

function walkDir(dir, prefix = "") {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    const full = join(dir, e.name);
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) files.push(...walkDir(full, rel));
    else files.push(rel);
  }
  return files;
}

function applyContentHashes() {
  const distFiles = walkDir(outDir).filter((f) => f.endsWith(".js"));
  const hashMap = {};
  for (const f of distFiles) {
    const content = readFileSync(join(outDir, f));
    const hash = createHash("sha256").update(content).digest("hex").slice(0, 8);
    hashMap[f] = hash;
  }

  for (const tmpl of ["templates/index.html", "templates/login.html"]) {
    let html = readFileSync(tmpl, "utf8");
    const original = html;
    html = html.replace(
      /(<script src="\/static\/dist\/([\w./-]+)\.js)(?:\?v=[\w.-]+)?(">)/g,
      (_match, prefix, name, suffix) => {
        const key = `${name}.js`;
        if (hashMap[key]) {
          return `${prefix}?v=${hashMap[key]}${suffix}`;
        }
        return _match;
      }
    );
    if (html !== original) {
      writeFileSync(tmpl, html);
      console.log(`  Updated ${tmpl} with content hashes`);
    } else {
      console.log(`  No changes needed for ${tmpl}`);
    }
  }
}

if (watch) {
  await Promise.all([buildVendor(), context(options).then(ctx => ctx.watch())]);
  console.log("Watching static/src/*.jsx for changes…");
} else {
  await build(options);
  console.log(`Built ${files.length} files → ${outDir}/`);
  await buildVendor();
  applyContentHashes();
}
