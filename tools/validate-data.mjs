#!/usr/bin/env node
// 用法：node tools/validate-data.mjs <資料夾>
// 依 docs/41 規格檢查 data/*.json：結構、型別、列舉、id 重複、跨檔參照。有錯誤時結束碼為 1。
import { createRequire } from 'node:module';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const S = require(join(here, '..', 'js', 'schema.js'));

export function validateDir(dir) {
  const out = { errors: [], warnings: [], files: {}, checked: [] };
  if (!existsSync(dir)) { out.errors.push('找不到資料夾：' + dir); return out; }
  for (const name of S.FILES) {
    const path = join(dir, name + '.json');
    if (!existsSync(path)) { out.warnings.push(name + '.json 不存在（視為空）'); continue; }
    let obj;
    try { obj = JSON.parse(readFileSync(path, 'utf8')); }
    catch (e) { out.errors.push(name + '.json 不是有效的 JSON：' + e.message); continue; }
    out.files[name] = obj; out.checked.push(name);
    const r = S.validateFile(name, obj);
    out.errors.push(...r.errors); out.warnings.push(...r.warnings);
  }
  for (const f of readdirSync(dir)) {
    if (f.endsWith('.json') && !S.FILES.includes(f.replace(/\.json$/, ''))) out.warnings.push(f + ' 不是規格內的檔案，App 會忽略它');
  }
  out.warnings.push(...S.crossCheck(out.files));
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2];
  if (!dir) { console.error('用法：node tools/validate-data.mjs <資料夾>'); process.exit(2); }
  const r = validateDir(dir);
  for (const w of r.warnings) console.log('警告  ' + w);
  for (const e of r.errors) console.log('錯誤  ' + e);
  const counts = r.checked.map((n) => n + (r.files[n].records ? '(' + r.files[n].records.length + ')' : '')).join('、');
  console.log(`\n檢查了 ${r.checked.length} 個檔案：${counts}`);
  console.log(r.errors.length ? `未通過：${r.errors.length} 個錯誤、${r.warnings.length} 個警告` : `通過（${r.warnings.length} 個警告）`);
  process.exit(r.errors.length ? 1 : 0);
}
