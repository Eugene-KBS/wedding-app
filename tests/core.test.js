const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const J = (f) => require(path.join(__dirname, '..', 'js', f));
const U = J('util.js'), S = J('schema.js'), M = J('merge.js'), C = J('calc.js'), Store = J('store-local.js'), GH = J('store-github.js'), Sync = J('sync.js');
const cfg = { owner: 'o', repo: 'r', branch: 'main', dir: 'data' };

const rec = (id, t, extra) => Object.assign({ id, updatedAt: t, updatedBy: 'E', deleted: false, title: id }, extra);

test('util: 中文 base64 來回', () => {
  const s = '婚禮手帳 ✓ 王小明，證婚 😀';
  assert.equal(U.b64ToUtf8(U.utf8ToB64(s)), s);
  assert.equal(U.b64ToUtf8(Buffer.from(s, 'utf8').toString('base64')), s);
  const big = '中'.repeat(50000);
  assert.equal(U.b64ToUtf8(U.utf8ToB64(big)), big);
});
test('util: CSV 解析（逗號、tab、引號、BOM）', () => {
  assert.deepEqual(U.parseCsv('﻿姓名,方,分組,人數\n王大華,男方,親戚,2\n"李, 阿姨",女方,"家人",1'), [['姓名','方','分組','人數'],['王大華','男方','親戚','2'],['李, 阿姨','女方','家人','1']]);
  assert.deepEqual(U.parseCsv('A\tB\tC\r\nD\tE\tF'), [['A','B','C'],['D','E','F']]);
  assert.equal(U.parseCsv(U.toCsv([['a,b', 'c"d', '中文']]))[0].join('|'), 'a,b|c"d|中文');
});
test('util: 日期與金額', () => {
  assert.equal(U.daysBetween('2026-11-16', '2027-05-15'), 180);
  assert.equal(U.weekday('2027-05-15'), '六');
  assert.equal(U.fmtMoney(1234567), 'NT$ 1,234,567');
  assert.equal(U.isDateStr('2027-02-30'), false);
});

test('merge: 聯集、較新者勝、墓碑保留', () => {
  const a = [rec('1', '2026-01-01T00:00:00Z'), rec('2', '2026-01-03T00:00:00Z', { title: 'new' })];
  const b = [rec('2', '2026-01-02T00:00:00Z', { title: 'old' }), rec('3', '2026-01-01T00:00:00Z')];
  const m = M.mergeRecords(a, b);
  assert.deepEqual(m.map(r => r.id), ['1', '2', '3']);
  assert.equal(m[1].title, 'new');
  const tomb = [rec('1', '2026-02-01T00:00:00Z', { deleted: true })];
  assert.equal(M.mergeRecords(a, tomb)[0].deleted, true);
  assert.equal(M.mergeRecords(tomb, a)[0].deleted, true);
  assert.equal(M.mergeRecords(a, tomb).length, 2 + 0);
});
test('merge: 時間相同結果與順序無關', () => {
  const x = rec('1', '2026-01-01T00:00:00Z', { title: 'x' }), y = rec('1', '2026-01-01T00:00:00Z', { title: 'y' });
  assert.deepEqual(M.mergeRecords([x], [y]), M.mergeRecords([y], [x]));
});
test('merge: meta 與 budget categories', () => {
  const m1 = { title: 'A', updatedAt: '2026-01-01T00:00:00Z' }, m2 = { title: 'B', updatedAt: '2026-01-02T00:00:00Z' };
  assert.equal(M.mergeFile('meta', m1, m2).title, 'B');
  assert.equal(M.mergeFile('meta', m2, m1).title, 'B');
  const local = { schemaVersion: 1, records: [], categories: [{ id: 'a', name: 'L' }, { id: 'c', name: 'only-local' }] };
  const remote = { schemaVersion: 1, records: [], categories: [{ id: 'a', name: 'R' }, { id: 'b', name: 'only-remote' }] };
  const pushed = M.mergeFile('budget', local, remote);
  assert.deepEqual(pushed.categories.map(c => c.id).sort(), ['a', 'b', 'c']);
  assert.equal(pushed.categories.find(c => c.id === 'a').name, 'L');
  const pulled = M.mergeFile('budget', local, remote, { localCatIds: [] });
  assert.equal(pulled.categories.find(c => c.id === 'a').name, 'R');
  const del = M.mergeFile('budget', { categories: [{ id: 'a', name: 'L', deleted: true }], records: [] }, remote, { localCatIds: [] });
  assert.equal(del.categories.find(c => c.id === 'a').deleted, true);
});

