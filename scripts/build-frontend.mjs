#!/usr/bin/env node
// Pre-transpile JSX → JS. Removes 3MB browser Babel runtime.
// Run: node scripts/build-frontend.mjs
// Watch: node scripts/build-frontend.mjs --watch

import { build, context } from "esbuild";
import { readdirSync, mkdirSync } from "fs";
import { join, basename } from "path";

const watch = process.argv.includes("--watch");
const srcDir = "static/src";
const outDir = "static/dist";

mkdirSync(outDir, { recursive: true });

const files = readdirSync(srcDir).filter((f) => f.endsWith(".jsx"));
const entryPoints = files.map((f) => join(srcDir, f));

const options = {
  entryPoints,
  outdir: outDir,
  // esbuild won't produce .jsx output; rename entrypoints to .js
  // by supplying a custom outfile per entry (handled via outdir + .jsx→.js rename)
  // esbuild already outputs .js for .jsx inputs automatically
  format: "iife",
  bundle: false,           // No bundling — keep sequential global loading
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
}
