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
  'helpers',        // 18 extra components not in source JSX files
  'filterbar',
  'money-flow',
  'screens-1',      // Dashboard + Transactions + Insights (original combined)
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

// Splice into index.html:
// Replace ALL <script type="text/babel"> blocks (may be duplicates from original hi-fi)
// with a single new bundle, keeping only the final ReactDOM.createRoot script.
let html = fs.readFileSync(HTML, 'utf8');

// START = the bundle script (plain <script> containing our compiled components)
// Try text/babel first (before first run), then plain script with our marker
const START = html.indexOf('<script type="text/babel"') !== -1
  ? html.indexOf('<script type="text/babel"')
  : html.indexOf('<script>\n// ===== COMPONENTS =====');

// END = start of the <script type="text/babel"> that contains ReactDOM.createRoot
const rdIdx  = html.indexOf('ReactDOM.createRoot');
const END    = html.lastIndexOf('<script', rdIdx); // last <script before ReactDOM.createRoot

if (START === -1 || END === -1 || START >= END) {
  console.error('ERROR: Cannot find script splice points', { START, END, rdIdx });
  process.exit(1);
}

console.log(`  Splicing: chars ${START}–${END} replaced with new bundle`);

// Bundle is already compiled by esbuild — use plain <script>, no Babel re-processing
let newHtml = html.slice(0, START)
  + `<script>\n// ===== COMPONENTS =====\n${bundle}\n</script>\n\n`
  + html.slice(END);

// Replace text/babel ReactDOM boot with plain script (Babel no longer needed)
newHtml = newHtml.replace(
  `<script type="text/babel" data-presets="react">\nReactDOM.createRoot(document.getElementById('root')).render(<App/>);\n</script>`,
  `<script>\nReactDOM.createRoot(document.getElementById('root')).render(React.createElement(window.App));\n</script>`
);

fs.writeFileSync(HTML, newHtml);

const saved = html.length - newHtml.length;
console.log(`\nDone — index.html updated (${newHtml.length} bytes, delta ${saved > 0 ? '-' : '+'}${Math.abs(saved)})`);