test('calc: 預算 已付／待付／未報價／剩餘／超支', () => {
  const budget = { records: [
    { id: '1', quote: 100000, payments: [{ amount: 30000 }, { amount: 20000 }] },
    { id: '2', quote: 5000, payments: [{ amount: 8000 }] },        // 超付：待付最小 0
    { id: '3', quote: null, payments: [{ amount: 1000 }] },        // 未報價但有付款：算已付
    { id: '4', quote: null, payments: [] },
    { id: '5', quote: 99999, payments: [], deleted: true },
    { id: '6', quote: 0, payments: [] }                             // 報價 0 ＝ 已報價
  ] };
  const s = C.budgetSummary(budget, { budgetTotal: 200000 });
  assert.equal(s.paid, 59000);
  assert.equal(s.pending, 50000);
  assert.equal(s.unquoted, 2);
  assert.equal(s.remaining, 200000 - 109000);
  assert.equal(s.over, 0);
  const o = C.budgetSummary(budget, { budgetTotal: 100000 });
  assert.equal(o.remaining, -9000); assert.equal(o.over, 9000);
  assert.equal(C.budgetSummary(budget, { budgetTotal: null }).remaining, null);
});
test('calc: 預算分類彙總', () => {
  const b = { categories: [{ id: 'a', name: 'A', allocation: 1000, order: 1 }, { id: 'x', name: 'X', allocation: null, order: 2, deleted: true }],
    records: [{ id: '1', categoryId: 'a', quote: 1500, payments: [{ amount: 500 }] }, { id: '2', categoryId: 'zzz', quote: 10, payments: [] }] };
  const r = C.categorySummaries(b);
  assert.equal(r.length, 2); assert.equal(r[0].spent, 1500); assert.equal(r[0].over, 500); assert.equal(r[1].name, '未分類');
});
test('calc: 賓客人數、三段、桌數', () => {
  const guests = { records: [
    { id: '1', side: 'groom', partySize: 2, status: '出席', ceremony: true, dinner: true, after: false },
    { id: '2', side: 'bride', partySize: 3, status: '已邀請', ceremony: false, dinner: true, after: true },
    { id: '3', side: 'bride', partySize: 4, status: '婉拒', ceremony: true, dinner: true, after: true },
    { id: '4', side: 'bride', partySize: 9, status: '出席', ceremony: true, dinner: true, after: true, deleted: true },
    { id: '5', side: 'groom', partySize: 6, status: '草擬', ceremony: false, dinner: true, after: false }
  ] };
  const s = C.guestSummary(guests, { perTable: 10 });
  assert.equal(s.total, 11); assert.equal(s.ceremony, 2); assert.equal(s.dinner, 11); assert.equal(s.after, 3);
  assert.equal(s.tables, 2); assert.equal(s.declined, 1);
  assert.equal(C.guestSummary(guests, { perTable: 11 }).tables, 1);
  assert.equal(C.guestSummary({ records: [] }, {}).tables, 0);
});
test('calc: 待辦到期狀態、分組、最近變更', () => {
  assert.equal(C.dueState('2026-11-10', '2026-11-16').state, 'overdue');
  assert.equal(C.dueState('2026-11-16', '2026-11-16').state, 'today');
  assert.equal(C.dueState('2026-11-20', '2026-11-16').state, 'soon');
  assert.equal(C.dueState(null, '2026-11-16').state, '');
  const g = C.groupTasksByMonth([{ id: 'a', due: '2027-02-01' }, { id: 'b' }, { id: 'c', due: '2026-12-31' }]);
  assert.deepEqual(g.map(x => x.key), ['2026-12', '2027-02', 'none']);
  const files = { tasks: { records: Array.from({ length: 6 }, (_, i) => rec('t' + i, `2026-01-0${i + 1}T00:00:00Z`)) },
    guests: { records: [{ id: 'g', name: 'G', updatedAt: '2026-02-01T00:00:00Z', updatedBy: 'S', deleted: false }, { id: 'g2', name: 'H', updatedAt: '2026-03-01T00:00:00Z', updatedBy: '婚顧', deleted: false }, { id: 'g3', name: 'I', updatedAt: '2026-01-15T00:00:00Z', updatedBy: 'E' }] } };
  const rc = C.recentChanges(files, 8);
  assert.equal(rc.length, 8); assert.equal(rc[0].id, 'g2'); assert.equal(rc[1].file, 'guests');
});

