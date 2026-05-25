#!/usr/bin/env node
// Pre-transpile JSX → JS. Removes 3MB browser Babel runtime.
// Run: node scripts/build-frontend.mjs
// Watch: node scripts/build-frontend.mjs --watch
//
// After building, content-hashes every .js in static/dist/ and writes the
// first 8 hex chars as ?v= param in templates/index.html and login.html.

import { build, context } from "esbuild";
import { readdirSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join, basename } from "path";
import { createHash } from "crypto";

const watch = process.argv.includes("--watch");
const srcDir = "static/src";
const outDir = "static/dist";

mkdirSync(outDir, { recursive: true });

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

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log("Watching static/src/*.jsx for changes…");
} else {
  await build(options);
  console.log(`Built ${files.length} files → ${outDir}/`);
  applyContentHashes();
}

function applyContentHashes() {
  const distFiles = readdirSync(outDir).filter((f) => f.endsWith(".js"));
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
      /(<script src="\/static\/dist\/([\w.-]+)\.js)(?:\?v=[\w.-]+)?(">)/g,
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
