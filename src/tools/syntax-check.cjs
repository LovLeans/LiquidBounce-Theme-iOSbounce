// Usage (from the folder that CONTAINS src/):  node src/tools/syntax-check.cjs
// Parses every .ts / .js file and every <script> block of every .svelte file with esbuild. It finds syntax errors only (no types, no
// Svelte compile errors): a cheap check for when `npm run build` is not available.
let esbuild;
try { esbuild = require('esbuild'); } catch { esbuild = require('/opt/npm-tools/node_modules/esbuild'); }
const fs = require('fs'), path = require('path');
function walk(d, out=[]) { for (const f of fs.readdirSync(d)) { const p = path.join(d,f); const s = fs.statSync(p); if (s.isDirectory()) walk(p,out); else out.push(p);} return out; }
let bad = 0, checked = 0;
for (const f of walk('src')) {
  let blocks = [];
  if (/\.(ts|js)$/.test(f) && !f.endsWith('.d.ts')) blocks.push({code: fs.readFileSync(f,'utf8'), loader: f.endsWith('.ts')?'ts':'js', label:f});
  else if (f.endsWith('.svelte')) {
    const src = fs.readFileSync(f,'utf8');
    const re = /<script([^>]*)>([\s\S]*?)<\/script>/g; let m;
    while ((m = re.exec(src))) blocks.push({code: m[2], loader: /lang="ts"/.test(m[1])?'ts':'js', label:f});
  }
  for (const b of blocks) {
    checked++;
    try { esbuild.transformSync(b.code, {loader: b.loader, sourcemap:false}); }
    catch (e) { bad++; console.log('SYNTAX ERROR', b.label, '\n  ', (e.errors&&e.errors[0]&&(e.errors[0].text+' @ line '+e.errors[0].location.line))||e.message); }
  }
}
console.log('checked', checked, 'blocks; errors:', bad);