test('schema: 驗證', () => {
  const ok = S.validateFile('tasks', { schemaVersion: 1, records: [rec('1', '2026-01-01T00:00:00Z', { owner: 'E', due: '2026-12-01' })] });
  assert.deepEqual(ok.errors, []);
  const bad = S.validateFile('tasks', { schemaVersion: 1, records: [rec('1', 'x', { owner: 'X', due: '2026-13-01', updatedBy: 'Z' }), rec('1', '2026-01-01T00:00:00Z')] });
  assert.ok(bad.errors.length >= 5);
  assert.ok(S.validateFile('budget', { schemaVersion: 1, records: [] }).errors.some(e => /categories/.test(e)));
  assert.equal(S.validateFile('meta', S.emptyMeta()).errors.length, 0);
});

test('store: 變更、墓碑、待送、持久化', () => {
  const mem = U.makeStorage(null);
  const s = new Store({ ns: 'live', storage: mem });
  const r = s.upsert('tasks', { title: '買花' }, 'S');
  assert.equal(s.list('tasks').length, 1); assert.equal(s.pendingCount(), 1);
  s.upsert('tasks', { id: r.id, title: '買花束' }, 'E');
  assert.equal(s.pending.tasks[r.id].op, 'add');
  s.remove('tasks', r.id, 'E');
  assert.equal(s.list('tasks').length, 0); assert.equal(s.get('tasks').records.length, 1);
  s.restore('tasks', r.id, 'E'); assert.equal(s.list('tasks').length, 1);
  s.upsertCategory({ name: '場地', allocation: 1000 }, 'E');
  assert.equal(s.pendingCount(), 2);
  const s2 = new Store({ ns: 'live', storage: mem });
  assert.equal(s2.list('tasks').length, 1); assert.equal(s2.pendingCount(), 2);
  assert.equal(new Store({ ns: 'demo', storage: mem }).list('tasks').length, 0);   // 命名空間互不相通
});

