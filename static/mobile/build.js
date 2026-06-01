#!/usr/bin/env node
/**
 * Rebuilds static/mobile/index.html from static/mobile/src/*.jsx source files.
 * Uses esbuild (already a project dep) for JSX → JS transpilation.
 *
 * Usage (from project root):
 *   node static/mobile/build.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname);
const SRC  = path.join(ROOT, 'src');
const HTML = path.join(ROOT, 'index.html');

// Load order matters — later files can reference earlier globals
const ORDER = [
  'components',
  'filterbar',
  'money-flow',
  'dashboard',
  'transactions',
  'insights',
  'screens-2',
  'budgets',
  'screens-detail',
  'screens-extra',
  'screens-more',
  'app',
];

function transpile(file) {
  const src = fs.readFileSync(file, 'utf8');
  // Write to temp file (esbuild reads from file for better error messages)
  const tmp = `/tmp/_gx_${path.basename(file)}`;
  fs.writeFileSync(tmp, src);
  const result = execSync(
    `node_modules/.bin/esbuild "${tmp}" --target=es2019 --platform=browser`,
    { cwd: path.join(ROOT, '../..') } // project root
  ).toString();
  fs.unlinkSync(tmp);
  return result;
}

let bundle = '';
for (const name of ORDER) {
  const file = path.join(SRC, `${name}.jsx`);
  if (!fs.existsSync(file)) { console.log(`  SKIP (missing): ${name}.jsx`); continue; }
  console.log(`  Transpiling ${name}.jsx...`);
  const code = transpile(file);
  bundle += `\n/* ===== ${name} ===== */\n${code}\n`;
}

// Splice into index.html — replace the big compiled text/babel script block
let html = fs.readFileSync(HTML, 'utf8');

// The big script block: first <script type="text/babel" ...> that contains component code
// End marker: the final small script that just calls ReactDOM.createRoot
const START_MARKER = '<script type="text/babel" data-presets="react">\n// ===';
const END_MARKER   = '\n</script>\n\n<script type="text/babel" data-presets="react">\nReactDOM.createRoot';
const START = html.indexOf(START_MARKER);
const END   = html.indexOf(END_MARKER);

if (START === -1 || END === -1) {
  // Fallback: find any large text/babel block before ReactDOM.createRoot
  const rdIdx = html.lastIndexOf('ReactDOM.createRoot');
  const endScript = html.lastIndexOf('</script>', rdIdx);
  const startScript = html.lastIndexOf('<script', endScript - 1);
  if (startScript === -1) { console.error('ERROR: Cannot find script splice points'); process.exit(1); }
  console.warn('Using fallback splice points:', startScript, endScript + 9);
  const newHtml2 = html.slice(0, startScript)
    + `<script type="text/babel" data-presets="react">\n// ===== COMPONENTS =====\n${bundle}\n`
    + html.slice(endScript + 9);
  fs.writeFileSync(HTML, newHtml2);
  const saved2 = html.length - newHtml2.length;
  console.log(`Done (fallback) — index.html updated (${newHtml2.length} bytes, delta ${saved2 > 0 ? '-' : '+'}${Math.abs(saved2)})`);
  process.exit(0);
}

const newHtml = html.slice(0, START)
  + `<script type="text/babel" data-presets="react">\n// ===== COMPONENTS =====\n${bundle}\n`
  + html.slice(END);
fs.writeFileSync(HTML, newHtml);

const saved = html.length - newHtml.length;
console.log(`\nDone — index.html updated (${newHtml.length} bytes, delta ${saved > 0 ? '-' : '+'}${Math.abs(saved)})`);
