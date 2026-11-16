#!/usr/bin/env node
// 用法：node tools/build-preview.mjs <資料夾> <輸出.html>
// 把外殼（HTML、CSS、全部 JS）與指定資料打包成單一 HTML：
// 不需伺服器、不註冊 service worker、不發出任何 fetch，變更只存在記憶體；頂端固定顯示「預覽模式」。
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const app = resolve(here, '..');
const S = createRequire(import.meta.url)(join(app, 'js', 'schema.js'));
const [dataDir, outFile] = process.argv.slice(2);
if (!dataDir || !outFile) { console.error('用法：node tools/build-preview.mjs <資料夾> <輸出.html>'); process.exit(2); }

const files = {};
for (const n of S.FILES) {
  const p = join(dataDir, n + '.json');
  if (existsSync(p)) files[n] = JSON.parse(readFileSync(p, 'utf8'));
}
const safe = (s) => s.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');
const png = (f) => 'data:image/png;base64,' + readFileSync(join(app, 'icons', f)).toString('base64');

let html = readFileSync(join(app, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
const css = readFileSync(join(app, 'css', 'app.css'), 'utf8');
const data = JSON.stringify({ builtAt: new Date().toISOString(), files }).replace(/</g, '\\u003c');

html = html.replace(/<link rel="manifest"[^>]*>\s*/, '')
  .replace(/<link rel="apple-touch-icon"[^>]*>/, `<link rel="apple-touch-icon" href="${png('apple-touch-icon.png')}">`)
  .replace(/<link rel="icon"[^>]*>/, `<link rel="icon" type="image/png" href="${png('icon-192.png')}">`)
  .replace(/<link rel="stylesheet" href="css\/app.css">/, () => `<style>\n${css}\n</style>`)
  .replace(/<script src="[^"]+"><\/script>\s*/g, '');
const bundle = `<script>window.WAPP_PREVIEW = ${data};</script>\n` + scripts.map((s) => `<script>\n/* ${s} */\n${safe(readFileSync(join(app, s), 'utf8'))}\n</script>`).join('\n');
html = html.replace('</body>', () => bundle + '\n</body>');
writeFileSync(outFile, html);
const counts = Object.entries(files).map(([k, v]) => k + (v.records ? '(' + v.records.length + ')' : '')).join('、');
console.log(`已產生 ${outFile}（${(html.length / 1024).toFixed(0)} KB）；資料：${counts}`);