/* ---- GitHub mock ---- */
function mockServer() {
  const files = {}; let shaN = 0; const log = []; const hooks = { failNextPut: null };
  const mk = (st, body, h) => ({ ok: st < 400, status: st, headers: { get: (k) => (h || {})[k.toLowerCase()] || null }, json: async () => body, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });
  const fetchImpl = async (url, init = {}) => {
    const method = init.method || 'GET'; log.push({ method, url, init });
    if (!/^Bearer tok/.test(init.headers.Authorization)) return mk(401, {});
    if (init.cache !== 'no-store') throw new Error('cache must be no-store');
    const u = new URL(url), p = u.pathname.replace('/repos/o/r', '');
    if (p === '' || p === '/') return mk(200, { permissions: { push: true } });
    if (p === '/contents/data') return mk(200, Object.keys(files).map(n => ({ name: n + '.json', sha: files[n].sha })));
    const name = (p.match(/\/contents\/data\/(.+)\.json$/) || [])[1];
    if (method === 'GET') {
      if (!files[name]) return mk(404, {});
      return mk(200, { encoding: 'base64', sha: files[name].sha, content: Buffer.from(files[name].text, 'utf8').toString('base64').replace(/(.{60})/g, '$1\n') });
    }
    const body = JSON.parse(init.body);
    if (hooks.failNextPut) { const f = hooks.failNextPut; hooks.failNextPut = null; f(); return mk(409, {}); }
    if ((files[name] && body.sha !== files[name].sha) || (!files[name] && body.sha)) return mk(files[name] ? 409 : 422, {});
    const sha = 'sha' + (++shaN);
    files[name] = { sha, text: Buffer.from(body.content, 'base64').toString('utf8'), message: body.message };
    return mk(200, { content: { sha } });
  };
  return { files, log, fetchImpl, hooks };
}
const gh = (srv, tok = 'tok') => new GH(cfg, tok, srv.fetchImpl);

test('github: 讀（含中文 base64、分行）、缺檔、列目錄', async () => {
  const srv = mockServer();
  srv.files.tasks = { sha: 'a1', text: JSON.stringify({ schemaVersion: 1, records: [{ id: '1', title: '訂場地：台南' }] }) };
  const r = await gh(srv).readFile('tasks');
  assert.equal(r.data.records[0].title, '訂場地：台南'); assert.equal(r.sha, 'a1');
  assert.equal((await gh(srv).readFile('guests')).status, 'missing');
  assert.deepEqual(await gh(srv).listDir(), { tasks: 'a1' });
  assert.ok(srv.log.every(l => /ref=main/.test(l.url) || l.url.endsWith('/r')));
});
test('github: 寫（建立、帶 sha 更新、中文來回）', async () => {
  const srv = mockServer(), g = gh(srv);
  const data = { schemaVersion: 1, records: [{ id: '1', title: '中文標題' }] };
  const w1 = await g.writeFile('tasks', data, undefined, 'app(E): tasks +1 ~0 -0');
  assert.ok(w1.sha);
  assert.equal(JSON.parse(srv.files.tasks.text).records[0].title, '中文標題');
  assert.equal(srv.files.tasks.message, 'app(E): tasks +1 ~0 -0');
  const w2 = await g.writeFile('tasks', data, w1.sha, 'm');
  assert.notEqual(w2.sha, w1.sha);
  await assert.rejects(g.writeFile('tasks', data, 'stale', 'm'), (e) => e.code === 'conflict');
});
test('github: 409 重試並逐筆合併', async () => {
  const srv = mockServer(), g = gh(srv);
  const base = { schemaVersion: 1, records: [rec('1', '2026-01-01T00:00:00Z', { title: '舊' })] };
  const w = await g.writeFile('tasks', base, undefined, 'init');
  // 對方在我們送出前改了檔案
  const theirs = { schemaVersion: 1, records: [rec('1', '2026-01-01T00:00:00Z', { title: '舊' }), rec('2', '2026-01-02T00:00:00Z', { title: '對方新增' })] };
  await g.writeFile('tasks', theirs, w.sha, 'theirs');
  const mine = { schemaVersion: 1, records: [rec('1', '2026-01-05T00:00:00Z', { title: '我改的' }), rec('3', '2026-01-05T00:00:00Z', { title: '我新增' })] };
  const r = await g.writeMerged('tasks', mine, { sha: w.sha, message: 'x' });
  assert.equal(r.retries, 1);
  const saved = JSON.parse(srv.files.tasks.text).records;
  assert.deepEqual(saved.map(x => x.id).sort(), ['1', '2', '3']);
  assert.equal(saved.find(x => x.id === '1').title, '我改的');
});
test('github: 最多重試 3 次後放棄；422（檔案已存在卻沒帶 sha）也會合併重試', async () => {
  const srv = mockServer(), g = gh(srv);
  srv.hooks.failNextPut = () => {};
  let n = 0;
  const orig = srv.fetchImpl;
  const always = new GH(cfg, 'tok', async (u, i) => (i && i.method === 'PUT' ? (n++, { ok: false, status: 409, headers: { get: () => null }, json: async () => ({}) }) : orig(u, i)));
  srv.hooks.failNextPut = null;
  await g.writeFile('tasks', { schemaVersion: 1, records: [] }, undefined, 'i');
  await assert.rejects(always.writeMerged('tasks', { schemaVersion: 1, records: [] }, { sha: 'x' }), (e) => e.code === 'conflict');
  assert.equal(n, 4);
  const r = await g.writeMerged('tasks', { schemaVersion: 1, records: [rec('9', '2026-01-01T00:00:00Z')] }, { sha: undefined, message: 'm' });
  assert.equal(r.retries, 1);
});
test('github: 連線測試的錯誤說明', async () => {
  const srv = mockServer();
  srv.files.meta = { sha: 'm1', text: JSON.stringify(Object.assign(S.emptyMeta(), { title: '示範婚禮' })) };
  const ok = await gh(srv).testConnection();
  assert.equal(ok.ok, true); assert.equal(ok.meta.title, '示範婚禮');
  const bad = await gh(srv, 'wrong').testConnection();
  assert.equal(bad.ok, false); assert.equal(bad.code, 'auth'); assert.match(bad.message, /Token/);
  assert.equal((await gh(srv, '').testConnection()).code, 'notoken');
  const net = await new GH(cfg, 'tok', async () => { throw new TypeError('x'); }).testConnection();
  assert.equal(net.code, 'network'); assert.match(net.message, /網路|Wi-Fi/);
  const f403 = await new GH(cfg, 'tok', async () => ({ ok: false, status: 403, headers: { get: () => null } })).testConnection();
  assert.equal(f403.code, 'forbidden'); assert.match(f403.message, /Contents/);
  const f404 = await new GH(cfg, 'tok', async () => ({ ok: false, status: 404, headers: { get: () => null } })).testConnection();
  assert.equal(f404.code, 'notfound');
});

