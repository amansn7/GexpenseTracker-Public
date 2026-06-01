#!/usr/bin/env bash
# Rebuilds static/mobile/index.html from src/*.jsx source files
# Usage: cd <project-root> && bash static/mobile/build.sh

set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
SRC="$ROOT/src"
TEMPLATE="$ROOT/index.html"

# Order: components first (defines GxAPI), then screens, then app shell
FILES=(
  components
  dashboard
  transactions
  insights
  money-flow
  filterbar
  screens-2
  budgets
  screens-detail
  screens-extra
  screens-more
  app
)

# Validate Babel is installed
if ! command -v npx &>/dev/null; then
  echo "npx not found — install Node.js"; exit 1
fi

# Transpile all JSX files with Babel
BUNDLE=""
for name in "${FILES[@]}"; do
  FILE="$SRC/$name.jsx"
  if [ ! -f "$FILE" ]; then
    echo "SKIP (missing): $FILE"
    continue
  fi
  echo "Transpiling $name.jsx..."
  CODE=$(npx --yes @babel/core@7 --presets @babel/preset-react --no-babelrc "$FILE" 2>/dev/null || \
         node -e "
const babel=require('@babel/standalone');
const fs=require('fs');
const src=fs.readFileSync('$FILE','utf8');
console.log(babel.transform(src,{presets:['react']}).code);
")
  BUNDLE+=$'\n/* ===== '"$name"' ===== */\n'"$CODE"$'\n'
done

# Find script block boundaries in index.html and replace
START_MARKER='<script>'$'\n\n/* ===== components ===== */'
END_MARKER='</script>'$'\n<script type="text/babel" data-presets="react">'$'\n''ReactDOM.createRoot'

HTML=$(cat "$TEMPLATE")
START_IDX=$(python3 -c "
import sys
html=open('$TEMPLATE').read()
idx=html.find('<script>\n\n/* ===== components ===== */')
print(idx)
")
END_IDX=$(python3 -c "
import sys
html=open('$TEMPLATE').read()
idx=html.find('</script>\n<script type=\"text/babel\" data-presets=\"react\">\nReactDOM.createRoot')
print(idx)
")

echo "Splicing bundle into index.html (start=$START_IDX, end=$END_IDX)..."

python3 -c "
import sys
html = open('$TEMPLATE').read()
start = html.find('<script>\n\n/* ===== components ===== */')
end   = html.find('</script>\n<script type=\"text/babel\" data-presets=\"react\">\nReactDOM.createRoot')
bundle = open('/tmp/_gx_bundle.js').read()
new_html = html[:start] + '<script>\n' + bundle + '\n' + html[end:]
open('$TEMPLATE','w').write(new_html)
print('Done — index.html updated')
"