test('sync: 推送、清除待送、離線保留、拉取合併', async () => {
  const srv = mockServer(), mem = U.makeStorage(null);
  const st = new Store({ ns: 'live', storage: mem });
  let online = false;
  const sy = new Sync(st, gh(srv), { who: 'S', pushDelayMs: 0, isOnline: () => online });
  st.upsert('tasks', { title: '離線新增' }, 'S');
  await sy.push();
  assert.equal(sy.getStatus().status, 'offline'); assert.equal(st.pendingCount(), 1);
  assert.equal(srv.files.tasks, undefined);
  online = true;
  await sy.push();
  assert.equal(st.pendingCount(), 0); assert.equal(sy.getStatus().status, 'synced');
  assert.match(srv.files.tasks.message, /^app\(S\): tasks \+1 ~0 -0$/);
  // 另一端改了資料 → 拉取
  const other = JSON.parse(srv.files.tasks.text);
  other.records.push(rec('zz', '2030-01-01T00:00:00Z', { title: '對方' }));
  await gh(srv).writeFile('tasks', other, srv.files.tasks.sha, 'o');
  await sy.pull();
  assert.equal(st.list('tasks').length, 2);
  // 修改 + 刪除 → 訊息
  const id = st.list('tasks')[0].id;
  st.upsert('tasks', { id, title: '改' }, 'S'); st.remove('tasks', 'zz', 'S');
  await sy.push();
  assert.match(srv.files.tasks.message, /tasks \+0 ~1 -1/);
  // 不會把示範資料寫進 GitHub：live 空間不含 demo 資料
  assert.equal(srv.files.guests, undefined);
});
